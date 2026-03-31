#!/usr/bin/env node

/**
 * Standalone scraper for the Marin coffee index.
 * Runs in GitHub Actions (or locally) and writes a generic multi-drink blob.
 */

import { head, put } from '@vercel/blob';
import { chromium } from 'playwright';
import {
	CAPPUCCINO_USER_AGENT,
	COFFEE_INDEX_NAME_DATA,
	COFFEE_PRIMARY_DRINK_ID,
	COFFEE_INDEX_DRINKS_DATA as COFFEE_DRINKS,
	COFFEE_INDEX_FALLBACK_PRICES as HARD_CODED_FALLBACK_PRICES,
	COFFEE_INDEX_MIN_FRESH_LIVE_MENU_RATIO,
	COFFEE_SHOPS_DATA as COFFEE_SHOPS
} from '../src/lib/config/coffee.shared.js';
import {
	buildCoffeeIndexSnapshot,
	extractDrinkPricesFromItems,
	extractDrinkPricesFromState,
	extractDrinkPricesFromText,
	hasFreshCoffeeIndexCoverage,
	mergeShopDrinkPrices,
	summarizeMenuCoverage,
	toCoffeeIndexHistoryEntry
} from '../src/lib/server/scrapers/coffee-index.shared.js';
import { readSuccessfulScrapeAt } from './shared/scrape-metadata.mjs';

const BLOB_KEY = 'marin-coffee-index.json';
const LEGACY_CAPPUCCINO_BLOB_KEY = 'marin-cappuccino.json';
const INDEX_NAME = COFFEE_INDEX_NAME_DATA;
const PRIMARY_DRINK = COFFEE_PRIMARY_DRINK_ID;
const MAX_HISTORY = 52;
const PAGE_TIMEOUT = 15000;
const REQUEST_DELAY_MS = 500;
const dryRun = process.env.COFFEE_INDEX_DRY_RUN === '1';
const token = process.env.BLOB_READ_WRITE_TOKEN;
const SHOP_ORDER = new Map(COFFEE_SHOPS.map((shop, index) => [shop.id, index]));
const DRINKS_BY_ID = new Map(COFFEE_DRINKS.map((drink) => [drink.id, drink]));
const LIVE_PRICE_ELIGIBLE_SHOPS = COFFEE_SHOPS.filter(
	(shop) => shop.supportsLivePriceScrape !== false
);
const LIVE_PRICE_ELIGIBLE_SHOP_COUNT = LIVE_PRICE_ELIGIBLE_SHOPS.length;

if (!token && !dryRun) {
	console.error('[sync-coffee-index] BLOB_READ_WRITE_TOKEN not set');
	process.exit(1);
}

async function readBlobJson(key) {
	if (!token) return null;

	try {
		const blob = await head(key, { token });
		const response = await fetch(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (response.ok) {
			return await response.json();
		}
	} catch {
		// Blob not found or temporarily unavailable.
	}

	return null;
}

function normalizeLegacyCappuccinoShop(shop) {
	const cappuccino = DRINKS_BY_ID.get('cappuccino');
	const prices = {};

	if (cappuccino && typeof shop?.price === 'number' && Number.isFinite(shop.price)) {
		prices.cappuccino = {
			drinkId: 'cappuccino',
			label: cappuccino.label,
			price: shop.price,
			priceSource: shop.priceSource ?? 'fallback',
			updateTime: shop.updateTime ?? new Date().toISOString(),
			isStale: shop.isStale ?? false,
			matchedName: null
		};
	}

	return {
		id: shop.id,
		name: shop.name,
		address: shop.address,
		town: shop.town,
		lat: shop.lat,
		lon: shop.lon,
		source: shop.source,
		prices
	};
}

function buildEmptyShopResult(shop) {
	return {
		id: shop.id,
		name: shop.name,
		address: shop.address,
		town: shop.town,
		lat: shop.lat,
		lon: shop.lon,
		source: shop.source,
		prices: {}
	};
}

function mergeLiveAndFallbackPrices(shop, livePrices, previousShop, updateTime) {
	return {
		id: shop.id,
		name: shop.name,
		address: shop.address,
		town: shop.town,
		lat: shop.lat,
		lon: shop.lon,
		source: shop.source,
		prices: mergeShopDrinkPrices(
			COFFEE_DRINKS,
			livePrices,
			previousShop?.prices,
			HARD_CODED_FALLBACK_PRICES[shop.id],
			updateTime
		)
	};
}

async function scrapeShop(browser, shop) {
	const context = await browser.newContext({
		userAgent: CAPPUCCINO_USER_AGENT
	});
	const page = await context.newPage();
	const updateTime = new Date().toISOString();
	let livePrices = {};

	try {
		await page.goto(shop.url, {
			waitUntil: 'domcontentloaded',
			timeout: PAGE_TIMEOUT
		});

		if (shop.source === 'toast') {
			await page
				.waitForFunction(() => {
					const state = window.__OO_STATE__;
					return state && Object.keys(state).length > 1;
				}, { timeout: PAGE_TIMEOUT })
				.catch(() => {
					// Continue with text fallback if Toast never hydrates fully.
				});
		}

		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
			// Some storefronts stream requests indefinitely; innerText is still useful.
		});
		await page.waitForTimeout(750);

		let statePrices = {};
		if (shop.source === 'toast') {
			const ooState = await page.evaluate(() => window.__OO_STATE__ ?? null);
			if (ooState) {
				statePrices = extractDrinkPricesFromState(ooState, COFFEE_DRINKS, updateTime);
			}
		}

		const structuredItems =
			shop.source === 'html'
				? await page.evaluate(() =>
						Array.from(document.querySelectorAll('.menu-item'))
							.map((item) => {
								const name =
									item.querySelector('.menu-item-title')?.textContent?.trim() ?? null;
								const priceText =
									item
										.querySelector('.menu-item-price-top, .menu-item-price-bottom')
										?.textContent?.trim() ?? '';
								const prices = Array.from(priceText.matchAll(/\$(\d+(?:\.\d{1,2})?)/g))
									.map((match) => Number.parseFloat(match[1]))
									.filter((price) => Number.isFinite(price) && price > 0);

								return {
									name,
									prices
								};
							})
							.filter((item) => item.name && item.prices.length > 0)
					)
				: [];
		const structuredPrices =
			structuredItems.length > 0
				? extractDrinkPricesFromItems(structuredItems, COFFEE_DRINKS, updateTime)
				: {};

		const text = await page.evaluate(() => document.body.innerText ?? '');
		const textPrices = extractDrinkPricesFromText(text, COFFEE_DRINKS, updateTime);

		livePrices = {
			...textPrices,
			...structuredPrices,
			...statePrices
		};

		if (Object.keys(livePrices).length === 0) {
			console.warn(`[coffee-index] No tracked drink prices found at ${shop.id} (${shop.url})`);
		}
	} catch (error) {
		console.error(`[coffee-index] Failed to scrape ${shop.id}:`, error.message);
	} finally {
		await context.close();
	}

	return {
		...buildEmptyShopResult(shop),
		prices: livePrices
	};
}

async function main() {
	const start = Date.now();
	console.log('[sync-coffee-index] Starting...');

	const existing =
		(await readBlobJson(BLOB_KEY)) ?? {
			current: null,
			history: []
		};
	const legacyCappuccino =
		existing.current === null ? await readBlobJson(LEGACY_CAPPUCCINO_BLOB_KEY) : null;
	const previousShops = existing.current?.shops?.length
		? existing.current.shops
		: (legacyCappuccino?.current?.shops ?? []).map(normalizeLegacyCappuccinoShop);
	const previousShopsById = new Map(previousShops.map((shop) => [shop.id, shop]));
	const browser = await chromium.launch({ headless: true });
	const results = [];

	try {
		for (const shop of COFFEE_SHOPS) {
			const previousShop = previousShopsById.get(shop.id) ?? null;
			if (shop.supportsLivePriceScrape === false) {
				if (shop.fallbackReason) {
					console.log(`[coffee-index] Using curated fallback for ${shop.id}: ${shop.fallbackReason}`);
				}
				const mergedShop = mergeLiveAndFallbackPrices(
					shop,
					{},
					previousShop,
					new Date().toISOString()
				);
				if (Object.keys(mergedShop.prices).length === 0) {
					console.warn(
						`[coffee-index] ${shop.id} has no live scrape path and no fallback prices configured`
					);
				}
				results.push(mergedShop);
				continue;
			}

			try {
				const scrapedShop = await scrapeShop(browser, shop);
				const mergedShop = mergeLiveAndFallbackPrices(
					shop,
					scrapedShop.prices,
					previousShop,
					new Date().toISOString()
				);
				if (Object.keys(mergedShop.prices).length === 0) {
					console.warn(`[coffee-index] ${shop.id} produced no live or fallback prices`);
				}
				results.push(mergedShop);
			} catch (error) {
				console.error(`[coffee-index] Shop ${shop.id} failed (isolated):`, error.message);
				const mergedShop = mergeLiveAndFallbackPrices(
					shop,
					{},
					previousShop,
					new Date().toISOString()
				);
				if (Object.keys(mergedShop.prices).length === 0) {
					console.warn(`[coffee-index] ${shop.id} still has no fallback prices after scrape failure`);
				}
				results.push(mergedShop);
			}

			await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
		}
	} finally {
		await browser.close();
	}

	results.sort((a, b) => (SHOP_ORDER.get(a.id) ?? 0) - (SHOP_ORDER.get(b.id) ?? 0));

	const coverage = summarizeMenuCoverage(results);
	const freshCoverage = hasFreshCoffeeIndexCoverage(
		coverage.liveMenuShopCount,
		LIVE_PRICE_ELIGIBLE_SHOP_COUNT,
		COFFEE_INDEX_MIN_FRESH_LIVE_MENU_RATIO
	);
	const snapshot = buildCoffeeIndexSnapshot({
		indexName: INDEX_NAME,
		primaryDrink: PRIMARY_DRINK,
		drinks: COFFEE_DRINKS,
		shops: results,
		lastSuccessfulScrapeAt: null,
		liveMenuEligibleShopCount: LIVE_PRICE_ELIGIBLE_SHOP_COUNT
	});

	snapshot.lastSuccessfulScrapeAt = freshCoverage
		? snapshot.timestamp
		: readSuccessfulScrapeAt(existing.current);

	const shouldAppendHistory = freshCoverage || (!existing.current && snapshot.pricedShopCount > 0);
	const history = (shouldAppendHistory
		? [toCoffeeIndexHistoryEntry(snapshot), ...(existing.history ?? [])]
		: (existing.history ?? [])
	).slice(0, MAX_HISTORY);
	const data = {
		current: snapshot,
		history
	};

	if (dryRun) {
		console.log('[sync-coffee-index] Dry run enabled; skipping blob write');
	} else {
		await put(BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token
		});
	}

	const summary = COFFEE_DRINKS.map((drink) => {
		const drinkSummary = snapshot.drinks[drink.id];
		return `${drink.id}:${drinkSummary.pricedShopCount}`;
	}).join(', ');

	console.log(
		`[sync-coffee-index] OK: ${snapshot.pricedShopCount}/${snapshot.shopCount} shops priced, ` +
			`${snapshot.liveMenuShopCount}/${snapshot.liveMenuEligibleShopCount} live menus, ` +
			`${snapshot.primaryDrinkSummary.label} median $${snapshot.primaryDrinkSummary.medianPrice?.toFixed(2) ?? 'N/A'}, ` +
			`drinks {${summary}} (${freshCoverage ? 'fresh' : 'stale-preserved'}) in ${Date.now() - start}ms`
	);
}

main().catch((error) => {
	console.error('[sync-coffee-index] FATAL:', error);
	process.exit(1);
});
