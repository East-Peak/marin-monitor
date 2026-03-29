// src/lib/server/scrapers/grocery-basket.ts

/**
 * Server-side Instacart cross-store search scraper for The Bare Essentials basket.
 *
 * Searches instacart.com/store/s?k={term} for each basket item,
 * extracts product cards with prices and store names from the HTML,
 * and matches results to target products using fuzzy string scoring.
 *
 * No authentication required. Instacart cross-store search returns
 * results from Sprouts, Safeway, Target, Costco, Mollie Stone's,
 * Total Wine, BevMo, Lucky, Walmart, Fairfax Market, and others.
 */

import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { BASKET_ITEMS } from '$lib/config/grocery-basket';
import type {
	BasketItemPrices,
	GrocerySnapshot,
	ItemPriceResult
} from '$lib/types/grocery';

const INSTACART_BASE = 'https://www.instacart.com/store/s';

/** Marin ZIP code for Instacart location context */
const MARIN_ZIP = '94901';

/** Minimum match score to consider a product a valid match */
const MIN_MATCH_SCORE = 0.45;

/** Maximum number of store results to keep per item */
const MAX_STORES_PER_ITEM = 8;

/** Delay between requests to avoid rate limiting (ms) */
const REQUEST_DELAY_MS = 2000;

/** User-Agent to use for requests */
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Raw parsed result from Instacart HTML */
export interface InstacartProduct {
	name: string;
	price: number;
	store: string;
	onSale: boolean;
}

/** Build the Instacart search URL for a given term */
export function buildSearchUrl(searchTerm: string): string {
	return `${INSTACART_BASE}?k=${encodeURIComponent(searchTerm)}`;
}

/**
 * Score how well a found product name matches the target product name.
 * Returns a value from 0.0 (no match) to 1.0 (exact match).
 *
 * Uses word-overlap scoring: counts how many words from the target
 * appear in the candidate, normalized by total target words.
 */
export function scorePriceMatch(candidateName: string, targetName: string): number {
	const normalize = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.split(/\s+/)
			.filter((w) => w.length > 0);

	const targetWords = normalize(targetName);
	const candidateWords = new Set(normalize(candidateName));

	if (targetWords.length === 0) return 0;

	let matches = 0;
	for (const word of targetWords) {
		if (candidateWords.has(word)) matches++;
	}

	return Math.round((matches / targetWords.length) * 100) / 100;
}

/**
 * Parse Instacart search result HTML and extract product cards.
 *
 * Instacart renders product cards with structured data attributes.
 * This parser uses regex patterns to extract product name, price,
 * and store from the HTML without a full DOM parser.
 *
 * The HTML structure may change. If parsing starts returning 0 results,
 * the regex patterns likely need updating. The scraper logs warnings
 * when no products are found to surface this in cron logs.
 */
export function parseInstacartResults(html: string): InstacartProduct[] {
	const products: InstacartProduct[] = [];

	if (!html || html.length === 0) return products;

	// Strategy 1: Look for JSON-LD structured data
	const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
	let jsonLdMatch;
	while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
		try {
			const data = JSON.parse(jsonLdMatch[1]);
			if (data['@type'] === 'Product' || (Array.isArray(data) && data[0]?.['@type'] === 'Product')) {
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
			// Invalid JSON-LD, skip
		}
	}

	if (products.length > 0) return products;

	// Strategy 2: Parse product cards from HTML using data attributes
	// Instacart uses data-testid attributes on product card elements
	const cardPattern =
		/data-testid="product-card"[\s\S]*?data-testid="product-card-name"[^>]*>([^<]+)<[\s\S]*?data-testid="product-card-price"[^>]*>\$?([\d.]+)<[\s\S]*?data-testid="product-card-store"[^>]*>([^<]+)</gi;

	let match;
	while ((match = cardPattern.exec(html)) !== null) {
		const name = match[1].trim();
		const price = parseFloat(match[2]);
		const store = match[3].trim();

		if (name && !isNaN(price) && price > 0 && store) {
			products.push({ name, price, store, onSale: false });
		}
	}

	if (products.length > 0) return products;

	// Strategy 3: Generic price extraction from aria-labels or structured divs
	// Look for patterns like "Product Name ... $X.XX ... Store Name"
	const genericPattern =
		/aria-label="([^"]+)"[\s\S]*?\$(\d+\.?\d*)/gi;

	while ((match = genericPattern.exec(html)) !== null) {
		const name = match[1].trim();
		const price = parseFloat(match[2]);

		if (name && !isNaN(price) && price > 0) {
			products.push({ name, price, store: 'Unknown', onSale: false });
		}
	}

	if (products.length > 0) return products;

	// Strategy 4: Look for price patterns near product text
	// This is the most generic fallback
	const pricePattern = /\$(\d{1,3}\.\d{2})/g;
	const pricesFound: number[] = [];
	while ((match = pricePattern.exec(html)) !== null) {
		pricesFound.push(parseFloat(match[1]));
	}

	// If we found prices but no structured data, log for debugging
	if (pricesFound.length > 0 && products.length === 0) {
		console.warn(
			`[grocery-basket] Found ${pricesFound.length} prices in HTML but could not match to products. ` +
			'Instacart HTML structure may have changed. Manual inspection needed.'
		);
	}

	return products;
}

/**
 * Fetch Instacart search results for a given term.
 * Sets appropriate headers including ZIP code cookie for Marin location.
 */
async function fetchInstacartSearch(searchTerm: string): Promise<string> {
	const url = buildSearchUrl(searchTerm);

	const response = await fetchWithTimeout(
		url,
		{
			method: 'GET',
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9',
				'Accept-Encoding': 'gzip, deflate, br',
				Cookie: `zipcode=${MARIN_ZIP}`,
				Referer: 'https://www.instacart.com/'
			}
		},
		15000
	);

	if (!response.ok) {
		throw new Error(`Instacart fetch failed: ${response.status} for term "${searchTerm}"`);
	}

	return await response.text();
}

/**
 * Search Instacart for a single basket item and return matched price results.
 * Applies fuzzy matching to filter results to the target product.
 */
async function scrapeItemPrices(
	itemId: string,
	itemName: string,
	searchTerm: string
): Promise<ItemPriceResult[]> {
	const html = await fetchInstacartSearch(searchTerm);
	const allProducts = parseInstacartResults(html);

	if (allProducts.length === 0) {
		console.warn(`[grocery-basket] No products found for "${searchTerm}"`);
		return [];
	}

	// Score and filter to matching products
	const scored = allProducts
		.map((product) => ({
			product,
			score: scorePriceMatch(product.name, itemName)
		}))
		.filter((s) => s.score >= MIN_MATCH_SCORE)
		.sort((a, b) => b.score - a.score);

	// Deduplicate by store (keep cheapest per store)
	const byStore = new Map<string, ItemPriceResult>();
	for (const { product } of scored) {
		const storeKey = product.store.toLowerCase();
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

/** Sleep helper for request throttling */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scrape all 12 basket items from Instacart and build a GrocerySnapshot.
 * Throttles requests to avoid rate limiting.
 */
export async function scrapeGroceryBasket(): Promise<GrocerySnapshot> {
	const items: BasketItemPrices[] = [];

	for (const basketItem of BASKET_ITEMS) {
		try {
			const storePrices = await scrapeItemPrices(
				basketItem.id,
				basketItem.name,
				basketItem.searchTerm
			);

			const sorted = [...storePrices].sort((a, b) => a.price - b.price);

			items.push({
				itemId: basketItem.id,
				itemName: basketItem.name,
				cheapest: sorted.length > 0 ? sorted[0].price : null,
				cheapestStore: sorted.length > 0 ? sorted[0].store : null,
				mostExpensive: sorted.length > 0 ? sorted[sorted.length - 1].price : null,
				mostExpensiveStore: sorted.length > 0 ? sorted[sorted.length - 1].store : null,
				storePrices
			});

			console.log(
				`[grocery-basket] ${basketItem.name}: ${storePrices.length} stores, ` +
				`cheapest ${sorted[0]?.price ? '$' + sorted[0].price.toFixed(2) : 'N/A'} at ${sorted[0]?.store ?? 'N/A'}`
			);
		} catch (err) {
			console.warn(
				`[grocery-basket] Failed to scrape "${basketItem.name}":`,
				err instanceof Error ? err.message : String(err)
			);
			items.push({
				itemId: basketItem.id,
				itemName: basketItem.name,
				cheapest: null,
				cheapestStore: null,
				mostExpensive: null,
				mostExpensiveStore: null,
				storePrices: []
			});
		}

		// Throttle between requests
		await sleep(REQUEST_DELAY_MS);
	}

	// Compute basket totals
	const cheapestPrices = items
		.map((i) => i.cheapest)
		.filter((p): p is number => p !== null);
	const expensivePrices = items
		.map((i) => i.mostExpensive)
		.filter((p): p is number => p !== null);

	const totalCheapest =
		cheapestPrices.length > 0
			? Math.round(cheapestPrices.reduce((a, b) => a + b, 0) * 100) / 100
			: null;
	const totalExpensive =
		expensivePrices.length > 0
			? Math.round(expensivePrices.reduce((a, b) => a + b, 0) * 100) / 100
			: null;

	return {
		timestamp: new Date().toISOString(),
		totalCheapest,
		totalExpensive,
		itemsFound: cheapestPrices.length,
		items
	};
}
