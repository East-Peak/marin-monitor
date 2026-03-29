// src/lib/server/scrapers/cappuccino.ts

/**
 * Server-side Playwright scraper for cappuccino prices across Marin coffee shops.
 *
 * Scrapes Toast online ordering pages (7 shops), one Squarespace HTML menu,
 * and one DoorDash delivery listing. Computes aggregate statistics.
 */

import type { CoffeeShop, CoffeeSnapshot } from '$lib/types/coffee';
import {
	COFFEE_SHOPS,
	TOAST_PAGE_TIMEOUT,
	type CoffeeShopConfig
} from '$lib/config/coffee';

/**
 * Extract cappuccino price from page text content.
 *
 * Handles multiple Toast text formats:
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

/** Scrape a single Toast page using Playwright */
async function scrapeToastShop(
	browser: import('playwright').Browser,
	shop: CoffeeShopConfig
): Promise<CoffeeShop> {
	const context = await browser.newContext({
		userAgent:
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
	});

	const page = await context.newPage();
	let price: number | null = null;

	try {
		await page.goto(shop.url, {
			waitUntil: 'networkidle',
			timeout: TOAST_PAGE_TIMEOUT
		});

		// Wait for menu items to render (Toast is a React SPA)
		await page.waitForTimeout(3000);

		// Get all visible text from the page
		const text = await page.evaluate(() => document.body.innerText);
		price = extractCappuccinoPrice(text);

		if (price === null) {
			console.warn(`[cappuccino] No cappuccino price found at ${shop.id} (${shop.url})`);
		}
	} catch (err) {
		console.error(`[cappuccino] Failed to scrape ${shop.id}:`, (err as Error).message);
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
		updateTime: new Date().toISOString()
	};
}

/** Scrape Firehouse Coffee Squarespace menu page */
async function scrapeFirehouse(
	browser: import('playwright').Browser,
	shop: CoffeeShopConfig
): Promise<CoffeeShop> {
	const context = await browser.newContext();
	const page = await context.newPage();
	let price: number | null = null;

	try {
		await page.goto(shop.url, {
			waitUntil: 'domcontentloaded',
			timeout: TOAST_PAGE_TIMEOUT
		});

		await page.waitForTimeout(2000);

		const text = await page.evaluate(() => document.body.innerText);
		price = extractCappuccinoPrice(text);

		if (price === null) {
			console.warn(`[cappuccino] No cappuccino price found at ${shop.id}`);
		}
	} catch (err) {
		console.error(`[cappuccino] Failed to scrape ${shop.id}:`, (err as Error).message);
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
		source: 'html',
		updateTime: new Date().toISOString()
	};
}

/** Scrape Fox & Kit from DoorDash page */
async function scrapeDelivery(
	browser: import('playwright').Browser,
	shop: CoffeeShopConfig
): Promise<CoffeeShop> {
	const context = await browser.newContext({
		userAgent:
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
	});

	const page = await context.newPage();
	let price: number | null = null;

	try {
		await page.goto(shop.url, {
			waitUntil: 'networkidle',
			timeout: TOAST_PAGE_TIMEOUT
		});

		await page.waitForTimeout(3000);

		const text = await page.evaluate(() => document.body.innerText);
		price = extractCappuccinoPrice(text);

		if (price === null) {
			console.warn(`[cappuccino] No cappuccino price found at ${shop.id}`);
		}
	} catch (err) {
		console.error(`[cappuccino] Failed to scrape ${shop.id}:`, (err as Error).message);
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
		source: 'delivery',
		updateTime: new Date().toISOString()
	};
}

/** Scrape Philz for the alt drink (pour-over) price */
async function scrapePhilz(
	browser: import('playwright').Browser,
	shop: CoffeeShopConfig
): Promise<CoffeeShop> {
	const context = await browser.newContext();
	const page = await context.newPage();
	let altPrice: number | null = null;

	try {
		await page.goto(shop.url, {
			waitUntil: 'domcontentloaded',
			timeout: TOAST_PAGE_TIMEOUT
		});

		await page.waitForTimeout(2000);

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
		await context.close();
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
 * Launches a single Playwright browser instance, scrapes all shops
 * sequentially (to avoid rate-limiting), then returns a snapshot.
 */
export async function scrapeCappuccino(): Promise<CoffeeSnapshot> {
	const { chromium } = await import('playwright');
	const browser = await chromium.launch({ headless: true });

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
