#!/usr/bin/env node

/**
 * Standalone scraper for Marin Grocery Basket (Bare Essentials) data.
 * Runs in GitHub Actions (or locally) — no SvelteKit dependencies.
 *
 * Searches Instacart cross-store for each of the 12 basket items.
 * Uses Playwright as fallback if plain fetch is blocked by Instacart.
 *
 * Replicates the logic from src/lib/server/scrapers/grocery-basket.ts
 * and the blob persistence from src/routes/api/cron/sync-grocery-basket/+server.ts.
 */

import { put, head } from '@vercel/blob';
import { proxyFetch } from './shared/proxy-fetch.mjs';
import { scoreGroceryPriceMatch } from '../src/lib/shared/grocery-basket-matching.js';

// ---- Config (from src/lib/config/grocery-basket.ts) ----

const BLOB_KEY = 'marin-grocery-basket.json';
const MAX_HISTORY = 104;
const INSTACART_BASE = 'https://www.instacart.com/store/s';
const MARIN_ZIP = '94901';
const MIN_MATCH_SCORE = 0.45;
const MAX_STORES_PER_ITEM = 8;
const REQUEST_DELAY_MS = 2000;
const FETCH_TIMEOUT = 15000;

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BASKET_ITEMS = [
	{
		id: 'vital-farms-eggs',
		name: 'Vital Farms Pasture-Raised Large Eggs, 12 ct',
		size: '12 ct',
		searchTerm: 'Vital Farms Pasture-Raised Large Eggs 12 ct',
		referencePrice: 8.99,
		referenceStore: 'Sprouts',
		category: 'protein'
	},
	{
		id: 'organic-avocado',
		name: 'Organic Large Hass Avocado, 1 each',
		size: '1 each',
		searchTerm: 'Organic Large Hass Avocado',
		referencePrice: 3.5,
		referenceStore: 'Sprouts',
		category: 'produce'
	},
	{
		id: 'marin-kombucha',
		name: 'Marin Kombucha Original Oak, 16 fl oz',
		size: '16 fl oz',
		searchTerm: 'Marin Kombucha Original Oak 16 fl oz',
		referencePrice: 4.79,
		referenceStore: "Driver's Market",
		category: 'beverages'
	},
	{
		id: 'oatly-oatmilk',
		name: 'Oatly Oatmilk, 64 fl oz',
		size: '64 fl oz',
		searchTerm: 'Oatly Oatmilk 64 fl oz',
		referencePrice: 5.99,
		referenceStore: 'Sprouts',
		category: 'dairy-alt'
	},
	{
		id: 'san-luis-sourdough',
		name: 'San Luis Sourdough Sliced Bread, 32 oz',
		size: '32 oz',
		searchTerm: 'San Luis Sourdough Sliced Bread 32 oz',
		referencePrice: 7.59,
		referenceStore: 'Safeway',
		category: 'pantry'
	},
	{
		id: 'marys-chicken',
		name: "Mary's Chicken Organic Breast, 2 lb",
		size: '2 lb',
		searchTerm: "Mary's Chicken Organic Breast",
		referencePrice: 19.99,
		referenceStore: 'Sprouts',
		category: 'protein'
	},
	{
		id: 'earthbound-kale',
		name: 'Earthbound Farm Organic Chopped Kale, 10 oz',
		size: '10 oz',
		searchTerm: 'Earthbound Farm Organic Chopped Kale 10 oz',
		referencePrice: 3.99,
		referenceStore: 'Sprouts',
		category: 'produce'
	},
	{
		id: 'manuka-honey',
		name: 'Manuka Health Honey MGO 263+, 8.8 oz',
		size: '8.8 oz',
		searchTerm: 'Manuka Health Honey MGO 263 8.8 oz',
		referencePrice: 31.99,
		referenceStore: 'Sprouts',
		category: 'pantry'
	},
	{
		id: 'justins-almond-butter',
		name: "Justin's Classic Almond Butter, 16 oz",
		size: '16 oz',
		searchTerm: "Justin's Classic Almond Butter 16 oz",
		referencePrice: 10.99,
		referenceStore: 'Sprouts',
		category: 'pantry'
	},
	{
		id: 'open-nature-salmon',
		name: 'Open Nature Salmon Fillets, Sockeye, Wild Caught, 2 ct',
		size: '2 ct',
		searchTerm: 'Open Nature Salmon Fillets Sockeye Wild Caught',
		referencePrice: 16.99,
		referenceStore: 'Safeway',
		category: 'protein'
	},
	{
		id: 'silver-oak-cabernet',
		name: 'Silver Oak Alexander Valley Cabernet Sauvignon, 750 ml',
		size: '750 ml',
		searchTerm: 'Silver Oak Alexander Valley Cabernet Sauvignon',
		referencePrice: 78.49,
		referenceStore: 'Total Wine',
		category: 'beverages'
	},
	{
		id: 'vital-proteins-collagen',
		name: 'Vital Proteins Collagen Peptides, Unflavored, 20 oz',
		size: '20 oz',
		searchTerm: 'Vital Proteins Collagen Peptides Unflavored 20 oz',
		referencePrice: 42.99,
		referenceStore: 'Vitamin Shoppe',
		category: 'supplements'
	}
];

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
	console.error('[sync-grocery-basket] BLOB_READ_WRITE_TOKEN not set');
	process.exit(1);
}

// ---- Helpers (from src/lib/server/scrapers/grocery-basket.ts) ----

function buildSearchUrl(searchTerm) {
	return `${INSTACART_BASE}?k=${encodeURIComponent(searchTerm)}`;
}

function scorePriceMatch(candidateName, targetName, itemId = null) {
	return scoreGroceryPriceMatch(candidateName, targetName, itemId);
}

function parseInstacartResults(html) {
	const products = [];

	if (!html || html.length === 0) return products;

	// ---- Strategy 1: Playwright-rendered cross-retailer DOM ----
	// Instacart SPA renders store sections (CrossRetailerResultRowWrapper)
	// each containing a store header and product cards (item_list_item_items_{storeId}-{productId}).

	// Step 1a: Build a storeId -> storeName map from CrossRetailerResultRowWrapper sections
	const storeMap = new Map();
	const sectionPattern =
		/data-testid="CrossRetailerResultRowWrapper"([\s\S]*?)(?=data-testid="CrossRetailerResultRowWrapper"|data-testid="CrossRetailerSearchRetailerSignPosts"|$)/g;
	let sectionMatch;
	while ((sectionMatch = sectionPattern.exec(html)) !== null) {
		const section = sectionMatch[1];
		// Store name is in <span ... role="heading" aria-level="3">StoreName</span>
		const nameMatch = section.match(/aria-level="3">([^<]+)</);
		if (!nameMatch) continue;
		const storeName = nameMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
		// Extract the numeric store ID from item cards within this section
		const idPattern = /item_list_item_items_(\d+)-/g;
		let idMatch;
		while ((idMatch = idPattern.exec(section)) !== null) {
			if (!storeMap.has(idMatch[1])) {
				storeMap.set(idMatch[1], storeName);
			}
		}
	}

	// Step 1b: Parse individual product cards
	const itemPattern =
		/data-testid="item_list_item_items_(\d+)-(\d+)"([\s\S]{0,5000}?)(?=data-testid="item_list_item|data-testid="CrossRetailer|data-testid="loading-lockup|$)/g;
	let itemMatch;
	while ((itemMatch = itemPattern.exec(html)) !== null) {
		const storeId = itemMatch[1];
		const chunk = itemMatch[3];

		// Extract current price from "Current price: $X.XX" text
		const currentPriceMatch = chunk.match(/Current price: \$(\d+\.?\d*)/);
		if (!currentPriceMatch) continue;
		const price = parseFloat(currentPriceMatch[1]);
		if (isNaN(price) || price <= 0) continue;

		// Detect sale: "Original Price: $X.XX" present means item is on sale
		const originalPriceMatch = chunk.match(/Original Price: \$(\d+\.?\d*)/);
		const onSale = !!originalPriceMatch;

		// Extract product name: find substantial text spans that aren't prices/ratings/labels
		const skipPatterns = /^(Current price|Original Price|Great price|Out of stock|Request|\d+% off|About |\$|★|per package|\d+ sizes?|\(\d)/i;
		const spanPattern = />([^<]{5,200})</g;
		let s;
		let productName = '';
		while ((s = spanPattern.exec(chunk)) !== null) {
			const text = s[1].trim();
			if (text && !skipPatterns.test(text) && text.length > productName.length) {
				productName = text;
			}
		}

		if (!productName) continue;

		const store = storeMap.get(storeId) || 'Unknown';

		products.push({ name: productName, price, store, onSale });
	}

	if (products.length > 0) {
		console.log(`[grocery-basket] Parsed ${products.length} products from ${storeMap.size} stores (Playwright DOM)`);
		return products;
	}

	// ---- Strategy 2: JSON-LD structured data (plain fetch fallback) ----
	const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
	let jsonLdMatch;
	while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
		try {
			const data = JSON.parse(jsonLdMatch[1]);
			if (
				data['@type'] === 'Product' ||
				(Array.isArray(data) && data[0]?.['@type'] === 'Product')
			) {
				const items = Array.isArray(data) ? data : [data];
				for (const item of items) {
					if (item.name && item.offers) {
						const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
						const price = parseFloat(offer?.price ?? '0');
						if (price > 0) {
							products.push({
								name: item.name,
								price,
								store: offer?.seller?.name ?? 'Unknown',
								onSale: false
							});
						}
					}
				}
			}
		} catch {
			// Invalid JSON-LD
		}
	}

	if (products.length > 0) return products;

	// ---- Strategy 3: aria-label + price fallback ----
	let match;
	const genericPattern = /aria-label="([^"]+)"[\s\S]*?\$(\d+\.?\d*)/gi;
	while ((match = genericPattern.exec(html)) !== null) {
		const name = match[1].trim();
		const price = parseFloat(match[2]);
		if (name && name !== 'product card' && !isNaN(price) && price > 0) {
			products.push({ name, price, store: 'Unknown', onSale: false });
		}
	}

	if (products.length > 0) return products;

	// ---- Strategy 4: bare price detection (diagnostics) ----
	const pricePattern = /\$(\d{1,3}\.\d{2})/g;
	const pricesFound = [];
	while ((match = pricePattern.exec(html)) !== null) {
		pricesFound.push(parseFloat(match[1]));
	}
	if (pricesFound.length > 0 && products.length === 0) {
		console.warn(
			`[grocery-basket] Found ${pricesFound.length} prices in HTML but could not match to products. ` +
				'Instacart HTML structure may have changed.'
		);
	}

	return products;
}

// ---- Fetch strategies ----

async function fetchWithTimeout(url, init, timeoutMs = FETCH_TIMEOUT) {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await proxyFetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(id);
	}
}

async function fetchInstacartPlain(searchTerm) {
	const url = buildSearchUrl(searchTerm);
	const response = await fetchWithTimeout(url, {
		method: 'GET',
		headers: {
			'User-Agent': USER_AGENT,
			Accept:
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
			'Accept-Language': 'en-US,en;q=0.9',
			'Accept-Encoding': 'gzip, deflate, br',
			'Cache-Control': 'no-cache',
			Pragma: 'no-cache',
			Cookie: `zipcode=${MARIN_ZIP}`,
			Referer: 'https://www.instacart.com/',
			'Sec-Fetch-Dest': 'document',
			'Sec-Fetch-Mode': 'navigate',
			'Sec-Fetch-Site': 'same-origin',
			'Sec-Fetch-User': '?1',
			'Upgrade-Insecure-Requests': '1',
			'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="131", "Google Chrome";v="131"',
			'Sec-Ch-Ua-Mobile': '?0',
			'Sec-Ch-Ua-Platform': '"macOS"'
		}
	});

	if (!response.ok) {
		const bodyPreview = await response.text().catch(() => '(unreadable)');
		console.error(
			`[grocery-basket] Instacart fetch failed: HTTP ${response.status} for "${searchTerm}"`,
			`| Body preview: ${bodyPreview.substring(0, 300)}`
		);
		throw new Error(`Instacart fetch failed: ${response.status}`);
	}

	const html = await response.text();

	if (
		html.length < 1000 ||
		html.includes('captcha') ||
		html.includes('challenge') ||
		html.includes('blocked')
	) {
		console.warn(
			`[grocery-basket] Instacart may be blocking: response ${html.length} chars for "${searchTerm}"`
		);
	}

	return html;
}

/**
 * Fallback: use Playwright if plain fetch is blocked.
 * Playwright is installed in the GitHub Actions workflow.
 */
let _browser = null;

async function getPlaywrightBrowser() {
	if (_browser) return _browser;
	try {
		const { chromium } = await import('playwright');
		_browser = await chromium.launch({ headless: true });
		return _browser;
	} catch (err) {
		console.error('[grocery-basket] Playwright not available:', err.message);
		return null;
	}
}

async function fetchInstacartPlaywright(searchTerm) {
	const browser = await getPlaywrightBrowser();
	if (!browser) return null;

	const context = await browser.newContext({
		userAgent: USER_AGENT,
		locale: 'en-US'
	});
	const page = await context.newPage();

	try {
		await context.addCookies([
			{ name: 'zipcode', value: MARIN_ZIP, domain: '.instacart.com', path: '/' }
		]);

		const url = buildSearchUrl(searchTerm);
		await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

		// Wait for product cards to render (Instacart is a React SPA)
		// Cross-retailer results use item_list_item_items_{storeId}-{productId} testids
		await page.waitForFunction(
			() => document.querySelectorAll('[data-testid^="item_list_item_items_"], [data-testid="CrossRetailerResultRowWrapper"]').length > 0,
			{ timeout: 15000 }
		).catch(() => {
			// If product cards never appear, continue with whatever rendered
		});

		// Extra settle time for prices to populate
		await page.waitForTimeout(2000);

		const html = await page.content();
		return html;
	} catch (err) {
		console.error(`[grocery-basket] Playwright failed for "${searchTerm}":`, err.message);
		return null;
	} finally {
		await context.close();
	}
}

async function scrapeItemPrices(itemId, itemName, searchTerm, usePlaywright, referencePrice = null) {
	let html;

	if (usePlaywright) {
		html = await fetchInstacartPlaywright(searchTerm);
		if (!html) return [];
	} else {
		html = await fetchInstacartPlain(searchTerm);
	}

	const allProducts = parseInstacartResults(html);

	if (allProducts.length === 0) {
		console.warn(`[grocery-basket] No products found for "${searchTerm}"`);
		return [];
	}

	// Price sanity bounds: reject matches where price is wildly off from reference
	// Allow wider range for cheap items, tighter for expensive ones
	const PRICE_FLOOR_RATIO = 0.25; // reject if < 25% of reference
	const PRICE_CEIL_RATIO = 3.5;   // reject if > 350% of reference

	// For expensive items ($50+), use tighter bounds and require higher match score
	const isExpensive = referencePrice && referencePrice >= 50;
	const minScore = isExpensive ? 0.55 : MIN_MATCH_SCORE;

	// Score, filter by name match, then filter by price sanity
	const scored = allProducts
		.map((product) => ({
			product,
			score: scorePriceMatch(product.name, itemName, itemId)
		}))
		.filter((s) => s.score >= minScore)
		.filter((s) => {
			// Price sanity check against reference price
			if (!referencePrice) return true;
			const ratio = s.product.price / referencePrice;
			if (ratio < PRICE_FLOOR_RATIO || ratio > PRICE_CEIL_RATIO) {
				console.log(
					`[grocery-basket] Rejected "${s.product.name}" at $${s.product.price.toFixed(2)} ` +
					`(${Math.round(ratio * 100)}% of reference $${referencePrice.toFixed(2)}) — out of bounds`
				);
				return false;
			}
			return true;
		})
		.sort((a, b) => b.score - a.score);

	// Deduplicate by store (keep cheapest per store)
	const byStore = new Map();
	for (const { product, score } of scored) {
		const storeKey = product.store.toLowerCase();
		if (storeKey === 'unknown') continue; // skip products without a store
		const existing = byStore.get(storeKey);
		if (!existing || product.price < existing.price) {
			byStore.set(storeKey, {
				itemId,
				store: product.store,
				price: product.price,
				productName: product.name,
				onSale: product.onSale
			});
		}
	}

	return Array.from(byStore.values())
		.sort((a, b) => a.price - b.price)
		.slice(0, MAX_STORES_PER_ITEM);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Strip store prices from history entries ----

function toHistoryEntry(snapshot) {
	return {
		timestamp: snapshot.timestamp,
		totalCheapest: snapshot.totalCheapest,
		totalExpensive: snapshot.totalExpensive,
		itemsFound: snapshot.itemsFound,
		items: snapshot.items.map((item) => ({
			itemId: item.itemId,
			itemName: item.itemName,
			cheapest: item.cheapest,
			cheapestStore: item.cheapestStore,
			mostExpensive: item.mostExpensive,
			mostExpensiveStore: item.mostExpensiveStore,
			storePrices: []
		}))
	};
}

// ---- Main ----

async function main() {
	const start = Date.now();
	console.log('[sync-grocery-basket] Starting...');

	const items = [];
	let liveItemsFound = 0;
	let instacartBlocked = false;
	let usePlaywright = false;

	// Test first item with plain fetch
	const firstItem = BASKET_ITEMS[0];
	try {
		const testPrices = await scrapeItemPrices(
			firstItem.id,
			firstItem.name,
			firstItem.searchTerm,
			false,
			firstItem.referencePrice
		);
		if (testPrices.length > 0) {
			liveItemsFound++;
			const sorted = [...testPrices].sort((a, b) => a.price - b.price);
			items.push({
				itemId: firstItem.id,
				itemName: firstItem.name,
				cheapest: sorted[0].price,
				cheapestStore: sorted[0].store,
				mostExpensive: sorted[sorted.length - 1].price,
				mostExpensiveStore: sorted[sorted.length - 1].store,
				storePrices: testPrices
			});
			console.log(
				`[grocery-basket] ${firstItem.name}: ${testPrices.length} stores, ` +
					`cheapest $${sorted[0].price.toFixed(2)} at ${sorted[0].store}`
			);
		} else {
			console.warn('[grocery-basket] Plain fetch returned 0 results, trying Playwright...');
			// Retry first item with Playwright
			const pwPrices = await scrapeItemPrices(
				firstItem.id,
				firstItem.name,
				firstItem.searchTerm,
				true,
				firstItem.referencePrice
			);
			if (pwPrices.length > 0) {
				usePlaywright = true;
				liveItemsFound++;
				const sorted = [...pwPrices].sort((a, b) => a.price - b.price);
				items.push({
					itemId: firstItem.id,
					itemName: firstItem.name,
					cheapest: sorted[0].price,
					cheapestStore: sorted[0].store,
					mostExpensive: sorted[sorted.length - 1].price,
					mostExpensiveStore: sorted[sorted.length - 1].store,
					storePrices: pwPrices
				});
				console.log(
					`[grocery-basket] ${firstItem.name} (Playwright): ${pwPrices.length} stores, ` +
						`cheapest $${sorted[0].price.toFixed(2)} at ${sorted[0].store}`
				);
			} else {
				console.warn(
					'[grocery-basket] Playwright also returned 0 results. Falling back to reference prices.'
				);
				instacartBlocked = true;
			}
		}
	} catch (err) {
		console.warn(
			'[grocery-basket] First item fetch failed. Trying Playwright...',
			err.message
		);
		try {
			const pwPrices = await scrapeItemPrices(
				firstItem.id,
				firstItem.name,
				firstItem.searchTerm,
				true,
				firstItem.referencePrice
			);
			if (pwPrices.length > 0) {
				usePlaywright = true;
				liveItemsFound++;
				const sorted = [...pwPrices].sort((a, b) => a.price - b.price);
				items.push({
					itemId: firstItem.id,
					itemName: firstItem.name,
					cheapest: sorted[0].price,
					cheapestStore: sorted[0].store,
					mostExpensive: sorted[sorted.length - 1].price,
					mostExpensiveStore: sorted[sorted.length - 1].store,
					storePrices: pwPrices
				});
			} else {
				instacartBlocked = true;
			}
		} catch {
			instacartBlocked = true;
		}
	}

	if (instacartBlocked) {
		console.log(`[grocery-basket] Using reference prices for all ${BASKET_ITEMS.length} items`);
		// Clear items in case first item was partially added
		items.length = 0;
		for (const basketItem of BASKET_ITEMS) {
			items.push({
				itemId: basketItem.id,
				itemName: basketItem.name,
				cheapest: basketItem.referencePrice,
				cheapestStore: basketItem.referenceStore,
				mostExpensive: basketItem.referencePrice,
				mostExpensiveStore: basketItem.referenceStore,
				storePrices: [
					{
						itemId: basketItem.id,
						store: basketItem.referenceStore,
						price: basketItem.referencePrice,
						productName: basketItem.name,
						onSale: false
					}
				]
			});
		}
	} else {
		// Continue scraping remaining items
		for (let i = 1; i < BASKET_ITEMS.length; i++) {
			const basketItem = BASKET_ITEMS[i];
			await sleep(REQUEST_DELAY_MS);

			try {
				const storePrices = await scrapeItemPrices(
					basketItem.id,
					basketItem.name,
					basketItem.searchTerm,
					usePlaywright,
					basketItem.referencePrice
				);

				const sorted = [...storePrices].sort((a, b) => a.price - b.price);

				if (sorted.length > 0) {
					liveItemsFound++;
					items.push({
						itemId: basketItem.id,
						itemName: basketItem.name,
						cheapest: sorted[0].price,
						cheapestStore: sorted[0].store,
						mostExpensive: sorted[sorted.length - 1].price,
						mostExpensiveStore: sorted[sorted.length - 1].store,
						storePrices
					});
					console.log(
						`[grocery-basket] ${basketItem.name}: ${storePrices.length} stores, ` +
							`cheapest $${sorted[0].price.toFixed(2)} at ${sorted[0].store}`
					);
				} else {
					items.push({
						itemId: basketItem.id,
						itemName: basketItem.name,
						cheapest: basketItem.referencePrice,
						cheapestStore: `${basketItem.referenceStore} (ref)`,
						mostExpensive: basketItem.referencePrice,
						mostExpensiveStore: `${basketItem.referenceStore} (ref)`,
						storePrices: [
							{
								itemId: basketItem.id,
								store: `${basketItem.referenceStore} (ref)`,
								price: basketItem.referencePrice,
								productName: basketItem.name,
								onSale: false
							}
						]
					});
					console.log(
						`[grocery-basket] ${basketItem.name}: 0 stores, using reference $${basketItem.referencePrice.toFixed(2)}`
					);
				}
			} catch (err) {
				console.warn(`[grocery-basket] Failed to scrape "${basketItem.name}":`, err.message);
				items.push({
					itemId: basketItem.id,
					itemName: basketItem.name,
					cheapest: basketItem.referencePrice,
					cheapestStore: `${basketItem.referenceStore} (ref)`,
					mostExpensive: basketItem.referencePrice,
					mostExpensiveStore: `${basketItem.referenceStore} (ref)`,
					storePrices: [
						{
							itemId: basketItem.id,
							store: `${basketItem.referenceStore} (ref)`,
							price: basketItem.referencePrice,
							productName: basketItem.name,
							onSale: false
						}
					]
				});
			}
		}
	}

	// Close Playwright browser if it was used
	if (_browser) {
		await _browser.close();
		_browser = null;
	}

	// Compute basket totals
	const cheapestPrices = items.map((i) => i.cheapest).filter((p) => p !== null);
	const expensivePrices = items.map((i) => i.mostExpensive).filter((p) => p !== null);

	const totalCheapest =
		cheapestPrices.length > 0
			? Math.round(cheapestPrices.reduce((a, b) => a + b, 0) * 100) / 100
			: null;
	const totalExpensive =
		expensivePrices.length > 0
			? Math.round(expensivePrices.reduce((a, b) => a + b, 0) * 100) / 100
			: null;

	const snapshot = {
		timestamp: new Date().toISOString(),
		totalCheapest,
		totalExpensive,
		itemsFound: cheapestPrices.length,
		items
	};

	const source = instacartBlocked
		? 'reference'
		: `instacart${usePlaywright ? ' (playwright)' : ''} (${liveItemsFound}/${BASKET_ITEMS.length} live)`;
	console.log(
		`[grocery-basket] Source: ${source}, total cheapest: $${totalCheapest?.toFixed(2) ?? 'N/A'}`
	);

	// Read existing blob
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
		console.log('[sync-grocery-basket] No existing blob, starting fresh');
	}

	// Write updated blob
	const history = [toHistoryEntry(snapshot), ...existing.history].slice(0, MAX_HISTORY);
	const data = { current: snapshot, history };

	await put(BLOB_KEY, JSON.stringify(data), {
		access: 'private',
		contentType: 'application/json',
		addRandomSuffix: false,
		allowOverwrite: true,
		token
	});

	console.log(
		`[sync-grocery-basket] OK: ${snapshot.itemsFound}/12 items priced, ` +
			`total $${totalCheapest?.toFixed(2) ?? 'N/A'} in ${Date.now() - start}ms`
	);
}

main().catch((err) => {
	console.error('[sync-grocery-basket] FATAL:', err);
	process.exit(1);
});
