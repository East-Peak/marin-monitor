// src/lib/server/scrapers/cappuccino.ts

/**
 * Server-side scraper for cappuccino prices across Marin coffee shops.
 *
 * Uses @sparticuz/chromium + puppeteer-core (Vercel serverless compatible).
 *
 * Toast shops: extracts prices from window.__OO_STATE__ structured JSON.
 * Other shops: extracts prices from page innerText via regex.
 */

import type { CoffeeShop, CoffeeSnapshot } from '$lib/types/coffee';
import {
	COFFEE_SHOPS,
	CAPPUCCINO_HARDCODED_PRICE_MAP,
	CAPPUCCINO_MIN_FRESH_LIVE_RATIO,
	CAPPUCCINO_USER_AGENT,
	TOAST_SHOPS,
	TOAST_PAGE_TIMEOUT,
	type CoffeeShopConfig
} from '$lib/config/coffee';
import { withSuccessfulScrapeMetadata } from '$lib/server/scrape-metadata';
import type { Browser } from 'puppeteer-core';
import {
	computeMedian,
	extractCappuccinoPrice,
	extractPriceFromState,
	hasFreshCoffeeCoverage,
	summarizeCoffeeShops
} from './cappuccino.shared.js';

export {
	computeMedian,
	extractCappuccinoPrice,
	extractPriceFromState,
	mergeCoffeeShopWithFallback
} from './cappuccino.shared.js';

/**
 * Extract cappuccino price from Toast's window.__OO_STATE__ structured data.
 *
 * The OO_STATE object contains menu data keyed by "Menu:<id>".
 * Each menu has groups, and each group has items with names and prices.
 * Prices are in dollars (not cents).
/** Build a CoffeeSnapshot from a list of scraped shops */
export function buildSnapshot(shops: CoffeeShop[]): CoffeeSnapshot {
	const prices = shops
		.filter((s) => s.price !== null)
		.map((s) => s.price!);
	const metrics = summarizeCoffeeShops(shops);
	const timestamp = new Date().toISOString();
	const hasFreshCoverage = hasFreshCoffeeCoverage(
		metrics.liveShopCount,
		TOAST_SHOPS.length,
		CAPPUCCINO_MIN_FRESH_LIVE_RATIO
	);

	return withSuccessfulScrapeMetadata({
		timestamp,
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
	}, hasFreshCoverage ? timestamp : null);
}

function buildUnavailableResult(shop: CoffeeShopConfig): CoffeeShop {
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

/** Launch a puppeteer-core browser using @sparticuz/chromium */
async function launchBrowser(): Promise<Browser> {
	const chromium = (await import('@sparticuz/chromium')).default;
	const puppeteer = (await import('puppeteer-core')).default;

	return puppeteer.launch({
		args: chromium.args,
		defaultViewport: { width: 1920, height: 1080 },
		executablePath: await chromium.executablePath(),
		headless: true
	});
}

/** Scrape a single Toast page — extract __OO_STATE__ for structured price data */
async function scrapeToastShop(
	browser: Browser,
	shop: CoffeeShopConfig
): Promise<CoffeeShop> {
	const page = await browser.newPage();
	let price: number | null = null;

	try {
		await page.setUserAgent(CAPPUCCINO_USER_AGENT);

		await page.goto(shop.url, {
			waitUntil: 'domcontentloaded',
			timeout: TOAST_PAGE_TIMEOUT
		});

		await page
			.waitForFunction(() => {
				const w = window as Window & { __OO_STATE__?: Record<string, unknown> };
				const state = w.__OO_STATE__;
				return state && Object.keys(state).length > 1;
			}, { timeout: TOAST_PAGE_TIMEOUT })
			.catch(() => {
				// Continue with text fallback if the structured state never hydrates.
			});

		// Extract the __OO_STATE__ object from the window
		const ooState = await page.evaluate(() => {
			const w = window as Window & { __OO_STATE__?: Record<string, unknown> };
			return w.__OO_STATE__ ?? null;
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
		console.error(`[cappuccino] Failed to scrape ${shop.id}:`, (err as Error).message);
	} finally {
		await page.close();
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

/**
 * Hardcoded prices for non-Toast shops that change very rarely.
 * These avoid expensive browser scraping of Squarespace/DoorDash/Philz pages.
 * Prices should be spot-checked monthly and updated if they drift.
 */
function buildHardcodedResult(shop: CoffeeShopConfig): CoffeeShop {
	const data = CAPPUCCINO_HARDCODED_PRICE_MAP[shop.id];
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
		updateTime: new Date().toISOString()
	};
}

/**
 * Scrape cappuccino prices from all configured coffee shops.
 *
 * Toast shops (8): scraped via @sparticuz/chromium + puppeteer-core.
 * Non-Toast shops (3): use hardcoded prices to avoid timeouts.
 *
 * Each shop scrape is wrapped in its own try/catch so one failure
 * does not kill the entire job.
 */
export async function scrapeCappuccino(): Promise<CoffeeSnapshot> {
	const results: CoffeeShop[] = [];
	const shopOrder = new Map(COFFEE_SHOPS.map((shop, index) => [shop.id, index]));

	// 1. Add hardcoded non-Toast shops (no browser needed)
	for (const shop of COFFEE_SHOPS) {
		if (shop.id in CAPPUCCINO_HARDCODED_PRICE_MAP) {
			results.push(buildHardcodedResult(shop));
			console.log(`[cappuccino] ${shop.id}: using hardcoded price`);
		}
	}

	// 2. Scrape Toast shops via browser
	const toastShops = COFFEE_SHOPS.filter(
		(s) => s.source === 'toast' && !(s.id in CAPPUCCINO_HARDCODED_PRICE_MAP)
	);

	if (toastShops.length > 0) {
		const browser = await launchBrowser();

		try {
			for (const shop of toastShops) {
				try {
					const result = await scrapeToastShop(browser, shop);
					results.push(result);
				} catch (err) {
					console.error(
						`[cappuccino] Shop ${shop.id} failed (isolated):`,
						(err as Error).message
					);
					// Push a null-price result so the shop still appears in output
					results.push(buildUnavailableResult(shop));
				}

				// Reduced delay between requests (was 1500ms)
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		} finally {
			await browser.close();
		}
	}

	results.sort((a, b) => (shopOrder.get(a.id) ?? 0) - (shopOrder.get(b.id) ?? 0));
	return buildSnapshot(results);
}
