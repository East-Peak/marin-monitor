/**
 * Server-side scraper for PlumpJack Wine Index data.
 *
 * Uses PlumpJack's public Shopify API (no auth required).
 * Fetches products from collections, computes median prices,
 * and extracts staff picks / allocated wines.
 *
 * All requests use plain fetch() -- no browser/Playwright needed.
 */

import type {
	WineProduct,
	WineCategory,
	WineCategorySnapshot,
	WineStaffPick,
	WineSnapshot
} from '$lib/types/wine';
import {
	PLUMPJACK_BASE_URL,
	SHOPIFY_FETCH_TIMEOUT,
	SHOPIFY_PAGE_LIMIT,
	WINE_INDEX_COLLECTIONS,
	WINE_LISTING_COLLECTIONS
} from '$lib/config/wine';
import { withSuccessfulScrapeMetadata } from '$lib/server/scrape-metadata';

// ---- Exported helpers (tested directly) ----

/** Parse a Shopify price string to a number. Returns null for empty, non-numeric, or zero. */
export function parseShopifyPrice(priceStr: string): number | null {
	if (!priceStr || priceStr.trim() === '') return null;
	const num = parseFloat(priceStr);
	if (isNaN(num) || num === 0) return null;
	return num;
}

/** Compute the median of a numeric array. Returns null for empty arrays. */
export function computeMedian(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
	}
	return sorted[mid];
}

/**
 * Extract WineProduct[] from a raw Shopify products API response.
 * Skips products with no variants or zero/null price.
 */
export function extractProducts(shopifyResponse: {
	products: Array<{
		id: number;
		title: string;
		handle: string;
		vendor: string;
		product_type: string;
		tags: string;
		variants: Array<{
			price: string;
			compare_at_price: string | null;
			available: boolean;
		}>;
	}>;
}): WineProduct[] {
	const results: WineProduct[] = [];

	for (const product of shopifyResponse.products) {
		if (!product.variants || product.variants.length === 0) continue;

		const variant = product.variants[0];
		const price = parseShopifyPrice(variant.price);
		if (price === null) continue;

		const compareAtPrice = variant.compare_at_price
			? parseShopifyPrice(variant.compare_at_price)
			: null;

		results.push({
			id: product.id,
			title: product.title,
			handle: product.handle,
			vendor: product.vendor,
			product_type: product.product_type,
			price,
			compareAtPrice,
			available: variant.available,
			tags: product.tags
				? product.tags.split(',').map((t) => t.trim()).filter(Boolean)
				: []
		});
	}

	return results;
}

/** Build a WineCategorySnapshot from a list of products. */
export function buildCategorySnapshot(
	category: WineCategory,
	label: string,
	products: WineProduct[]
): WineCategorySnapshot {
	const prices = products.map((p) => p.price);
	return {
		category,
		label,
		productCount: products.length,
		medianPrice: computeMedian(prices),
		minPrice: prices.length > 0 ? Math.min(...prices) : null,
		maxPrice: prices.length > 0 ? Math.max(...prices) : null
	};
}

/** Convert a WineProduct to a WineStaffPick for the bottle listing. */
export function buildStaffPick(
	product: WineProduct,
	listingType: 'staff-pick' | 'allocated'
): WineStaffPick {
	return {
		id: product.id,
		title: product.title,
		handle: product.handle,
		vendor: product.vendor,
		price: product.price,
		compareAtPrice: product.compareAtPrice,
		available: product.available,
		listingType
	};
}

// ---- Internal helpers ----

/**
 * Fetch all products from a Shopify collection, handling pagination.
 *
 * Shopify paginates at 250 products per page. This function fetches
 * page=1, page=2, etc. until an empty products array is returned.
 */
async function fetchCollectionProducts(collectionHandle: string): Promise<WineProduct[]> {
	const allProducts: WineProduct[] = [];
	let page = 1;

	while (true) {
		const url = `${PLUMPJACK_BASE_URL}/collections/${collectionHandle}/products.json?limit=${SHOPIFY_PAGE_LIMIT}&page=${page}`;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), SHOPIFY_FETCH_TIMEOUT);

		try {
			const response = await fetch(url, {
				signal: controller.signal,
				headers: {
					'Accept': 'application/json, text/plain, */*',
					'Accept-Language': 'en-US,en;q=0.9',
					'Accept-Encoding': 'gzip, deflate, br',
					'User-Agent':
						'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
					'Referer': 'https://plumpjackwines.com/',
					'Sec-Fetch-Dest': 'empty',
					'Sec-Fetch-Mode': 'cors',
					'Sec-Fetch-Site': 'same-origin'
				}
			});

			if (!response.ok) {
				// Log response body (first 500 chars) for debugging Shopify blocks
				const bodyPreview = await response.text().catch(() => '(unreadable)');
				console.error(
					`[wine-index] Failed to fetch ${collectionHandle} page ${page}: HTTP ${response.status}`,
					`| Content-Type: ${response.headers.get('content-type')}`,
					`| Body preview: ${bodyPreview.substring(0, 500)}`
				);
				break;
			}

			const data = await response.json();
			const products = extractProducts(data);

			if (products.length === 0) {
				// No more products -- we've reached the last page
				break;
			}

			allProducts.push(...products);

			// If we got fewer than the limit, this was the last page
			if (data.products.length < SHOPIFY_PAGE_LIMIT) {
				break;
			}

			page++;
		} catch (err) {
			if ((err as Error).name === 'AbortError') {
				console.error(`[wine-index] Timeout fetching ${collectionHandle} page ${page}`);
			} else {
				console.error(
					`[wine-index] Error fetching ${collectionHandle} page ${page}:`,
					(err as Error).message
				);
			}
			break;
		} finally {
			clearTimeout(timeoutId);
		}

		// Polite delay between pages (500ms)
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	return allProducts;
}

// ---- Main export ----

/**
 * Fetch all wine index data from PlumpJack's Shopify API.
 *
 * 1. Fetches products from each index collection (napa-sonoma, burgundy, champagne)
 * 2. Computes median prices per category
 * 3. Fetches staff picks and allocated wines for bottle listing
 * 4. Returns a complete WineSnapshot
 */
export async function scrapeWineIndex(): Promise<WineSnapshot> {
	// 1. Fetch index collections for median computation
	const categorySnapshots: WineCategorySnapshot[] = [];

	for (const collection of WINE_INDEX_COLLECTIONS) {
		console.log(`[wine-index] Fetching ${collection.handle}...`);
		const products = await fetchCollectionProducts(collection.handle);
		console.log(`[wine-index] ${collection.handle}: ${products.length} products`);

		const snapshot = buildCategorySnapshot(
			collection.category,
			collection.label,
			products
		);
		categorySnapshots.push(snapshot);

		// Polite delay between collections (1s)
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	// 2. Fetch staff picks
	console.log(`[wine-index] Fetching ${WINE_LISTING_COLLECTIONS.staffPicks}...`);
	const staffPickProducts = await fetchCollectionProducts(
		WINE_LISTING_COLLECTIONS.staffPicks
	);
	const staffPicks = staffPickProducts.map((p) => buildStaffPick(p, 'staff-pick'));
	console.log(`[wine-index] Staff picks: ${staffPicks.length} wines`);

	// Polite delay
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// 3. Fetch allocated wines
	console.log(`[wine-index] Fetching ${WINE_LISTING_COLLECTIONS.allocated}...`);
	const allocatedProducts = await fetchCollectionProducts(
		WINE_LISTING_COLLECTIONS.allocated
	);
	const allocatedWines = allocatedProducts.map((p) => buildStaffPick(p, 'allocated'));
	console.log(`[wine-index] Allocated wines: ${allocatedWines.length} wines`);

	return withSuccessfulScrapeMetadata({
		timestamp: new Date().toISOString(),
		categories: categorySnapshots,
		staffPicks,
		allocatedWines
	});
}
