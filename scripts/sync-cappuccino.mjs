#!/usr/bin/env node

/**
 * Standalone scraper for Marin Cappuccino Index data.
 * Runs in GitHub Actions (or locally) — no SvelteKit dependencies.
 *
 * Uses Playwright (full, not @sparticuz/chromium) for Toast shop scraping.
 *
 * Replicates the logic from src/lib/server/scrapers/cappuccino.ts
 * and the blob persistence from src/routes/api/cron/sync-cappuccino/+server.ts.
 */

import { put, head } from '@vercel/blob';
import { chromium } from 'playwright';
import {
	COFFEE_SHOPS_DATA as COFFEE_SHOPS,
	CAPPUCCINO_HARDCODED_PRICES as HARDCODED_PRICES,
	CAPPUCCINO_MIN_FRESH_LIVE_RATIO,
	CAPPUCCINO_USER_AGENT
} from '../src/lib/config/coffee.shared.js';
import {
	computeMedian,
	extractCappuccinoPrice,
	extractPriceFromState,
	hasFreshCoffeeCoverage,
	mergeCoffeeShopWithFallback,
	summarizeCoffeeShops,
	toCoffeeHistoryEntry
} from '../src/lib/server/scrapers/cappuccino.shared.js';
import { readSuccessfulScrapeAt } from './shared/scrape-metadata.mjs';

// ---- Config (shared with src/lib/config/coffee.ts) ----

const BLOB_KEY = 'marin-cappuccino.json';
const MAX_HISTORY = 52;
const TOAST_PAGE_TIMEOUT = 15000;
const TOAST_SHOPS = COFFEE_SHOPS.filter(
	(shop) => shop.source === 'toast' && !(shop.id in HARDCODED_PRICES)
);
const SHOP_ORDER = new Map(COFFEE_SHOPS.map((shop, index) => [shop.id, index]));

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
	console.error('[sync-cappuccino] BLOB_READ_WRITE_TOKEN not set');
	process.exit(1);
}

// ---- Helpers (shared with src/lib/server/scrapers/cappuccino.ts) ----

function buildSnapshot(shops, lastSuccessfulScrapeAt) {
	const prices = shops.filter((shop) => shop.price !== null).map((shop) => shop.price);
	const metrics = summarizeCoffeeShops(shops);

	return {
		timestamp: new Date().toISOString(),
		lastSuccessfulScrapeAt,
		shopCount: shops.length,
		pricedShopCount: metrics.pricedShopCount,
		liveShopCount: metrics.liveShopCount,
		fallbackShopCount: metrics.fallbackShopCount,
		hardcodedShopCount: metrics.hardcodedShopCount,
		medianPrice: computeMedian(prices),
		avgPrice:
			prices.length > 0
				? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100
				: null,
		minPrice: prices.length > 0 ? Math.min(...prices) : null,
		maxPrice: prices.length > 0 ? Math.max(...prices) : null,
		shops
	};
}

function buildUnavailableResult(shop) {
	return {
		id: shop.id,
		name: shop.name,
		address: shop.address,
		town: shop.town,
		lat: shop.lat,
		lon: shop.lon,
		price: null,
		source: 'toast',
		priceSource: 'unavailable',
		isStale: true,
		updateTime: new Date().toISOString()
	};
}

// ---- Toast scraping with Playwright ----

async function scrapeToastShop(browser, shop) {
	const context = await browser.newContext({
		userAgent: CAPPUCCINO_USER_AGENT
	});
	const page = await context.newPage();
	let price = null;

	try {
		await page.goto(shop.url, {
			waitUntil: 'domcontentloaded',
			timeout: TOAST_PAGE_TIMEOUT
		});

		// Wait for Toast React SPA to hydrate and populate __OO_STATE__
		await page
			.waitForFunction(
				() => {
					const state = window.__OO_STATE__;
					return state && Object.keys(state).length > 1;
				},
				{ timeout: TOAST_PAGE_TIMEOUT }
			)
			.catch(() => {
				// If state never populates, continue with what we have
			});

		// Extract __OO_STATE__ from the window
		const ooState = await page.evaluate(() => {
			return window.__OO_STATE__ ?? null;
		});

		if (ooState) {
			price = extractPriceFromState(ooState, 'cappuccino');
		}

		if (price === null) {
			// Fallback: try innerText extraction
			const text = await page.evaluate(() => document.body.innerText);
			price = extractCappuccinoPrice(text);
		}

		if (price === null) {
			console.warn(`[cappuccino] No cappuccino price found at ${shop.id} (${shop.url})`);
		}
	} catch (err) {
		console.error(`[cappuccino] Failed to scrape ${shop.id}:`, err.message);
	} finally {
		await context.close();
	}

	return {
		id: shop.id,
		name: shop.name,
		address: shop.address,
		town: shop.town,
		lat: shop.lat,
		lon: shop.lon,
		price,
		source: 'toast',
		priceSource: price !== null ? 'live' : 'unavailable',
		isStale: price === null,
		updateTime: new Date().toISOString()
	};
}

function buildHardcodedResult(shop) {
	const data = HARDCODED_PRICES[shop.id];
	return {
		id: shop.id,
		name: shop.name,
		address: shop.address,
		town: shop.town,
		lat: shop.lat,
		lon: shop.lon,
		price: data?.price ?? null,
		source: shop.source,
		altDrink: shop.altDrink,
		altPrice: data?.altPrice,
		priceSource: 'hardcoded',
		isStale: false,
		updateTime: new Date().toISOString()
	};
}

// ---- Main ----

async function main() {
	const start = Date.now();
	console.log('[sync-cappuccino] Starting...');

	// 1. Read existing blob first so transient scrape failures can fall back to
	// the previous known shop price instead of blanking the index.
	let existing = { current: null, history: [] };
	try {
		const blob = await head(BLOB_KEY, { token });
		const res = await fetch(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (res.ok) {
			existing = await res.json();
		}
	} catch {
		console.log('[sync-cappuccino] No existing blob, starting fresh');
	}

	const previousShopsById = new Map((existing.current?.shops ?? []).map((shop) => [shop.id, shop]));
	const results = [];

	// 2. Add hardcoded non-Toast shops
	for (const shop of COFFEE_SHOPS) {
		if (shop.id in HARDCODED_PRICES) {
			results.push(buildHardcodedResult(shop));
			console.log(`[cappuccino] ${shop.id}: using hardcoded price`);
		}
	}

	// 3. Scrape Toast shops via Playwright, preserving the previous known
	// price per shop when a live request fails or returns nothing.
	if (TOAST_SHOPS.length > 0) {
		const browser = await chromium.launch({ headless: true });

		try {
			for (const shop of TOAST_SHOPS) {
				try {
					const result = await scrapeToastShop(browser, shop);
					results.push(mergeCoffeeShopWithFallback(result, previousShopsById.get(shop.id) ?? null));
				} catch (err) {
					console.error(`[cappuccino] Shop ${shop.id} failed (isolated):`, err.message);
					results.push(
						mergeCoffeeShopWithFallback(
							buildUnavailableResult(shop),
							previousShopsById.get(shop.id) ?? null
						)
					);
				}

				// Delay between requests
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		} finally {
			await browser.close();
		}
	}

	results.sort((a, b) => (SHOP_ORDER.get(a.id) ?? 0) - (SHOP_ORDER.get(b.id) ?? 0));

	const metrics = summarizeCoffeeShops(results);
	const freshCoverage = hasFreshCoffeeCoverage(
		metrics.liveShopCount,
		TOAST_SHOPS.length,
		CAPPUCCINO_MIN_FRESH_LIVE_RATIO
	);
	const lastSuccessfulScrapeAt = freshCoverage
		? new Date().toISOString()
		: readSuccessfulScrapeAt(existing.current);
	const snapshot = buildSnapshot(results, lastSuccessfulScrapeAt);

	// 4. Write updated blob. Only advance chart history when live coverage is
	// meaningfully fresh, otherwise retain the previous history verbatim.
	const history = (
		freshCoverage || !existing.current
			? [toCoffeeHistoryEntry(snapshot), ...existing.history]
			: existing.history
	).slice(0, MAX_HISTORY);
	const data = { current: snapshot, history };

	await put(BLOB_KEY, JSON.stringify(data), {
		access: 'private',
		contentType: 'application/json',
		addRandomSuffix: false,
		allowOverwrite: true,
		token
	});

	console.log(
		`[sync-cappuccino] OK: ${snapshot.pricedShopCount}/${snapshot.shopCount} shops priced, ` +
			`${snapshot.liveShopCount}/${TOAST_SHOPS.length} live Toast, ` +
			`${snapshot.fallbackShopCount ?? 0} fallback, median $${snapshot.medianPrice?.toFixed(2) ?? 'N/A'} ` +
			`(${freshCoverage ? 'fresh' : 'stale-preserved'}) in ${Date.now() - start}ms`
	);
}

main().catch((err) => {
	console.error('[sync-cappuccino] FATAL:', err);
	process.exit(1);
});
