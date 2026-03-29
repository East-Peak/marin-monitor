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

// ---- Config (from src/lib/config/coffee.ts) ----

const BLOB_KEY = 'marin-cappuccino.json';
const MAX_HISTORY = 52;
const TOAST_PAGE_TIMEOUT = 15000;

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const COFFEE_SHOPS = [
	{
		id: 'equator-mill-valley',
		name: 'Equator Coffees',
		address: '2 Miller Ave, Mill Valley',
		town: 'Mill Valley',
		lat: 37.906,
		lon: -122.548,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-miller-ave',
		hasCappuccino: true
	},
	{
		id: 'equator-proof-lab',
		name: 'Equator Coffees (Proof Lab)',
		address: '244 Shoreline Hwy, Mill Valley',
		town: 'Mill Valley',
		lat: 37.872,
		lon: -122.527,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-proof-lab',
		hasCappuccino: true
	},
	{
		id: 'equator-larkspur',
		name: 'Equator Coffees',
		address: 'Marin Country Mart, Larkspur',
		town: 'Larkspur',
		lat: 37.941,
		lon: -122.535,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-larkspur',
		hasCappuccino: true
	},
	{
		id: 'equator-sausalito',
		name: 'Equator Coffees',
		address: '1201 Bridgeway, Sausalito',
		town: 'Sausalito',
		lat: 37.859,
		lon: -122.485,
		source: 'toast',
		url: 'https://order.toasttab.com/online/sausalito-equator',
		hasCappuccino: true
	},
	{
		id: 'equator-roundhouse',
		name: 'Equator Coffees (Roundhouse)',
		address: 'Golden Gate Bridge Plaza',
		town: 'Sausalito',
		lat: 37.8079,
		lon: -122.4745,
		source: 'toast',
		url: 'https://order.toasttab.com/online/equator-coffees-roundhouse-golden-gate-bridge-plaza',
		hasCappuccino: true
	},
	{
		id: 'mcr-san-anselmo',
		name: 'Marin Coffee Roasters',
		address: '546 San Anselmo Ave, San Anselmo',
		town: 'San Anselmo',
		lat: 37.9748,
		lon: -122.5617,
		source: 'toast',
		url: 'https://order.toasttab.com/online/marin-coffee-roasters-san-anselmo-546-san-anselmo-ave',
		hasCappuccino: true
	},
	{
		id: 'mcr-ignacio',
		name: 'Marin Coffee Roasters',
		address: '466 Ignacio Blvd, Novato',
		town: 'Novato',
		lat: 38.066,
		lon: -122.533,
		source: 'toast',
		url: 'https://order.toasttab.com/online/marin-coffee-roasters-ignacio-466-ignacio-blvd',
		hasCappuccino: true
	},
	{
		id: 'mcr-novato',
		name: 'Marin Coffee Roasters (Drive-Thru)',
		address: '1551 S Novato Blvd, Novato',
		town: 'Novato',
		lat: 38.086,
		lon: -122.57,
		source: 'toast',
		url: 'https://order.toasttab.com/online/marin-coffee-roasters-drive-through-1551-s-novato-blvd',
		hasCappuccino: true
	},
	{
		id: 'firehouse-sausalito',
		name: 'Firehouse Coffee & Tea',
		address: '44 Caledonia St, Sausalito',
		town: 'Sausalito',
		lat: 37.859,
		lon: -122.487,
		source: 'html',
		url: 'https://www.firehousecoffeeandtea.com/menu',
		hasCappuccino: true
	},
	{
		id: 'fox-kit-san-rafael',
		name: 'Fox & Kit',
		address: '917 4th St, San Rafael',
		town: 'San Rafael',
		lat: 37.9735,
		lon: -122.515,
		source: 'delivery',
		url: 'https://www.doordash.com/store/fox-kit-san-rafael-27819798/',
		hasCappuccino: true
	},
	{
		id: 'philz-corte-madera',
		name: 'Philz Coffee',
		address: 'Town Center, Corte Madera',
		town: 'Corte Madera',
		lat: 37.925,
		lon: -122.524,
		source: 'html',
		url: 'https://philzcoffee.order.online/',
		hasCappuccino: false,
		altDrink: 'Pour-Over (Tesora)'
	}
];

/**
 * Hardcoded prices for non-Toast shops that change very rarely.
 * Matches src/lib/server/scrapers/cappuccino.ts.
 */
const HARDCODED_PRICES = {
	'firehouse-sausalito': { price: 5.5, source: 'hardcoded' },
	'fox-kit-san-rafael': { price: 5.5, source: 'hardcoded' },
	'philz-corte-madera': { price: null, altPrice: 5.75, source: 'hardcoded' }
};

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
	console.error('[sync-cappuccino] BLOB_READ_WRITE_TOKEN not set');
	process.exit(1);
}

// ---- Helpers (from src/lib/server/scrapers/cappuccino.ts) ----

function extractPriceFromState(state, itemName) {
	if (!state) return null;

	const menuKeys = Object.keys(state).filter((k) => k.startsWith('Menu:'));

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

function extractCappuccinoPrice(text) {
	if (!text) return null;

	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

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

function computeMedian(values) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
	}
	return sorted[mid];
}

function buildSnapshot(shops) {
	const prices = shops.filter((s) => s.price !== null).map((s) => s.price);

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

// ---- Toast scraping with Playwright ----

async function scrapeToastShop(browser, shop) {
	const context = await browser.newContext({
		userAgent: USER_AGENT
	});
	const page = await context.newPage();
	let price = null;

	try {
		await page.goto(shop.url, {
			waitUntil: 'networkidle',
			timeout: TOAST_PAGE_TIMEOUT
		});

		// Wait for Toast React SPA to hydrate
		await page.waitForTimeout(3000);

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
		updateTime: new Date().toISOString()
	};
}

// ---- Strip shops from history entries ----

function toHistoryEntry(snapshot) {
	return {
		timestamp: snapshot.timestamp,
		shopCount: snapshot.shopCount,
		medianPrice: snapshot.medianPrice,
		avgPrice: snapshot.avgPrice,
		minPrice: snapshot.minPrice,
		maxPrice: snapshot.maxPrice,
		shops: []
	};
}

// ---- Main ----

async function main() {
	const start = Date.now();
	console.log('[sync-cappuccino] Starting...');

	const results = [];

	// 1. Add hardcoded non-Toast shops
	for (const shop of COFFEE_SHOPS) {
		if (shop.id in HARDCODED_PRICES) {
			results.push(buildHardcodedResult(shop));
			console.log(`[cappuccino] ${shop.id}: using hardcoded price`);
		}
	}

	// 2. Scrape Toast shops via Playwright
	const toastShops = COFFEE_SHOPS.filter(
		(s) => s.source === 'toast' && !(s.id in HARDCODED_PRICES)
	);

	if (toastShops.length > 0) {
		const browser = await chromium.launch({ headless: true });

		try {
			for (const shop of toastShops) {
				try {
					const result = await scrapeToastShop(browser, shop);
					results.push(result);
				} catch (err) {
					console.error(`[cappuccino] Shop ${shop.id} failed (isolated):`, err.message);
					results.push({
						id: shop.id,
						name: shop.name,
						address: shop.address,
						town: shop.town,
						lat: shop.lat,
						lon: shop.lon,
						price: null,
						source: 'toast',
						updateTime: new Date().toISOString()
					});
				}

				// Delay between requests
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		} finally {
			await browser.close();
		}
	}

	const snapshot = buildSnapshot(results);

	// 3. Read existing blob
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

	// 4. Write updated blob
	const history = [toHistoryEntry(snapshot), ...existing.history].slice(0, MAX_HISTORY);
	const data = { current: snapshot, history };

	await put(BLOB_KEY, JSON.stringify(data), {
		access: 'private',
		contentType: 'application/json',
		addRandomSuffix: false,
		allowOverwrite: true,
		token
	});

	const pricesFound = snapshot.shops.filter((s) => s.price !== null).length;
	console.log(
		`[sync-cappuccino] OK: ${pricesFound}/${snapshot.shopCount} shops priced, ` +
			`median $${snapshot.medianPrice?.toFixed(2) ?? 'N/A'} in ${Date.now() - start}ms`
	);
}

main().catch((err) => {
	console.error('[sync-cappuccino] FATAL:', err);
	process.exit(1);
});
