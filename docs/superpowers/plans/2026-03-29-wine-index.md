# Wine Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Wine Index panel to Marin Monitor that tracks premium wine category median prices (Napa/Sonoma Cab, Burgundy, Champagne) via PlumpJack's public Shopify API, with sparkline trends and curated staff pick / allocated wine listings.

**Architecture:** A weekly Vercel cron fetches product data from five PlumpJack Shopify collections (napa-and-sonoma-wines, burgundy, champagne, staff-picks, allocated-wines) using plain `fetch()` -- no browser needed since Shopify's JSON API is public. The scraper computes median prices per category, extracts staff picks and allocated wines, and stores the result as JSON in Vercel Blob (current snapshot + capped history). A public API route serves the Blob data. The client adapter, Svelte store, and panel component follow the exact Cappuccino Index pattern: a dedicated WineIndexPanel in the SignalDeck right column, with category median sparklines and a bottle listing section.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Vercel Blob, Vercel Cron, D3.js (sparklines), Vitest

---

## File Structure

### New Files

| File                                              | Responsibility                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/lib/types/wine.ts`                           | WineProduct, WineCategory, WineCategorySnapshot, WineStaffPick, WineSnapshot, WineIndexData type definitions |
| `src/lib/config/wine.ts`                          | PlumpJack base URL, collection handles, blob key, history cap, accent color                                  |
| `src/lib/server/scrapers/wine-index.ts`           | Shopify collection fetcher, median computation, staff pick extraction                                        |
| `src/lib/server/scrapers/wine-index.test.ts`      | Unit tests for price parsing, median computation, pagination logic                                           |
| `src/routes/api/cron/sync-wine-index/+server.ts`  | Weekly cron job: fetch collections + compute + store to Blob                                                 |
| `src/routes/api/data/wine-index/+server.ts`       | Serve wine index data from Blob                                                                              |
| `src/lib/api/marin/wine-index.ts`                 | Client-side data adapter                                                                                     |
| `src/lib/stores/wine-index.ts`                    | Svelte store for wine index data                                                                             |
| `src/lib/components/panels/WineIndexPanel.svelte` | Dashboard panel with category sparklines + bottle listing                                                    |

### Modified Files

| File                                             | Change                                     |
| ------------------------------------------------ | ------------------------------------------ |
| `src/lib/types/index.ts`                         | Re-export wine types                       |
| `src/lib/config/panels.ts`                       | Add `wine-index` PanelId + config          |
| `src/lib/components/panels/index.ts`             | Export WineIndexPanel                      |
| `src/lib/components/dashboard/SignalDeck.svelte` | Render WineIndexPanel in right column      |
| `src/lib/stores/refresh.ts`                      | Add `wine-index` to tertiary refresh stage |
| `vercel.json`                                    | Add sync-wine-index cron entry             |

---

## Task 1: Type Definitions

**Files:**

- Create: `src/lib/types/wine.ts`
- Modify: `src/lib/types/index.ts`

- [ ] **Step 1: Write type definitions**

```typescript
// src/lib/types/wine.ts

/** A single wine product from the Shopify API */
export interface WineProduct {
	/** Shopify product ID */
	id: number;
	title: string;
	handle: string;
	vendor: string;
	product_type: string;
	/** First variant price as a number */
	price: number;
	/** Compare-at price (original price if on sale), null if not on sale */
	compareAtPrice: number | null;
	/** Whether the first variant is in stock */
	available: boolean;
	/** Product tags from Shopify (grape variety, region, etc.) */
	tags: string[];
}

/** Wine category identifiers for index tracking */
export type WineCategory = 'napa-sonoma' | 'burgundy' | 'champagne';

/** A point-in-time snapshot of a single wine category */
export interface WineCategorySnapshot {
	category: WineCategory;
	/** Human-readable category label */
	label: string;
	/** Number of products in this collection */
	productCount: number;
	/** Median price across all products in the collection */
	medianPrice: number | null;
	/** Week-over-week change in median price (computed client-side from history) */
	minPrice: number | null;
	maxPrice: number | null;
}

/** A staff pick or allocated wine for the bottle listing */
export interface WineStaffPick {
	id: number;
	title: string;
	handle: string;
	vendor: string;
	price: number;
	compareAtPrice: number | null;
	available: boolean;
	/** Which listing this came from */
	listingType: 'staff-pick' | 'allocated';
}

/** Full snapshot of all wine index data at a point in time */
export interface WineSnapshot {
	timestamp: string;
	/** Category median snapshots */
	categories: WineCategorySnapshot[];
	/** Staff picks bottle listing */
	staffPicks: WineStaffPick[];
	/** Allocated/limited wines listing */
	allocatedWines: WineStaffPick[];
}

/** Top-level Blob shape (mirrors CoffeeData pattern) */
export interface WineIndexData {
	current: WineSnapshot | null;
	/** History entries store categories only (no bottle listings) to keep size small */
	history: Array<{
		timestamp: string;
		categories: WineCategorySnapshot[];
	}>;
}
```

- [ ] **Step 2: Re-export types from index**

Add the following to the bottom of `src/lib/types/index.ts`, after the existing coffee re-exports:

```typescript
// In src/lib/types/index.ts -- add at end of file:

export type {
	WineProduct,
	WineCategory,
	WineCategorySnapshot,
	WineStaffPick,
	WineSnapshot,
	WineIndexData
} from './wine';
```

- [ ] **Step 3: Verify types compile**

```bash
cd /Users/tammypais/projects/marin-monitor && npx tsc --noEmit --pretty 2>&1 | head -20
# Expected: no errors related to wine types
```

---

## Task 2: Wine Index Configuration

**Files:**

- Create: `src/lib/config/wine.ts`
- Create: `src/lib/config/wine.test.ts`

- [ ] **Step 1: Write configuration**

```typescript
// src/lib/config/wine.ts

import type { WineCategory } from '$lib/types/wine';

/** Blob storage key */
export const WINE_INDEX_BLOB_KEY = 'marin-wine-index.json';

/** Max history entries (52 weeks = 1 year at weekly cadence) */
export const MAX_WINE_HISTORY = 52;

/** PlumpJack Shopify storefront base URL */
export const PLUMPJACK_BASE_URL = 'https://plumpjackwines.com';

/** Timeout for Shopify API requests (ms) */
export const SHOPIFY_FETCH_TIMEOUT = 15000;

/** Max products per page (Shopify limit) */
export const SHOPIFY_PAGE_LIMIT = 250;

/** Wine accent color (deep purple/wine) */
export const WINE_ACCENT = '#7c3aed';

/** Wine accent color with transparency for area fills */
export const WINE_ACCENT_FILL = 'rgba(124, 58, 237, 0.1)';

/** Collection configuration for median price tracking */
export interface WineCollectionConfig {
	/** Shopify collection handle (URL slug) */
	handle: string;
	/** Which category this maps to */
	category: WineCategory;
	/** Human-readable label */
	label: string;
}

/** Collections used for index median computation */
export const WINE_INDEX_COLLECTIONS: WineCollectionConfig[] = [
	{
		handle: 'napa-and-sonoma-wines',
		category: 'napa-sonoma',
		label: 'Napa/Sonoma Cab'
	},
	{
		handle: 'burgundy',
		category: 'burgundy',
		label: 'Burgundy'
	},
	{
		handle: 'champagne',
		category: 'champagne',
		label: 'Champagne'
	}
];

/** Collection handles for bottle listings (not used for median computation) */
export const WINE_LISTING_COLLECTIONS = {
	staffPicks: 'staff-picks',
	allocated: 'allocated-wines'
} as const;

/** Category display order */
export const WINE_CATEGORY_ORDER: WineCategory[] = ['napa-sonoma', 'burgundy', 'champagne'];
```

- [ ] **Step 2: Write config validation test**

```typescript
// src/lib/config/wine.test.ts

import { describe, it, expect } from 'vitest';
import {
	WINE_INDEX_COLLECTIONS,
	WINE_LISTING_COLLECTIONS,
	WINE_CATEGORY_ORDER,
	PLUMPJACK_BASE_URL,
	SHOPIFY_PAGE_LIMIT,
	WINE_INDEX_BLOB_KEY,
	MAX_WINE_HISTORY
} from './wine';

describe('wine index config', () => {
	it('has 3 index collections for median tracking', () => {
		expect(WINE_INDEX_COLLECTIONS).toHaveLength(3);
	});

	it('every index collection has a unique category', () => {
		const categories = WINE_INDEX_COLLECTIONS.map((c) => c.category);
		expect(new Set(categories).size).toBe(categories.length);
	});

	it('every index collection has a unique handle', () => {
		const handles = WINE_INDEX_COLLECTIONS.map((c) => c.handle);
		expect(new Set(handles).size).toBe(handles.length);
	});

	it('category order matches collection categories', () => {
		const collectionCategories = new Set(WINE_INDEX_COLLECTIONS.map((c) => c.category));
		for (const cat of WINE_CATEGORY_ORDER) {
			expect(collectionCategories.has(cat)).toBe(true);
		}
	});

	it('listing collections have valid handles', () => {
		expect(WINE_LISTING_COLLECTIONS.staffPicks).toBe('staff-picks');
		expect(WINE_LISTING_COLLECTIONS.allocated).toBe('allocated-wines');
	});

	it('PlumpJack base URL is https', () => {
		expect(PLUMPJACK_BASE_URL).toMatch(/^https:\/\//);
	});

	it('Shopify page limit is 250', () => {
		expect(SHOPIFY_PAGE_LIMIT).toBe(250);
	});

	it('blob key is a valid string', () => {
		expect(WINE_INDEX_BLOB_KEY).toBe('marin-wine-index.json');
	});

	it('max history is 52 weeks (1 year)', () => {
		expect(MAX_WINE_HISTORY).toBe(52);
	});
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/config/wine.test.ts
# Expected: 9 tests pass
```

---

## Task 3: Shopify Scraper

**Files:**

- Create: `src/lib/server/scrapers/wine-index.ts`
- Create: `src/lib/server/scrapers/wine-index.test.ts`

- [ ] **Step 1: Write unit tests first (TDD)**

```typescript
// src/lib/server/scrapers/wine-index.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	computeMedian,
	parseShopifyPrice,
	extractProducts,
	buildCategorySnapshot,
	buildStaffPick
} from './wine-index';
import type { WineProduct, WineStaffPick } from '$lib/types/wine';

describe('parseShopifyPrice', () => {
	it('parses a normal price string', () => {
		expect(parseShopifyPrice('49.99')).toBe(49.99);
	});

	it('parses a whole number price', () => {
		expect(parseShopifyPrice('100.00')).toBe(100);
	});

	it('returns null for empty string', () => {
		expect(parseShopifyPrice('')).toBeNull();
	});

	it('returns null for non-numeric string', () => {
		expect(parseShopifyPrice('N/A')).toBeNull();
	});

	it('returns null for zero price', () => {
		expect(parseShopifyPrice('0.00')).toBeNull();
	});

	it('parses price with no decimal', () => {
		expect(parseShopifyPrice('75')).toBe(75);
	});
});

describe('computeMedian', () => {
	it('returns null for empty array', () => {
		expect(computeMedian([])).toBeNull();
	});

	it('returns the single value for array of length 1', () => {
		expect(computeMedian([42])).toBe(42);
	});

	it('returns the middle value for odd-length array', () => {
		expect(computeMedian([10, 20, 30])).toBe(20);
	});

	it('returns the average of two middle values for even-length array', () => {
		expect(computeMedian([10, 20, 30, 40])).toBe(25);
	});

	it('handles unsorted input', () => {
		expect(computeMedian([30, 10, 20])).toBe(20);
	});

	it('handles prices with decimals', () => {
		expect(computeMedian([49.99, 59.99, 79.99])).toBe(59.99);
	});

	it('rounds to 2 decimal places for even-length averages', () => {
		expect(computeMedian([10.01, 10.02])).toBe(10.02);
	});
});

describe('extractProducts', () => {
	it('extracts products from Shopify API response', () => {
		const shopifyResponse = {
			products: [
				{
					id: 1,
					title: 'Test Wine 2021',
					handle: 'test-wine-2021',
					vendor: 'Test Winery',
					product_type: 'Red Wine',
					tags: 'Cabernet Sauvignon, Napa Valley',
					variants: [
						{
							price: '89.99',
							compare_at_price: '99.99',
							available: true
						}
					]
				},
				{
					id: 2,
					title: 'Another Wine 2020',
					handle: 'another-wine-2020',
					vendor: 'Another Winery',
					product_type: 'White Wine',
					tags: 'Chardonnay, Sonoma',
					variants: [
						{
							price: '45.00',
							compare_at_price: null,
							available: false
						}
					]
				}
			]
		};

		const products = extractProducts(shopifyResponse);
		expect(products).toHaveLength(2);
		expect(products[0]).toEqual({
			id: 1,
			title: 'Test Wine 2021',
			handle: 'test-wine-2021',
			vendor: 'Test Winery',
			product_type: 'Red Wine',
			price: 89.99,
			compareAtPrice: 99.99,
			available: true,
			tags: ['Cabernet Sauvignon', 'Napa Valley']
		});
		expect(products[1]).toEqual({
			id: 2,
			title: 'Another Wine 2020',
			handle: 'another-wine-2020',
			vendor: 'Another Winery',
			product_type: 'White Wine',
			price: 45,
			compareAtPrice: null,
			available: false,
			tags: ['Chardonnay', 'Sonoma']
		});
	});

	it('skips products with no variants', () => {
		const shopifyResponse = {
			products: [
				{
					id: 1,
					title: 'No Variants',
					handle: 'no-variants',
					vendor: 'V',
					product_type: 'Wine',
					tags: '',
					variants: []
				}
			]
		};
		expect(extractProducts(shopifyResponse)).toHaveLength(0);
	});

	it('skips products with zero/null price', () => {
		const shopifyResponse = {
			products: [
				{
					id: 1,
					title: 'Free Wine',
					handle: 'free-wine',
					vendor: 'V',
					product_type: 'Wine',
					tags: '',
					variants: [{ price: '0.00', compare_at_price: null, available: true }]
				}
			]
		};
		expect(extractProducts(shopifyResponse)).toHaveLength(0);
	});

	it('returns empty array for empty products list', () => {
		expect(extractProducts({ products: [] })).toHaveLength(0);
	});
});

describe('buildCategorySnapshot', () => {
	it('builds a snapshot from products', () => {
		const products: WineProduct[] = [
			{
				id: 1,
				title: 'A',
				handle: 'a',
				vendor: 'V',
				product_type: 'Red',
				price: 50,
				compareAtPrice: null,
				available: true,
				tags: []
			},
			{
				id: 2,
				title: 'B',
				handle: 'b',
				vendor: 'V',
				product_type: 'Red',
				price: 100,
				compareAtPrice: null,
				available: true,
				tags: []
			},
			{
				id: 3,
				title: 'C',
				handle: 'c',
				vendor: 'V',
				product_type: 'Red',
				price: 75,
				compareAtPrice: null,
				available: true,
				tags: []
			}
		];

		const snapshot = buildCategorySnapshot('napa-sonoma', 'Napa/Sonoma Cab', products);
		expect(snapshot.category).toBe('napa-sonoma');
		expect(snapshot.label).toBe('Napa/Sonoma Cab');
		expect(snapshot.productCount).toBe(3);
		expect(snapshot.medianPrice).toBe(75);
		expect(snapshot.minPrice).toBe(50);
		expect(snapshot.maxPrice).toBe(100);
	});

	it('handles empty products', () => {
		const snapshot = buildCategorySnapshot('burgundy', 'Burgundy', []);
		expect(snapshot.productCount).toBe(0);
		expect(snapshot.medianPrice).toBeNull();
		expect(snapshot.minPrice).toBeNull();
		expect(snapshot.maxPrice).toBeNull();
	});
});

describe('buildStaffPick', () => {
	it('converts a WineProduct to a WineStaffPick', () => {
		const product: WineProduct = {
			id: 42,
			title: 'Lelarge-Pugeot Tradition NV',
			handle: 'lelarge-pugeot-tradition',
			vendor: 'Lelarge-Pugeot',
			product_type: 'Champagne',
			price: 66,
			compareAtPrice: null,
			available: true,
			tags: ['Champagne', 'France']
		};

		const pick = buildStaffPick(product, 'staff-pick');
		expect(pick).toEqual({
			id: 42,
			title: 'Lelarge-Pugeot Tradition NV',
			handle: 'lelarge-pugeot-tradition',
			vendor: 'Lelarge-Pugeot',
			price: 66,
			compareAtPrice: null,
			available: true,
			listingType: 'staff-pick'
		});
	});

	it('converts with allocated listing type', () => {
		const product: WineProduct = {
			id: 99,
			title: 'Quintarelli Amarone 2017',
			handle: 'quintarelli-amarone-2017',
			vendor: 'Quintarelli',
			product_type: 'Red Wine',
			price: 463,
			compareAtPrice: null,
			available: false,
			tags: ['Amarone']
		};

		const pick = buildStaffPick(product, 'allocated');
		expect(pick.listingType).toBe('allocated');
		expect(pick.available).toBe(false);
	});
});
```

- [ ] **Step 2: Write the scraper**

```typescript
// src/lib/server/scrapers/wine-index.ts

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
				? product.tags
						.split(',')
						.map((t) => t.trim())
						.filter(Boolean)
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
					Accept: 'application/json',
					'User-Agent': 'MarinMonitor/1.0'
				}
			});

			if (!response.ok) {
				console.error(
					`[wine-index] Failed to fetch ${collectionHandle} page ${page}: HTTP ${response.status}`
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

		const snapshot = buildCategorySnapshot(collection.category, collection.label, products);
		categorySnapshots.push(snapshot);

		// Polite delay between collections (1s)
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	// 2. Fetch staff picks
	console.log(`[wine-index] Fetching ${WINE_LISTING_COLLECTIONS.staffPicks}...`);
	const staffPickProducts = await fetchCollectionProducts(WINE_LISTING_COLLECTIONS.staffPicks);
	const staffPicks = staffPickProducts.map((p) => buildStaffPick(p, 'staff-pick'));
	console.log(`[wine-index] Staff picks: ${staffPicks.length} wines`);

	// Polite delay
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// 3. Fetch allocated wines
	console.log(`[wine-index] Fetching ${WINE_LISTING_COLLECTIONS.allocated}...`);
	const allocatedProducts = await fetchCollectionProducts(WINE_LISTING_COLLECTIONS.allocated);
	const allocatedWines = allocatedProducts.map((p) => buildStaffPick(p, 'allocated'));
	console.log(`[wine-index] Allocated wines: ${allocatedWines.length} wines`);

	return {
		timestamp: new Date().toISOString(),
		categories: categorySnapshots,
		staffPicks,
		allocatedWines
	};
}
```

- [ ] **Step 3: Run unit tests**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/server/scrapers/wine-index.test.ts
# Expected: all parseShopifyPrice, computeMedian, extractProducts, buildCategorySnapshot, and buildStaffPick tests pass
```

---

## Task 4: Cron Job

**Files:**

- Create: `src/routes/api/cron/sync-wine-index/+server.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the cron endpoint**

```typescript
// src/routes/api/cron/sync-wine-index/+server.ts

import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeWineIndex } from '$lib/server/scrapers/wine-index';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { WINE_INDEX_BLOB_KEY, MAX_WINE_HISTORY } from '$lib/config/wine';
import type { RequestHandler } from './$types';
import type { WineIndexData, WineSnapshot } from '$lib/types/wine';

export const config = { maxDuration: 120 };

/** Strip bottle listings from a snapshot to keep history entries small */
function toHistoryEntry(snapshot: WineSnapshot): {
	timestamp: string;
	categories: WineSnapshot['categories'];
} {
	return {
		timestamp: snapshot.timestamp,
		categories: snapshot.categories
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const snapshot = await scrapeWineIndex();

		// Read existing blob to append history
		let existing: WineIndexData = { current: null, history: [] };
		try {
			const blob = await head(WINE_INDEX_BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as WineIndexData;
			}
		} catch {
			// No existing blob -- start fresh
		}

		// Append to history (capped), omitting bottle listings from history entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(0, MAX_WINE_HISTORY);

		const data: WineIndexData = {
			current: snapshot,
			history
		};

		await put(WINE_INDEX_BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		const categorySummary = snapshot.categories
			.map((c) => `${c.label}: $${c.medianPrice?.toFixed(2) ?? 'N/A'} (${c.productCount} wines)`)
			.join(', ');

		console.log(
			`[sync-wine-index] OK: ${categorySummary}, ${snapshot.staffPicks.length} staff picks, ${snapshot.allocatedWines.length} allocated in ${Date.now() - start}ms`
		);

		return new Response(
			JSON.stringify({
				ok: true,
				categories: snapshot.categories.map((c) => ({
					category: c.category,
					medianPrice: c.medianPrice,
					productCount: c.productCount
				})),
				staffPickCount: snapshot.staffPicks.length,
				allocatedCount: snapshot.allocatedWines.length
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-wine-index] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
```

- [ ] **Step 2: Add cron entry to vercel.json**

In `vercel.json`, add the sync-wine-index cron to the existing `crons` array. Find the last entry and add the new one:

```jsonc
// FIND this line in vercel.json:
		{ "path": "/api/cron/sync-grocery-basket", "schedule": "0 9 * * 0" }

// REPLACE with (add wine-index cron after it):
		{ "path": "/api/cron/sync-grocery-basket", "schedule": "0 9 * * 0" },
		{ "path": "/api/cron/sync-wine-index", "schedule": "0 10 * * 0" }
```

The schedule `0 10 * * 0` runs every Sunday at 10 AM UTC (3 AM Pacific). This is 1 hour after the grocery basket sync to avoid overlapping.

- [ ] **Step 3: Verify vercel.json is valid JSON**

```bash
cd /Users/tammypais/projects/marin-monitor && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('Valid JSON')"
# Expected: "Valid JSON"
```

---

## Task 5: API Data Endpoint

**Files:**

- Create: `src/routes/api/data/wine-index/+server.ts`

- [ ] **Step 1: Write the data endpoint**

```typescript
// src/routes/api/data/wine-index/+server.ts

import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { WINE_INDEX_BLOB_KEY } from '$lib/config/wine';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const blob = await head(WINE_INDEX_BLOB_KEY, {
			token: env.BLOB_READ_WRITE_TOKEN
		});
		const response = await fetchWithTimeout(
			blob.downloadUrl,
			{
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			},
			8000
		);
		if (response.ok) {
			return new Response(await response.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200'
				}
			});
		}
	} catch {
		// Blob not available -- return empty data
	}

	return new Response(JSON.stringify({ current: null, history: [] }), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};
```

Note: Cache TTL matches Cappuccino (1 hour s-maxage) since wine prices change weekly at most.

---

## Task 6: Client Adapter + Store

**Files:**

- Create: `src/lib/api/marin/wine-index.ts`
- Create: `src/lib/stores/wine-index.ts`
- Modify: `src/lib/stores/refresh.ts`

- [ ] **Step 1: Write the client adapter**

```typescript
// src/lib/api/marin/wine-index.ts

/**
 * Client-side adapter for wine index data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { WineIndexData } from '$lib/types/wine';

export async function fetchWineIndexData(): Promise<WineIndexData> {
	try {
		logger.log('WineIndex', 'Loading wine index data from /api/data/wine-index');

		const response = await fetchWithTimeout('/api/data/wine-index');
		if (!response.ok) {
			throw new Error(`Wine index data fetch failed: ${response.status}`);
		}

		return (await response.json()) as WineIndexData;
	} catch (error) {
		logger.warn('WineIndex', `Wine index data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
```

- [ ] **Step 2: Write the Svelte store**

```typescript
// src/lib/stores/wine-index.ts

/**
 * Wine index store -- shared state for WineIndexPanel
 */

import { writable, derived } from 'svelte/store';
import type { WineIndexData } from '$lib/types/wine';

export const wineIndexStore = writable<WineIndexData>({ current: null, history: [] });

export const currentWineCategories = derived(wineIndexStore, ($d) => $d.current?.categories ?? []);

export const currentStaffPicks = derived(wineIndexStore, ($d) => $d.current?.staffPicks ?? []);

export const currentAllocatedWines = derived(
	wineIndexStore,
	($d) => $d.current?.allocatedWines ?? []
);
```

- [ ] **Step 3: Add wine-index to refresh stages**

In `src/lib/stores/refresh.ts`, find the tertiary stage and add `'wine-index'` to its categories:

```typescript
// FIND this line:
		categories: ['housing', 'gas-prices', 'ev-charging', 'cappuccino', 'grocery-basket', 'satire', 'earthquakes', 'strava'],

// REPLACE with:
		categories: ['housing', 'gas-prices', 'ev-charging', 'cappuccino', 'grocery-basket', 'wine-index', 'satire', 'earthquakes', 'strava'],
```

---

## Task 7: Panel Component

**Files:**

- Create: `src/lib/components/panels/WineIndexPanel.svelte`

- [ ] **Step 1: Write the WineIndexPanel**

```svelte
<!-- src/lib/components/panels/WineIndexPanel.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchWineIndexData } from '$lib/api/marin/wine-index';
	import { wineIndexStore } from '$lib/stores/wine-index';
	import { select } from 'd3-selection';
	import { scaleLinear } from 'd3-scale';
	import { line, curveMonotoneX } from 'd3-shape';
	import type {
		WineIndexData,
		WineCategory,
		WineCategorySnapshot,
		WineStaffPick
	} from '$lib/types/wine';
	import { WINE_ACCENT, WINE_ACCENT_FILL, WINE_CATEGORY_ORDER } from '$lib/config/wine';

	const SPARKLINE_W = 80;
	const SPARKLINE_H = 24;

	let data = $state<WineIndexData>({ current: null, history: [] });
	let dataLoading = $state(false);
	let showAllStaffPicks = $state(false);
	let showAllAllocated = $state(false);

	const current = $derived(data.current);

	// Build sorted history per category for sparklines
	const categoryHistories = $derived.by(() => {
		const histories = new Map<WineCategory, { timestamp: string; medianPrice: number }[]>();

		for (const cat of WINE_CATEGORY_ORDER) {
			const catHistory: { timestamp: string; medianPrice: number }[] = [];

			for (const entry of data.history) {
				const catSnap = entry.categories.find((c) => c.category === cat);
				if (catSnap?.medianPrice !== null && catSnap?.medianPrice !== undefined) {
					catHistory.push({
						timestamp: entry.timestamp,
						medianPrice: catSnap.medianPrice
					});
				}
			}

			// Sort oldest first
			catHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

			histories.set(cat, catHistory);
		}

		return histories;
	});

	// Ordered categories from current snapshot
	const orderedCategories = $derived.by(() => {
		if (!current) return [];
		const result: WineCategorySnapshot[] = [];
		for (const cat of WINE_CATEGORY_ORDER) {
			const snap = current.categories.find((c) => c.category === cat);
			if (snap) result.push(snap);
		}
		return result;
	});

	const staffPicks = $derived(current?.staffPicks ?? []);
	const allocatedWines = $derived(current?.allocatedWines ?? []);
	const visibleStaffPicks = $derived(showAllStaffPicks ? staffPicks : staffPicks.slice(0, 8));
	const visibleAllocated = $derived(showAllAllocated ? allocatedWines : allocatedWines.slice(0, 6));

	function formatPrice(price: number): string {
		return `$${price.toFixed(0)}`;
	}

	function computeWeeklyChange(category: WineCategory): { value: number; label: string } | null {
		const history = categoryHistories.get(category);
		if (!history || history.length < 2) return null;

		const latest = history[history.length - 1].medianPrice;
		const previous = history[history.length - 2].medianPrice;
		const diff = Math.round((latest - previous) * 100) / 100;
		const pct = previous !== 0 ? Math.round((diff / previous) * 1000) / 10 : 0;

		return {
			value: diff,
			label: `${diff >= 0 ? '+' : ''}${pct.toFixed(1)}%`
		};
	}

	function drawSparkline(svg: SVGSVGElement, category: WineCategory) {
		const history = categoryHistories.get(category);
		if (!svg || !history || history.length < 2) return;

		const s = select(svg);
		s.selectAll('*').remove();

		const prices = history.map((h) => h.medianPrice);
		const yMin = Math.min(...prices) * 0.98;
		const yMax = Math.max(...prices) * 1.02;

		const x = scaleLinear()
			.domain([0, prices.length - 1])
			.range([2, SPARKLINE_W - 2]);
		const y = scaleLinear()
			.domain([yMin, yMax])
			.range([SPARKLINE_H - 2, 2]);

		const lineGen = line<number>()
			.x((_d, i) => x(i))
			.y((d) => y(d))
			.curve(curveMonotoneX);

		s.append('path')
			.datum(prices)
			.attr('d', lineGen)
			.attr('fill', 'none')
			.attr('stroke', WINE_ACCENT)
			.attr('stroke-width', 1.5);

		// End dot
		s.append('circle')
			.attr('cx', x(prices.length - 1))
			.attr('cy', y(prices[prices.length - 1]))
			.attr('r', 2)
			.attr('fill', WINE_ACCENT);
	}

	onMount(() => {
		void (async () => {
			dataLoading = true;
			try {
				data = await fetchWineIndexData();
				wineIndexStore.set(data);
			} finally {
				dataLoading = false;
			}
		})();
	});

	// Draw sparklines when data is ready
	function sparklineRef(category: WineCategory) {
		return (el: SVGSVGElement) => {
			if (el) {
				// Use $effect-like behavior via setTimeout to ensure data is rendered
				setTimeout(() => drawSparkline(el, category), 0);
			}
		};
	}
</script>

<Panel id="wine-index" title="Wine Index" loading={dataLoading}>
	{#if current}
		<!-- Category medians with sparklines -->
		<div class="categories-grid">
			{#each orderedCategories as cat}
				{@const change = computeWeeklyChange(cat.category)}
				{@const history = categoryHistories.get(cat.category)}
				<div class="category-card">
					<div class="category-header">
						<span class="category-label">{cat.label}</span>
						<span class="category-count">{cat.productCount} wines</span>
					</div>
					<div class="category-body">
						<div class="category-price-col">
							<span class="category-price">
								{cat.medianPrice !== null ? formatPrice(cat.medianPrice) : 'N/A'}
							</span>
							<span class="category-sublabel">median</span>
							{#if change}
								<span
									class="category-change"
									class:up={change.value > 0}
									class:down={change.value < 0}
								>
									{change.label}
								</span>
							{/if}
						</div>
						{#if history && history.length >= 2}
							<svg
								class="sparkline-svg"
								width={SPARKLINE_W}
								height={SPARKLINE_H}
								use:sparklineRef={cat.category}
							></svg>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Staff Picks listing -->
		{#if staffPicks.length > 0}
			<div class="listing-section">
				<div class="section-label">Staff Picks</div>
				{#each visibleStaffPicks as pick}
					<div class="bottle-row">
						<div class="bottle-info">
							<span class="bottle-name">{pick.title}</span>
							<span class="bottle-vendor">{pick.vendor}</span>
						</div>
						<div class="bottle-price-col">
							{#if pick.compareAtPrice}
								<span class="bottle-compare">${pick.compareAtPrice.toFixed(0)}</span>
							{/if}
							<span class="bottle-price" class:on-sale={pick.compareAtPrice !== null}>
								${pick.price.toFixed(0)}
							</span>
							{#if !pick.available}
								<span class="bottle-badge sold-out">Sold Out</span>
							{/if}
						</div>
					</div>
				{/each}
				{#if staffPicks.length > 8}
					<button class="show-more-btn" onclick={() => (showAllStaffPicks = !showAllStaffPicks)}>
						{showAllStaffPicks ? 'Show fewer' : `Show all ${staffPicks.length}`}
					</button>
				{/if}
			</div>
		{/if}

		<!-- Allocated / Limited wines listing -->
		{#if allocatedWines.length > 0}
			<div class="listing-section">
				<div class="section-label">Allocated & Limited</div>
				{#each visibleAllocated as pick}
					<div class="bottle-row">
						<div class="bottle-info">
							<span class="bottle-name">{pick.title}</span>
							<span class="bottle-vendor">{pick.vendor}</span>
						</div>
						<div class="bottle-price-col">
							{#if pick.compareAtPrice}
								<span class="bottle-compare">${pick.compareAtPrice.toFixed(0)}</span>
							{/if}
							<span class="bottle-price" class:on-sale={pick.compareAtPrice !== null}>
								${pick.price.toFixed(0)}
							</span>
							{#if !pick.available}
								<span class="bottle-badge sold-out">Sold Out</span>
							{/if}
						</div>
					</div>
				{/each}
				{#if allocatedWines.length > 6}
					<button class="show-more-btn" onclick={() => (showAllAllocated = !showAllAllocated)}>
						{showAllAllocated ? 'Show fewer' : `Show all ${allocatedWines.length}`}
					</button>
				{/if}
			</div>
		{/if}

		<!-- Attribution -->
		<div class="attribution">Data via PlumpJack Wine & Spirits</div>
	{:else if dataLoading}
		<div class="empty-state">Loading wine index data...</div>
	{:else}
		<div class="empty-state">Wine index data will appear after the first sync cycle.</div>
	{/if}
</Panel>

<style>
	.categories-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.category-card {
		padding: 0.55rem 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.category-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.3rem;
	}

	.category-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.category-count {
		font-size: 0.45rem;
		color: var(--text-dim);
	}

	.category-body {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
	}

	.category-price-col {
		display: flex;
		flex-direction: column;
	}

	.category-price {
		font-size: 1.1rem;
		font-weight: 700;
		color: #7c3aed;
		letter-spacing: 0.01em;
	}

	.category-sublabel {
		font-size: 0.45rem;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.category-change {
		font-size: 0.5rem;
		font-weight: 600;
		margin-top: 0.1rem;
	}

	.category-change.up {
		color: #f59e0b;
	}

	.category-change.down {
		color: #10b981;
	}

	.sparkline-svg {
		display: block;
		flex-shrink: 0;
	}

	.listing-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.section-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
	}

	.bottle-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.3rem 0;
	}

	.bottle-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.bottle-name {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bottle-vendor {
		font-size: 0.48rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bottle-price-col {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-left: 0.5rem;
		white-space: nowrap;
	}

	.bottle-compare {
		font-size: 0.55rem;
		color: var(--text-dim);
		text-decoration: line-through;
	}

	.bottle-price {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--text);
	}

	.bottle-price.on-sale {
		color: #10b981;
	}

	.bottle-badge {
		font-size: 0.42rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.3rem;
		border-radius: 2px;
	}

	.bottle-badge.sold-out {
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.12);
	}

	.show-more-btn {
		display: block;
		width: 100%;
		margin-top: 0.3rem;
		padding: 0.3rem;
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		color: var(--text-muted);
		font-size: 0.5rem;
		cursor: pointer;
		text-align: center;
		transition:
			color 0.15s,
			border-color 0.15s;
	}

	.show-more-btn:hover {
		color: var(--text);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.attribution {
		text-align: center;
		font-size: 0.45rem;
		color: var(--text-dim);
		padding-top: 0.3rem;
	}

	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.7rem;
		padding: 1rem;
	}

	@media (max-width: 1100px) {
		.categories-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
```

**IMPORTANT: Svelte `use:` directive note:** The `use:sparklineRef={cat.category}` pattern passes the category as a parameter to the action function. The action function returns a reference that calls `drawSparkline` when the DOM element is ready. If the Svelte 5 `use:` directive does not support parameterized returns this way, use an alternative approach:

Replace `use:sparklineRef={cat.category}` with a `bind:this` + `$effect` pattern:

```svelte
<!-- Alternative if use: doesn't work with parameters -->
<script lang="ts">
	// Add to script block:
	let sparklineRefs = $state<Record<string, SVGSVGElement>>({});

	$effect(() => {
		for (const cat of WINE_CATEGORY_ORDER) {
			const el = sparklineRefs[cat];
			if (el) {
				drawSparkline(el, cat);
			}
		}
	});
</script>

<!-- Then in template, replace the svg element with: -->
<svg
	class="sparkline-svg"
	width={SPARKLINE_W}
	height={SPARKLINE_H}
	bind:this={sparklineRefs[cat.category]}
></svg>
```

Either approach works. The implementer should verify which compiles cleanly.

---

## Task 8: Config Registration + SignalDeck Wiring

**Files:**

- Modify: `src/lib/config/panels.ts`
- Modify: `src/lib/components/panels/index.ts`
- Modify: `src/lib/components/dashboard/SignalDeck.svelte`

- [ ] **Step 1: Add wine-index to PanelId union**

In `src/lib/config/panels.ts`, add `'wine-index'` to the PanelId type:

```typescript
// FIND this line:
	| 'grocery-basket';

// REPLACE with:
	| 'grocery-basket'
	| 'wine-index';
```

- [ ] **Step 2: Add wine-index to PANELS record**

In `src/lib/config/panels.ts`, add the wine-index entry to the PANELS object. Find the `'grocery-basket'` entry and add after it:

```typescript
// FIND this block:
	'grocery-basket': {
		name: 'The Bare Essentials',
		priority: 3,
		description: '12-item grocery basket tracked weekly via Instacart'
	}

// REPLACE with:
	'grocery-basket': {
		name: 'The Bare Essentials',
		priority: 3,
		description: '12-item grocery basket tracked weekly via Instacart'
	},
	'wine-index': {
		name: 'Wine Index',
		priority: 3,
		description: 'Premium wine category medians and curated picks via PlumpJack'
	}
```

- [ ] **Step 3: Add wine-index to DEFAULT_PANEL_ORDER**

In `src/lib/config/panels.ts`, add `'wine-index'` to the DEFAULT_PANEL_ORDER array. Place it after `'cappuccino'` to group the indices together:

```typescript
// FIND this line:
	'cappuccino',

// REPLACE with:
	'cappuccino',
	'wine-index',
```

- [ ] **Step 4: Add WineIndexPanel to barrel export**

In `src/lib/components/panels/index.ts`, add the export after GroceryBasketPanel:

```typescript
// FIND this line:
export { default as GroceryBasketPanel } from './GroceryBasketPanel.svelte';

// REPLACE with:
export { default as GroceryBasketPanel } from './GroceryBasketPanel.svelte';
export { default as WineIndexPanel } from './WineIndexPanel.svelte';
```

- [ ] **Step 5: Wire WineIndexPanel into SignalDeck**

In `src/lib/components/dashboard/SignalDeck.svelte`, add the import and render block.

First, add to the import statement:

```typescript
// FIND this line:
import {
	WeatherPanel,
	TidesPanel,
	PulsePanel,
	OutlooksPanel,
	SignalsPanel,
	HousingPanel,
	GasPricesPanel,
	EvChargingPanel,
	EnvironmentPanel,
	ConditionsPanel,
	WastewaterPanel,
	AirportStatusPanel,
	CappuccinoPanel,
	GroceryBasketPanel
} from '$lib/components/panels';

// REPLACE with:
import {
	WeatherPanel,
	TidesPanel,
	PulsePanel,
	OutlooksPanel,
	SignalsPanel,
	HousingPanel,
	GasPricesPanel,
	EvChargingPanel,
	EnvironmentPanel,
	ConditionsPanel,
	WastewaterPanel,
	AirportStatusPanel,
	CappuccinoPanel,
	GroceryBasketPanel,
	WineIndexPanel
} from '$lib/components/panels';
```

Then, add the render block in the right column, after the CappuccinoPanel block:

```svelte
<!-- FIND this block: -->
		{#if isPanelVisible('cappuccino')}
			<div class="signal-card signal-cappuccino animate-enter-up stagger-4 hover-lift">
				<CappuccinoPanel />
			</div>
		{/if}
	</div>
</div>

<!-- REPLACE with: -->
		{#if isPanelVisible('cappuccino')}
			<div class="signal-card signal-cappuccino animate-enter-up stagger-4 hover-lift">
				<CappuccinoPanel />
			</div>
		{/if}

		{#if isPanelVisible('wine-index')}
			<div class="signal-card signal-wine-index animate-enter-up stagger-4 hover-lift">
				<WineIndexPanel />
			</div>
		{/if}
	</div>
</div>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/tammypais/projects/marin-monitor && npx tsc --noEmit --pretty 2>&1 | head -30
# Expected: no type errors
```

---

## Task 9: Tests + Final Verification + Commit

- [ ] **Step 1: Run all existing tests to ensure nothing is broken**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run
# Expected: all existing tests pass (103+ tests)
```

- [ ] **Step 2: Run the new wine config tests**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/config/wine.test.ts
# Expected: 9 tests pass
```

- [ ] **Step 3: Run the new wine scraper tests**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/server/scrapers/wine-index.test.ts
# Expected: all tests pass (parseShopifyPrice, computeMedian, extractProducts, buildCategorySnapshot, buildStaffPick)
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd /Users/tammypais/projects/marin-monitor && npm run check
# Expected: no type errors
```

- [ ] **Step 5: Run lint**

```bash
cd /Users/tammypais/projects/marin-monitor && npm run lint
# Expected: no lint errors (fix any formatting issues with npm run format first)
```

- [ ] **Step 6: Start dev server and verify panel renders**

```bash
cd /Users/tammypais/projects/marin-monitor && npm run dev
# Visit http://localhost:5173
# Verify: Wine Index panel appears in right column of SignalDeck
# Verify: Panel shows "Wine index data will appear after the first sync cycle." (empty state)
# Verify: No console errors
```

- [ ] **Step 7: Test the cron endpoint locally (optional but recommended)**

```bash
# In a separate terminal, with dev server running:
curl -H "Authorization: Bearer test" http://localhost:5173/api/cron/sync-wine-index
# Expected: will fail auth (CRON_SECRET not set locally), which confirms the endpoint is wired up
# To actually test the Shopify fetch, temporarily comment out the auth check and run again
```

- [ ] **Step 8: Commit and push**

```bash
cd /Users/tammypais/projects/marin-monitor
git add \
  src/lib/types/wine.ts \
  src/lib/types/index.ts \
  src/lib/config/wine.ts \
  src/lib/config/wine.test.ts \
  src/lib/config/panels.ts \
  src/lib/server/scrapers/wine-index.ts \
  src/lib/server/scrapers/wine-index.test.ts \
  src/routes/api/cron/sync-wine-index/+server.ts \
  src/routes/api/data/wine-index/+server.ts \
  src/lib/api/marin/wine-index.ts \
  src/lib/stores/wine-index.ts \
  src/lib/stores/refresh.ts \
  src/lib/components/panels/WineIndexPanel.svelte \
  src/lib/components/panels/index.ts \
  src/lib/components/dashboard/SignalDeck.svelte \
  vercel.json

git commit -m "Add Wine Index panel -- PlumpJack Shopify category medians + curated picks

Tracks Napa/Sonoma Cab, Burgundy, and Champagne median prices via
PlumpJack's public Shopify API with sparkline trends. Surfaces staff
picks and allocated/limited wine listings. Weekly cron, Vercel Blob
storage, follows Cappuccino Index pattern exactly."

git push origin main
```

---

## Summary of All Files

### New Files (9)

1. `src/lib/types/wine.ts` -- Type definitions
2. `src/lib/config/wine.ts` -- PlumpJack config, collection handles, constants
3. `src/lib/config/wine.test.ts` -- Config validation tests
4. `src/lib/server/scrapers/wine-index.ts` -- Shopify scraper with pagination
5. `src/lib/server/scrapers/wine-index.test.ts` -- Scraper unit tests
6. `src/routes/api/cron/sync-wine-index/+server.ts` -- Weekly cron job
7. `src/routes/api/data/wine-index/+server.ts` -- Data API endpoint
8. `src/lib/api/marin/wine-index.ts` -- Client adapter
9. `src/lib/stores/wine-index.ts` -- Svelte store

### Modified Files (6)

1. `src/lib/types/index.ts` -- Re-export wine types
2. `src/lib/config/panels.ts` -- Add `wine-index` PanelId + config + default order
3. `src/lib/components/panels/index.ts` -- Export WineIndexPanel
4. `src/lib/components/dashboard/SignalDeck.svelte` -- Import + render WineIndexPanel
5. `src/lib/stores/refresh.ts` -- Add `wine-index` to tertiary stage
6. `vercel.json` -- Add sync-wine-index cron entry

### Key Design Decisions

1. **No map layer** -- Wine is not geo-located like coffee shops or gas stations. The panel is purely a data index, not a map feature.
2. **No Playwright/browser** -- PlumpJack's Shopify API returns clean JSON. Plain `fetch()` is sufficient, making this scraper simpler and faster than the Cappuccino Index.
3. **Pagination handling** -- Collections can exceed 250 products (Napa/Sonoma has 384). The scraper fetches `page=1, page=2, ...` until an empty response is returned.
4. **History stores categories only** -- Staff picks and allocated wines rotate, so storing them in history is wasteful. Only category medians are tracked over time for sparklines.
5. **Wine accent color** -- Deep purple `#7c3aed` (Tailwind violet-600) for wine-appropriate visual distinction from coffee brown (`#a16207`).
6. **Bottle listing caps** -- Staff picks show first 8, allocated show first 6, with "Show all N" toggle. This keeps the panel compact by default.
7. **Weekly cadence on Sundays at 3 AM Pacific** -- Runs after the grocery basket sync (2 AM Pacific) to avoid overlapping serverless function invocations.
