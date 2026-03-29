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
	TOAST_PAGE_TIMEOUT,
	type CoffeeShopConfig
} from '$lib/config/coffee';
import type { Browser } from 'puppeteer-core';

/**
 * Extract cappuccino price from Toast's window.__OO_STATE__ structured data.
 *
 * The OO_STATE object contains menu data keyed by "Menu:<id>".
 * Each menu has groups, and each group has items with names and prices.
 * Prices are in dollars (not cents).
 */
export function extractPriceFromState(state: Record<string, any>, itemName: string): number | null {
	if (!state) return null;

	// Find menu keys
	const menuKeys = Object.keys(state).filter(k => k.startsWith('Menu:'));

	for (const menuKey of menuKeys) {
		const menu = state[menuKey];
		if (!menu?.groups) continue;

		for (const group of menu.groups) {
			if (!group?.items) continue;
			for (const item of group.items) {
				if (item?.name?.toLowerCase().includes(itemName.toLowerCase())) {
					if (Array.isArray(item.prices) && item.prices.length > 0) {
						return item.prices[0];
					}
				}
			}
		}
	}

	return null;
}

/**
 * Extract cappuccino price from page text content (for non-Toast shops).
 *
 * Handles multiple text formats:
 *   - "Cappuccino$5.25" (no space)
 *   - "Cappuccino $5.25" (space before $)
 *   - "Cappuccino\n$5.25" (price on next line)
 *
 * Returns null if no cappuccino line found.
 */
export function extractCappuccinoPrice(text: string): number | null {
	if (!text) return null;

	const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Pattern 1: "Cappuccino$5.25" or "Cappuccino $5.25" on same line
		const sameLineMatch = line.match(/cappuccino\s*\$(\d+(?:\.\d{1,2})?)/i);
		if (sameLineMatch) {
			return parseFloat(sameLineMatch[1]);
		}

		// Pattern 2: "Cappuccino" on one line, "$5.25" on next line
		if (/^cappuccino$/i.test(line) && i + 1 < lines.length) {
			const nextLine = lines[i + 1];
			const priceMatch = nextLine.match(/^\$(\d+(?:\.\d{1,2})?)$/);
			if (priceMatch) {
				return parseFloat(priceMatch[1]);
			}
		}
	}

	return null;
}

/** Compute median of a number array. Returns null for empty array. */
export function computeMedian(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
	}
	return sorted[mid];
}

/** Build a CoffeeSnapshot from a list of scraped shops */
export function buildSnapshot(shops: CoffeeShop[]): CoffeeSnapshot {
	const prices = shops
		.filter((s) => s.price !== null)
		.map((s) => s.price!);

	return {
		timestamp: new Date().toISOString(),
		shopCount: shops.length,
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
		await page.setUserAgent(
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
		);

		await page.goto(shop.url, {
			waitUntil: 'networkidle0',
			timeout: TOAST_PAGE_TIMEOUT
		});

		// Wait for Toast React SPA to hydrate and populate __OO_STATE__
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Extract the __OO_STATE__ object from the window
		const ooState = await page.evaluate(() => {
			return (window as any).__OO_STATE__ ?? null;
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
		updateTime: new Date().toISOString()
	};
}

/** Scrape Firehouse Coffee Squarespace menu page */
async function scrapeFirehouse(
	browser: Browser,
	shop: CoffeeShopConfig
): Promise<CoffeeShop> {
	const page = await browser.newPage();
	let price: number | null = null;

	try {
		await page.goto(shop.url, {
			waitUntil: 'domcontentloaded',
			timeout: TOAST_PAGE_TIMEOUT
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const text = await page.evaluate(() => document.body.innerText);
		price = extractCappuccinoPrice(text);

		if (price === null) {
			console.warn(`[cappuccino] No cappuccino price found at ${shop.id}`);
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
		source: 'html',
		updateTime: new Date().toISOString()
	};
}

/** Scrape Fox & Kit from DoorDash page */
async function scrapeDelivery(
	browser: Browser,
	shop: CoffeeShopConfig
): Promise<CoffeeShop> {
	const page = await browser.newPage();
	let price: number | null = null;

	try {
		await page.setUserAgent(
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
		);

		await page.goto(shop.url, {
			waitUntil: 'networkidle0',
			timeout: TOAST_PAGE_TIMEOUT
		});

		await new Promise((resolve) => setTimeout(resolve, 3000));

		const text = await page.evaluate(() => document.body.innerText);
		price = extractCappuccinoPrice(text);

		if (price === null) {
			console.warn(`[cappuccino] No cappuccino price found at ${shop.id}`);
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
		source: 'delivery',
		updateTime: new Date().toISOString()
	};
}

/** Scrape Philz for the alt drink (pour-over) price */
async function scrapePhilz(
	browser: Browser,
	shop: CoffeeShopConfig
): Promise<CoffeeShop> {
	const page = await browser.newPage();
	let altPrice: number | null = null;

	try {
		await page.goto(shop.url, {
			waitUntil: 'domcontentloaded',
			timeout: TOAST_PAGE_TIMEOUT
		});

		await new Promise((resolve) => setTimeout(resolve, 2000));

		const text = await page.evaluate(() => document.body.innerText);

		// Look for Tesora or similar pour-over price
		const tesoraMatch = text.match(/tesora\s*\$(\d+(?:\.\d{1,2})?)/i);
		if (tesoraMatch) {
			altPrice = parseFloat(tesoraMatch[1]);
		} else {
			// Fallback: look for any pour-over price
			const pourOverMatch = text.match(/pour[\s-]?over\s*\$(\d+(?:\.\d{1,2})?)/i);
			if (pourOverMatch) {
				altPrice = parseFloat(pourOverMatch[1]);
			}
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
		price: null,
		source: 'html',
		altDrink: shop.altDrink,
		altPrice: altPrice ?? undefined,
		updateTime: new Date().toISOString()
	};
}

/**
 * Scrape cappuccino prices from all configured coffee shops.
 *
 * Launches a single browser instance using @sparticuz/chromium + puppeteer-core,
 * scrapes all shops sequentially (to avoid rate-limiting), then returns a snapshot.
 */
export async function scrapeCappuccino(): Promise<CoffeeSnapshot> {
	const browser = await launchBrowser();

	try {
		const results: CoffeeShop[] = [];

		for (const shop of COFFEE_SHOPS) {
			if (shop.source === 'toast') {
				results.push(await scrapeToastShop(browser, shop));
			} else if (shop.id === 'philz-corte-madera') {
				results.push(await scrapePhilz(browser, shop));
			} else if (shop.source === 'html') {
				results.push(await scrapeFirehouse(browser, shop));
			} else if (shop.source === 'delivery') {
				results.push(await scrapeDelivery(browser, shop));
			}

			// Small delay between requests to be polite
			await new Promise((resolve) => setTimeout(resolve, 1500));
		}

		return buildSnapshot(results);
	} finally {
		await browser.close();
	}
}
