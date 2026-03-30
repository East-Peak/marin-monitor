#!/usr/bin/env node

/**
 * Standalone scraper for PlumpJack Wine Index data.
 * Runs in GitHub Actions (or locally) — no SvelteKit dependencies.
 *
 * Replicates the logic from src/lib/server/scrapers/wine-index.ts
 * and the blob persistence from src/routes/api/cron/sync-wine-index/+server.ts.
 */

import { put, head } from '@vercel/blob';
import { proxyFetch } from './shared/proxy-fetch.mjs';

// ---- Config (from src/lib/config/wine.ts) ----

const BLOB_KEY = 'marin-wine-index.json';
const MAX_HISTORY = 52;
const PLUMPJACK_BASE_URL = 'https://plumpjackwines.com';
const SHOPIFY_FETCH_TIMEOUT = 15000;
const SHOPIFY_PAGE_LIMIT = 250;

const INDEX_COLLECTIONS = [
	{ handle: 'napa-and-sonoma-wines', category: 'napa-sonoma', label: 'Napa/Sonoma Cab' },
	{ handle: 'burgundy', category: 'burgundy', label: 'Burgundy' },
	{ handle: 'champagne', category: 'champagne', label: 'Champagne' }
];

const LISTING_COLLECTIONS = {
	staffPicks: 'staff-picks',
	allocated: 'allocated-wines'
};

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
	console.error('[sync-wine-index] BLOB_READ_WRITE_TOKEN not set');
	process.exit(1);
}

// ---- Helpers (from src/lib/server/scrapers/wine-index.ts) ----

function parseShopifyPrice(priceStr) {
	if (!priceStr || priceStr.trim() === '') return null;
	const num = parseFloat(priceStr);
	if (isNaN(num) || num === 0) return null;
	return num;
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

function extractProducts(shopifyResponse) {
	const results = [];
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
			tags: Array.isArray(product.tags)
				? product.tags
				: typeof product.tags === 'string'
					? product.tags.split(',').map((t) => t.trim()).filter(Boolean)
					: []
		});
	}
	return results;
}

function buildCategorySnapshot(category, label, products) {
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

function buildStaffPick(product, listingType) {
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

async function fetchCollectionProducts(collectionHandle) {
	const allProducts = [];
	let page = 1;

	while (true) {
		const url = `${PLUMPJACK_BASE_URL}/collections/${collectionHandle}/products.json?limit=${SHOPIFY_PAGE_LIMIT}&page=${page}`;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), SHOPIFY_FETCH_TIMEOUT);

		try {
			const response = await proxyFetch(url, {
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

			if (products.length === 0) break;

			allProducts.push(...products);

			if (data.products.length < SHOPIFY_PAGE_LIMIT) break;

			page++;
		} catch (err) {
			if (err.name === 'AbortError') {
				console.error(`[wine-index] Timeout fetching ${collectionHandle} page ${page}`);
			} else {
				console.error(`[wine-index] Error fetching ${collectionHandle} page ${page}:`, err.message);
			}
			break;
		} finally {
			clearTimeout(timeoutId);
		}

		// Polite delay between pages
		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	return allProducts;
}

// ---- Strip bottle listings from history entries ----

function toHistoryEntry(snapshot) {
	return {
		timestamp: snapshot.timestamp,
		categories: snapshot.categories
	};
}

// ---- Main ----

async function main() {
	const start = Date.now();
	console.log('[sync-wine-index] Starting...');

	// 1. Scrape all collections
	const categorySnapshots = [];

	for (const collection of INDEX_COLLECTIONS) {
		console.log(`[wine-index] Fetching ${collection.handle}...`);
		const products = await fetchCollectionProducts(collection.handle);
		console.log(`[wine-index] ${collection.handle}: ${products.length} products`);

		const snapshot = buildCategorySnapshot(collection.category, collection.label, products);
		categorySnapshots.push(snapshot);

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	// 2. Fetch staff picks
	console.log(`[wine-index] Fetching ${LISTING_COLLECTIONS.staffPicks}...`);
	const staffPickProducts = await fetchCollectionProducts(LISTING_COLLECTIONS.staffPicks);
	const staffPicks = staffPickProducts.map((p) => buildStaffPick(p, 'staff-pick'));
	console.log(`[wine-index] Staff picks: ${staffPicks.length} wines`);

	await new Promise((resolve) => setTimeout(resolve, 1000));

	// 3. Fetch allocated wines
	console.log(`[wine-index] Fetching ${LISTING_COLLECTIONS.allocated}...`);
	const allocatedProducts = await fetchCollectionProducts(LISTING_COLLECTIONS.allocated);
	const allocatedWines = allocatedProducts.map((p) => buildStaffPick(p, 'allocated'));
	console.log(`[wine-index] Allocated wines: ${allocatedWines.length} wines`);

	const snapshot = {
		timestamp: new Date().toISOString(),
		categories: categorySnapshots,
		staffPicks,
		allocatedWines
	};

	// 4. Read existing blob
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
		console.log('[sync-wine-index] No existing blob, starting fresh');
	}

	// 5. Write updated blob
	const history = [toHistoryEntry(snapshot), ...existing.history].slice(0, MAX_HISTORY);

	const data = { current: snapshot, history };

	await put(BLOB_KEY, JSON.stringify(data), {
		access: 'private',
		contentType: 'application/json',
		addRandomSuffix: false,
		allowOverwrite: true,
		token
	});

	const categorySummary = snapshot.categories
		.map((c) => `${c.label}: $${c.medianPrice?.toFixed(2) ?? 'N/A'} (${c.productCount} wines)`)
		.join(', ');

	console.log(
		`[sync-wine-index] OK: ${categorySummary}, ${staffPicks.length} staff picks, ${allocatedWines.length} allocated in ${Date.now() - start}ms`
	);
}

main().catch((err) => {
	console.error('[sync-wine-index] FATAL:', err);
	process.exit(1);
});
