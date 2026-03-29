# The Bare Essentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weekly grocery basket price tracker ("The Bare Essentials") that scrapes Instacart cross-store search for 12 Marin-coded products and displays total basket cost, per-item breakdowns, and price trends over time.

**Architecture:** A weekly cron job scrapes Instacart's cross-store search (`instacart.com/store/s?k={term}`) for each of 12 basket items, extracts prices and store names from the HTML, then stores snapshots in Vercel Blob. A public API route serves the data, a client adapter fetches it, and a Svelte 5 panel renders the basket total, sparkline trend, and per-item drill-down. Follows the gas-prices pipeline pattern exactly: scraper -> cron -> blob -> API -> adapter -> store -> panel.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Vercel Blob, Vercel Cron, D3.js (sparkline), Vitest

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/types/grocery.ts` | Type definitions for basket items, price results, snapshots |
| `src/lib/config/grocery-basket.ts` | 12-item basket configuration with search terms and product matchers |
| `src/lib/server/scrapers/grocery-basket.ts` | Instacart HTML scraper + price extraction |
| `src/routes/api/cron/sync-grocery-basket/+server.ts` | Weekly cron: scrape all items, store to blob |
| `src/routes/api/data/grocery-basket/+server.ts` | Serve grocery basket data from blob |
| `src/lib/api/marin/grocery-basket.ts` | Client-side data adapter |
| `src/lib/stores/grocery-basket.ts` | Reactive Svelte store |
| `src/lib/components/panels/GroceryBasketPanel.svelte` | Dashboard panel with basket total + sparkline + drill-down |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/types/index.ts` | Re-export grocery types |
| `src/lib/config/panels.ts` | Add `grocery-basket` PanelId + config + panel order |
| `src/lib/components/panels/index.ts` | Export GroceryBasketPanel |
| `src/lib/components/dashboard/SignalDeck.svelte` | Add GroceryBasketPanel rendering |
| `vercel.json` | Add weekly cron entry |

### Test Files

| File | Tests |
|------|-------|
| `src/lib/config/grocery-basket.test.ts` | Basket config validation |
| `src/lib/server/scrapers/grocery-basket.test.ts` | HTML parsing + price extraction |
| `src/lib/api/marin/grocery-basket.test.ts` | Client adapter fetch/fallback |

---

## Task 1: Type Definitions

**Files:**
- Create: `src/lib/types/grocery.ts`
- Modify: `src/lib/types/index.ts`

- [ ] **Step 1: Write type definitions**

```typescript
// src/lib/types/grocery.ts

/** A single item in the Bare Essentials basket */
export interface BasketItem {
	id: string;
	name: string;
	/** Size/quantity descriptor, e.g. "12 ct", "64 fl oz" */
	size: string;
	/** Search term used for Instacart search */
	searchTerm: string;
	/** Reference price from initial research (anchor store) */
	referencePrice: number;
	/** Reference store name */
	referenceStore: string;
	/** Category for grouping in UI */
	category: 'produce' | 'dairy-alt' | 'protein' | 'pantry' | 'beverages' | 'supplements';
}

/** A price result from a single store for one item */
export interface ItemPriceResult {
	/** basket item id */
	itemId: string;
	/** store name from Instacart (e.g. "Sprouts", "Safeway") */
	store: string;
	/** price in dollars */
	price: number;
	/** product name as listed on Instacart */
	productName: string;
	/** whether this appears to be a sale price */
	onSale: boolean;
}

/** Price data for a single basket item across all stores */
export interface BasketItemPrices {
	itemId: string;
	itemName: string;
	cheapest: number | null;
	cheapestStore: string | null;
	mostExpensive: number | null;
	mostExpensiveStore: string | null;
	/** All store prices found */
	storePrices: ItemPriceResult[];
}

/** A single weekly snapshot of the full basket */
export interface GrocerySnapshot {
	timestamp: string;
	/** Total basket cost using cheapest store for each item */
	totalCheapest: number | null;
	/** Total basket cost at most expensive stores */
	totalExpensive: number | null;
	/** Number of items successfully priced */
	itemsFound: number;
	/** Per-item price data (included in current, omitted from history) */
	items: BasketItemPrices[];
}

/** Top-level data structure stored in Vercel Blob */
export interface GroceryBasketData {
	current: GrocerySnapshot | null;
	history: GrocerySnapshot[];
}
```

- [ ] **Step 2: Add re-exports to types/index.ts**

Add the following to the end of `src/lib/types/index.ts`:

```typescript
export type {
	BasketItem,
	ItemPriceResult,
	BasketItemPrices,
	GrocerySnapshot,
	GroceryBasketData
} from './grocery';
```

- [ ] **Step 3: Verify types compile**

```bash
cd /Users/tammypais/projects/marin-monitor && npx tsc --noEmit src/lib/types/grocery.ts
```

Expected: no errors.

---

## Task 2: Basket Configuration

**Files:**
- Create: `src/lib/config/grocery-basket.ts`
- Test: `src/lib/config/grocery-basket.test.ts`

- [ ] **Step 1: Write tests first**

```typescript
// src/lib/config/grocery-basket.test.ts

import { describe, it, expect } from 'vitest';
import { BASKET_ITEMS, getSearchTerm } from './grocery-basket';

describe('BASKET_ITEMS', () => {
	it('contains exactly 12 items', () => {
		expect(BASKET_ITEMS).toHaveLength(12);
	});

	it('every item has a unique id', () => {
		const ids = BASKET_ITEMS.map((i) => i.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('every item has a non-empty searchTerm', () => {
		for (const item of BASKET_ITEMS) {
			expect(item.searchTerm.length).toBeGreaterThan(0);
		}
	});

	it('every item has a positive referencePrice', () => {
		for (const item of BASKET_ITEMS) {
			expect(item.referencePrice).toBeGreaterThan(0);
		}
	});

	it('every item has a valid category', () => {
		const validCategories = ['produce', 'dairy-alt', 'protein', 'pantry', 'beverages', 'supplements'];
		for (const item of BASKET_ITEMS) {
			expect(validCategories).toContain(item.category);
		}
	});
});

describe('getSearchTerm', () => {
	it('returns the searchTerm for a known item id', () => {
		const term = getSearchTerm('vital-farms-eggs');
		expect(term).toBe('Vital Farms Pasture-Raised Large Eggs 12 ct');
	});

	it('returns null for an unknown item id', () => {
		const term = getSearchTerm('nonexistent');
		expect(term).toBeNull();
	});
});
```

- [ ] **Step 2: Write basket configuration**

```typescript
// src/lib/config/grocery-basket.ts

import type { BasketItem } from '$lib/types/grocery';

/**
 * The Bare Essentials — 12 aggressively Marin grocery items.
 * All items are branded, fixed-package products to avoid per-lb variability.
 */
export const BASKET_ITEMS: BasketItem[] = [
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
		referencePrice: 3.50,
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

/** Lookup a basket item's search term by item ID */
export function getSearchTerm(itemId: string): string | null {
	const item = BASKET_ITEMS.find((i) => i.id === itemId);
	return item?.searchTerm ?? null;
}

/** Get a basket item by ID */
export function getBasketItem(itemId: string): BasketItem | undefined {
	return BASKET_ITEMS.find((i) => i.id === itemId);
}

/** Total reference price (sum of all reference prices) */
export const BASKET_REFERENCE_TOTAL = BASKET_ITEMS.reduce(
	(sum, item) => sum + item.referencePrice,
	0
);
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/config/grocery-basket.test.ts
```

Expected: all 6 tests pass.

---

## Task 3: Instacart Scraper

**Files:**
- Create: `src/lib/server/scrapers/grocery-basket.ts`
- Test: `src/lib/server/scrapers/grocery-basket.test.ts`

- [ ] **Step 1: Write tests first**

```typescript
// src/lib/server/scrapers/grocery-basket.test.ts

import { describe, it, expect } from 'vitest';
import { parseInstacartResults, buildSearchUrl, scorePriceMatch } from './grocery-basket';

describe('buildSearchUrl', () => {
	it('encodes the search term into an Instacart URL', () => {
		const url = buildSearchUrl('Vital Farms Eggs 12 ct');
		expect(url).toBe(
			'https://www.instacart.com/store/s?k=Vital%20Farms%20Eggs%2012%20ct'
		);
	});

	it('handles special characters', () => {
		const url = buildSearchUrl("Justin's Classic Almond Butter");
		expect(url).toContain("Justin's%20Classic%20Almond%20Butter");
	});
});

describe('parseInstacartResults', () => {
	const sampleHtml = `
		<div data-testid="product-card">
			<span data-testid="product-card-name">Vital Farms Pasture-Raised Large Eggs, 12 ct</span>
			<span data-testid="product-card-price">$8.99</span>
			<span data-testid="product-card-store">Sprouts</span>
		</div>
		<div data-testid="product-card">
			<span data-testid="product-card-name">Vital Farms Pasture-Raised Eggs, Large, 12 Count</span>
			<span data-testid="product-card-price">$12.99</span>
			<span data-testid="product-card-store">Safeway</span>
		</div>
		<div data-testid="product-card">
			<span data-testid="product-card-name">Organic Valley Large Brown Eggs</span>
			<span data-testid="product-card-price">$7.49</span>
			<span data-testid="product-card-store">Sprouts</span>
		</div>
	`;

	it('extracts product cards from HTML', () => {
		const results = parseInstacartResults(sampleHtml);
		expect(results.length).toBeGreaterThanOrEqual(2);
	});

	it('extracts price as a number', () => {
		const results = parseInstacartResults(sampleHtml);
		const first = results[0];
		expect(typeof first.price).toBe('number');
		expect(first.price).toBeGreaterThan(0);
	});

	it('extracts store name', () => {
		const results = parseInstacartResults(sampleHtml);
		expect(results[0].store.length).toBeGreaterThan(0);
	});

	it('returns empty array for empty HTML', () => {
		expect(parseInstacartResults('')).toEqual([]);
	});

	it('returns empty array for HTML with no product cards', () => {
		expect(parseInstacartResults('<div>No results</div>')).toEqual([]);
	});
});

describe('scorePriceMatch', () => {
	it('scores exact name match highest', () => {
		const score = scorePriceMatch(
			'Vital Farms Pasture-Raised Large Eggs, 12 ct',
			'Vital Farms Pasture-Raised Large Eggs, 12 ct'
		);
		expect(score).toBe(1.0);
	});

	it('scores partial match lower', () => {
		const score = scorePriceMatch(
			'Vital Farms Pasture-Raised Eggs, Large, 12 Count',
			'Vital Farms Pasture-Raised Large Eggs, 12 ct'
		);
		expect(score).toBeGreaterThan(0.5);
		expect(score).toBeLessThan(1.0);
	});

	it('scores unrelated product near zero', () => {
		const score = scorePriceMatch(
			'Organic Valley Large Brown Eggs',
			'Silver Oak Alexander Valley Cabernet Sauvignon'
		);
		expect(score).toBeLessThan(0.3);
	});
});
```

- [ ] **Step 2: Write the Instacart scraper**

```typescript
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
	const params = new URLSearchParams({ k: searchTerm });
	return `${INSTACART_BASE}?${params.toString()}`;
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
```

- [ ] **Step 3: Run scraper tests**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/server/scrapers/grocery-basket.test.ts
```

Expected: all tests pass.

---

## Task 4: Cron Job

**Files:**
- Create: `src/routes/api/cron/sync-grocery-basket/+server.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the cron job**

```typescript
// src/routes/api/cron/sync-grocery-basket/+server.ts

import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeGroceryBasket } from '$lib/server/scrapers/grocery-basket';
import { verifyCronAuth } from '$lib/server/cron-auth';
import type { RequestHandler } from './$types';
import type { GroceryBasketData, GrocerySnapshot } from '$lib/types/grocery';

export const config = { maxDuration: 120 };

const BLOB_KEY = 'marin-grocery-basket.json';
const MAX_HISTORY_ENTRIES = 104; // ~2 years at weekly cadence

/** Strip per-item storePrices from a snapshot to keep history entries small */
function toHistoryEntry(
	snapshot: GrocerySnapshot
): GrocerySnapshot {
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
			storePrices: [] // Strip store-level detail from history
		}))
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const snapshot = await scrapeGroceryBasket();

		// Read existing blob to append history
		let existing: GroceryBasketData = { current: null, history: [] };
		try {
			const blob = await head(BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as GroceryBasketData;
			}
		} catch {
			// No existing blob -- start fresh
		}

		// Append to history (capped), with stripped-down entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(
			0,
			MAX_HISTORY_ENTRIES
		);

		const data: GroceryBasketData = {
			current: snapshot,
			history
		};

		await put(BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log(
			`[sync-grocery-basket] OK: ${snapshot.itemsFound}/12 items priced, ` +
			`total $${snapshot.totalCheapest?.toFixed(2) ?? 'N/A'} in ${Date.now() - start}ms`
		);
		return new Response(
			JSON.stringify({
				ok: true,
				itemsFound: snapshot.itemsFound,
				totalCheapest: snapshot.totalCheapest
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(
			`[sync-grocery-basket] FAILED after ${Date.now() - start}ms:`,
			message
		);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
```

- [ ] **Step 2: Add cron schedule to vercel.json**

In `vercel.json`, add the grocery basket cron entry to the `crons` array. The new entry runs weekly on Sundays at 8:00 AM UTC:

```json
{ "path": "/api/cron/sync-grocery-basket", "schedule": "0 8 * * 0" }
```

The full `vercel.json` should be:

```json
{
	"crons": [
		{ "path": "/api/cron/sync-activity", "schedule": "0 */6 * * *" },
		{ "path": "/api/cron/sync-police", "schedule": "0 3,9,15,21 * * *" },
		{ "path": "/api/cron/sync-housing", "schedule": "0 0 * * 1" },
		{ "path": "/api/cron/sync-gas-prices", "schedule": "0 */4 * * *" },
		{ "path": "/api/cron/sync-ev-charging", "schedule": "0 6 * * *" },
		{ "path": "/api/cron/sync-strava-segments", "schedule": "0 10 * * 0" },
		{ "path": "/api/cron/sync-strava-leaderboards", "schedule": "0 12 * * *" },
		{ "path": "/api/cron/sync-grocery-basket", "schedule": "0 8 * * 0" }
	]
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/tammypais/projects/marin-monitor && npm run check
```

Expected: no TypeScript errors.

---

## Task 5: API Data Endpoint

**Files:**
- Create: `src/routes/api/data/grocery-basket/+server.ts`

- [ ] **Step 1: Write the data endpoint**

```typescript
// src/routes/api/data/grocery-basket/+server.ts

import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const blob = await head('marin-grocery-basket.json', {
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
					'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
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

---

## Task 6: Client Adapter + Store

**Files:**
- Create: `src/lib/api/marin/grocery-basket.ts`
- Create: `src/lib/stores/grocery-basket.ts`
- Test: `src/lib/api/marin/grocery-basket.test.ts`

- [ ] **Step 1: Write client adapter tests first**

```typescript
// src/lib/api/marin/grocery-basket.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGroceryBasketData } from './grocery-basket';

// Mock $lib/config/api
vi.mock('$lib/config/api', () => ({
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

describe('fetchGroceryBasketData', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns data from a successful fetch', async () => {
		const mockData = {
			current: {
				timestamp: '2026-03-29T08:00:00Z',
				totalCheapest: 185.50,
				totalExpensive: 242.30,
				itemsFound: 12,
				items: []
			},
			history: []
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockData)
		});

		const result = await fetchGroceryBasketData();
		expect(result.current?.totalCheapest).toBe(185.50);
		expect(result.current?.itemsFound).toBe(12);
	});

	it('returns empty data on fetch failure', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500
		});

		const result = await fetchGroceryBasketData();
		expect(result.current).toBeNull();
		expect(result.history).toEqual([]);
	});

	it('returns empty data on network error', async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		const result = await fetchGroceryBasketData();
		expect(result.current).toBeNull();
		expect(result.history).toEqual([]);
	});
});
```

- [ ] **Step 2: Write the client adapter**

```typescript
// src/lib/api/marin/grocery-basket.ts

/**
 * Client-side adapter for grocery basket data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { GroceryBasketData } from '$lib/types/grocery';

export async function fetchGroceryBasketData(): Promise<GroceryBasketData> {
	try {
		logger.log('GroceryBasket', 'Loading grocery basket data from /api/data/grocery-basket');

		const response = await fetchWithTimeout('/api/data/grocery-basket');
		if (!response.ok) {
			throw new Error(`Grocery basket data fetch failed: ${response.status}`);
		}

		return (await response.json()) as GroceryBasketData;
	} catch (error) {
		logger.warn('GroceryBasket', `Grocery basket data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
```

- [ ] **Step 3: Write the store**

```typescript
// src/lib/stores/grocery-basket.ts

/**
 * Grocery basket store -- holds the current Bare Essentials data
 */

import { writable, derived } from 'svelte/store';
import type { GroceryBasketData } from '$lib/types/grocery';

export const groceryBasketStore = writable<GroceryBasketData>({
	current: null,
	history: []
});

export const currentBasketTotal = derived(
	groceryBasketStore,
	($d) => $d.current?.totalCheapest ?? null
);

export const currentBasketItems = derived(
	groceryBasketStore,
	($d) => $d.current?.items ?? []
);
```

- [ ] **Step 4: Run client adapter tests**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/api/marin/grocery-basket.test.ts
```

Expected: all 3 tests pass.

---

## Task 7: Panel Component

**Files:**
- Create: `src/lib/components/panels/GroceryBasketPanel.svelte`

- [ ] **Step 1: Write the panel component**

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchGroceryBasketData } from '$lib/api/marin/grocery-basket';
	import { groceryBasketStore } from '$lib/stores/grocery-basket';
	import { BASKET_ITEMS, BASKET_REFERENCE_TOTAL } from '$lib/config/grocery-basket';
	import { select } from 'd3-selection';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';
	import type { GroceryBasketData, GrocerySnapshot, BasketItemPrices } from '$lib/types/grocery';

	type HoverState = { index: number; x: number } | null;

	const CHART_LEFT = 44;
	const CHART_RIGHT = 10;
	const ACCENT = '#f59e0b'; // amber for grocery/market theme

	let data = $state<GroceryBasketData>({ current: null, history: [] });
	let chartSvg = $state<SVGSVGElement>(undefined!);
	let dataLoading = $state(false);
	let hoverState = $state<HoverState>(null);
	let showAllItems = $state(false);

	const current = $derived(data.current);
	const history = $derived(
		data.history
			.filter((h) => h.totalCheapest !== null)
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
	);

	const weekOverWeekChange = $derived.by<number | null>(() => {
		if (!current?.totalCheapest || history.length < 2) return null;
		const prev = history[history.length - 2];
		if (!prev?.totalCheapest) return null;
		return Math.round((current.totalCheapest - prev.totalCheapest) * 100) / 100;
	});

	const biggestMovers = $derived.by<BasketItemPrices[]>(() => {
		if (!current?.items || history.length < 2) return [];
		const prevSnapshot = history[history.length - 2];
		if (!prevSnapshot?.items) return [];

		const prevMap = new Map(prevSnapshot.items.map((i) => [i.itemId, i.cheapest]));

		return [...current.items]
			.filter((item) => item.cheapest !== null && prevMap.has(item.itemId) && prevMap.get(item.itemId) !== null)
			.map((item) => ({
				...item,
				_delta: item.cheapest! - (prevMap.get(item.itemId) ?? 0)
			}))
			.sort((a, b) => Math.abs(b._delta) - Math.abs(a._delta))
			.slice(0, 3);
	});

	function formatPrice(price: number): string {
		return `$${price.toFixed(2)}`;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	function updateHover(event: PointerEvent) {
		if (history.length === 0) return;
		const target = event.currentTarget as SVGSVGElement;
		const rect = target.getBoundingClientRect();
		const innerWidth = rect.width - CHART_LEFT - CHART_RIGHT;
		const relativeX = Math.max(0, Math.min(innerWidth, event.clientX - rect.left - CHART_LEFT));
		const ratio = innerWidth <= 0 ? 0 : relativeX / innerWidth;
		const index = Math.max(
			0,
			Math.min(history.length - 1, Math.round(ratio * (history.length - 1)))
		);
		const pointX =
			CHART_LEFT + (innerWidth * index) / Math.max(history.length - 1, 1);
		hoverState = { index, x: pointX };
	}

	function clearHover() {
		hoverState = null;
	}

	function drawChart() {
		if (!chartSvg || history.length < 2) return;

		const svg = select(chartSvg);
		svg.selectAll('*').remove();

		const width = chartSvg.clientWidth;
		const height = 180;
		const margin = { top: 12, right: CHART_RIGHT, bottom: 24, left: CHART_LEFT };
		const innerW = width - margin.left - margin.right;
		const innerH = height - margin.top - margin.bottom;

		const prices = history.map((h) => h.totalCheapest!);
		const yMin = Math.min(...prices) * 0.97;
		const yMax = Math.max(...prices) * 1.03;

		const x = scaleLinear()
			.domain([0, history.length - 1])
			.range([0, innerW]);
		const y = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

		const g = svg
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		const areaGen = area<GrocerySnapshot>()
			.x((_d, i) => x(i))
			.y0(innerH)
			.y1((d) => y(d.totalCheapest!))
			.curve(curveMonotoneX);

		g.append('path')
			.datum(history)
			.attr('d', areaGen)
			.attr('fill', 'rgba(245, 158, 11, 0.1)');

		const lineGen = line<GrocerySnapshot>()
			.x((_d, i) => x(i))
			.y((d) => y(d.totalCheapest!))
			.curve(curveMonotoneX);

		g.append('path')
			.datum(history)
			.attr('d', lineGen)
			.attr('fill', 'none')
			.attr('stroke', ACCENT)
			.attr('stroke-width', 1.5);

		g.selectAll('.dot')
			.data(history)
			.enter()
			.append('circle')
			.attr('cx', (_d, i) => x(i))
			.attr('cy', (d) => y(d.totalCheapest!))
			.attr('r', 2.5)
			.attr('fill', ACCENT);

		if (hoverState) {
			g.append('line')
				.attr('x1', x(hoverState.index))
				.attr('x2', x(hoverState.index))
				.attr('y1', 0)
				.attr('y2', innerH)
				.attr('stroke', 'rgba(255,255,255,0.35)')
				.attr('stroke-width', 1)
				.attr('stroke-dasharray', '3,3');

			g.append('circle')
				.attr('cx', x(hoverState.index))
				.attr('cy', y(history[hoverState.index].totalCheapest!))
				.attr('r', 4)
				.attr('fill', ACCENT)
				.attr('stroke', '#111')
				.attr('stroke-width', 1);
		}

		// Y axis labels
		g.append('text')
			.attr('x', -4)
			.attr('y', y(yMax))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '7px')
			.text(formatPrice(yMax));

		g.append('text')
			.attr('x', -4)
			.attr('y', y(yMin))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '7px')
			.text(formatPrice(yMin));

		// X axis labels
		const labelIndices = [0, Math.floor(history.length / 2), history.length - 1];
		for (const idx of labelIndices) {
			g.append('text')
				.attr('x', x(idx))
				.attr('y', innerH + 14)
				.attr('text-anchor', 'middle')
				.attr('fill', '#666')
				.attr('font-size', '7px')
				.text(formatDate(history[idx].timestamp));
		}
	}

	onMount(() => {
		let resizeTimer: ReturnType<typeof setTimeout>;
		function handleResize() {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				if (history.length > 1 && chartSvg) drawChart();
			}, 150);
		}

		window.addEventListener('resize', handleResize);

		void (async () => {
			dataLoading = true;
			try {
				data = await fetchGroceryBasketData();
				groceryBasketStore.set(data);
			} finally {
				dataLoading = false;
			}
		})();

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	$effect(() => {
		if (history.length > 1 && chartSvg) drawChart();
	});
</script>

<Panel id="grocery-basket" title="The Bare Essentials" loading={dataLoading}>
	{#if current}
		<div class="headline-bar">
			<div class="basket-total">
				<span class="total-value">{current.totalCheapest !== null ? formatPrice(current.totalCheapest) : 'N/A'}</span>
				<span class="total-label">12-item basket</span>
			</div>
			{#if weekOverWeekChange !== null}
				<div class="week-change {weekOverWeekChange <= 0 ? 'positive' : 'warning'}">
					<span class="change-value">
						{weekOverWeekChange >= 0 ? '+' : ''}{formatPrice(weekOverWeekChange)}
					</span>
					<span class="change-label">vs last week</span>
				</div>
			{/if}
			<div class="items-found">
				<span class="found-value">{current.itemsFound}/12</span>
				<span class="found-label">items priced</span>
			</div>
		</div>

		{#if current.totalExpensive !== null && current.totalCheapest !== null}
			<div class="spread-bar">
				<span class="spread-label">Spread:</span>
				<span class="spread-cheap">{formatPrice(current.totalCheapest)} cheapest mix</span>
				<span class="spread-sep">&rarr;</span>
				<span class="spread-expensive">{formatPrice(current.totalExpensive)} premium stores</span>
			</div>
		{/if}
	{/if}

	{#if history.length > 1}
		<div class="chart-section">
			<div class="section-label">Basket Cost Trend (cheapest mix)</div>
			<div class="chart-wrap">
				<svg
					class="chart-svg"
					bind:this={chartSvg}
					onpointermove={updateHover}
					onpointerleave={clearHover}
				></svg>
				{#if hoverState}
					<div class="chart-tooltip" style={`left:${Math.max(20, hoverState.x - 80)}px`}>
						<div class="tooltip-time">{formatDate(history[hoverState.index].timestamp)}</div>
						{#if history[hoverState.index].totalCheapest !== null}
							<div class="tooltip-line">
								Basket {formatPrice(history[hoverState.index].totalCheapest!)}
							</div>
						{/if}
						<div class="tooltip-line tooltip-dim">
							{history[hoverState.index].itemsFound}/12 items
						</div>
					</div>
				{/if}
			</div>
		</div>
	{:else if dataLoading}
		<div class="chart-loading">Loading grocery basket data...</div>
	{:else if !current}
		<div class="empty-state">Grocery basket data will appear after the first weekly sync.</div>
	{/if}

	{#if biggestMovers.length > 0}
		<div class="movers-section">
			<div class="section-label">Biggest Movers This Week</div>
			{#each biggestMovers as item}
				{@const delta = (item as BasketItemPrices & { _delta: number })._delta}
				<div class="item-row">
					<div class="item-info">
						<span class="item-name">{item.itemName}</span>
						<span class="item-store">{item.cheapestStore ?? ''}</span>
					</div>
					<div class="item-prices">
						<span class="item-price">{item.cheapest !== null ? formatPrice(item.cheapest) : 'N/A'}</span>
						<span class="item-delta {delta <= 0 ? 'positive' : 'warning'}">
							{delta >= 0 ? '+' : ''}{formatPrice(delta)}
						</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if current?.items && current.items.length > 0}
		<div class="items-section">
			<button class="toggle-items" onclick={() => (showAllItems = !showAllItems)}>
				<span class="section-label">{showAllItems ? 'Hide' : 'Show'} All Items</span>
				<span class="toggle-arrow">{showAllItems ? '\u25B2' : '\u25BC'}</span>
			</button>

			{#if showAllItems}
				<div class="item-list">
					{#each current.items as item}
						<div class="item-row">
							<div class="item-info">
								<span class="item-name">{item.itemName}</span>
								<span class="item-store">
									{#if item.cheapestStore}
										{item.cheapestStore}
										{#if item.mostExpensiveStore && item.mostExpensiveStore !== item.cheapestStore}
											&mdash; {item.mostExpensiveStore}
										{/if}
									{:else}
										Not found
									{/if}
								</span>
							</div>
							<div class="item-prices">
								{#if item.cheapest !== null}
									<span class="item-price positive">{formatPrice(item.cheapest)}</span>
									{#if item.mostExpensive !== null && item.mostExpensive !== item.cheapest}
										<span class="item-price-range">&ndash; {formatPrice(item.mostExpensive)}</span>
									{/if}
								{:else}
									<span class="item-price dim">N/A</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</Panel>

<style>
	.headline-bar {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0.75rem;
		align-items: center;
		margin-bottom: 0.65rem;
		padding-bottom: 0.65rem;
		border-bottom: 1px solid var(--border);
	}

	.basket-total {
		text-align: left;
	}

	.total-value {
		display: block;
		font-size: 1.4rem;
		font-weight: 700;
		color: #f59e0b;
		letter-spacing: 0.01em;
	}

	.total-label {
		display: block;
		font-size: 0.52rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.1rem;
	}

	.week-change {
		text-align: center;
		padding: 0.45rem 0.6rem;
		border-radius: 4px;
	}

	.week-change.positive {
		background: rgba(16, 185, 129, 0.1);
	}

	.week-change.warning {
		background: rgba(245, 158, 11, 0.1);
	}

	.change-value {
		display: block;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text);
	}

	.week-change.positive .change-value {
		color: #10b981;
	}

	.week-change.warning .change-value {
		color: #f59e0b;
	}

	.change-label {
		display: block;
		font-size: 0.48rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.items-found {
		text-align: center;
	}

	.found-value {
		display: block;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text);
	}

	.found-label {
		display: block;
		font-size: 0.48rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.spread-bar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.55rem;
		color: var(--text-dim);
		margin-bottom: 0.65rem;
		padding-bottom: 0.65rem;
		border-bottom: 1px solid var(--border);
	}

	.spread-label {
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		font-size: 0.5rem;
	}

	.spread-cheap {
		color: #10b981;
	}

	.spread-sep {
		color: var(--text-muted);
	}

	.spread-expensive {
		color: #f59e0b;
	}

	.chart-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.65rem;
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

	.chart-svg {
		width: 100%;
		height: 180px;
		display: block;
	}

	.chart-wrap {
		position: relative;
	}

	.chart-tooltip {
		position: absolute;
		top: 0.25rem;
		z-index: 2;
		min-width: 124px;
		padding: 0.35rem 0.45rem;
		background: rgba(8, 8, 8, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.14);
		pointer-events: none;
		font-size: 0.55rem;
		line-height: 1.4;
	}

	.tooltip-time {
		color: var(--text);
		font-weight: 700;
		margin-bottom: 0.14rem;
	}

	.tooltip-line {
		color: var(--text-dim);
	}

	.tooltip-dim {
		color: var(--text-muted);
		font-size: 0.5rem;
	}

	.movers-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.items-section {
		margin-bottom: 0.35rem;
	}

	.toggle-items {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.35rem 0;
		border: none;
		background: none;
		cursor: pointer;
		color: var(--text-muted);
	}

	.toggle-arrow {
		font-size: 0.5rem;
		color: var(--text-muted);
	}

	.item-list {
		margin-top: 0.25rem;
	}

	.item-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.3rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}

	.item-row:last-child {
		border-bottom: none;
	}

	.item-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.item-name {
		font-size: 0.58rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-store {
		font-size: 0.48rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-prices {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-left: 0.5rem;
		white-space: nowrap;
	}

	.item-price {
		font-size: 0.68rem;
		font-weight: 700;
	}

	.item-price.positive {
		color: #10b981;
	}

	.item-price.dim {
		color: var(--text-muted);
	}

	.item-price-range {
		font-size: 0.55rem;
		color: var(--text-dim);
	}

	.item-delta {
		font-size: 0.55rem;
		font-weight: 600;
	}

	.item-delta.positive {
		color: #10b981;
	}

	.item-delta.warning {
		color: #f59e0b;
	}

	.chart-loading {
		font-size: 0.6rem;
		color: var(--text-muted);
		text-align: center;
		padding: 0.5rem;
	}

	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.7rem;
		padding: 1rem;
	}

	@media (max-width: 600px) {
		.headline-bar {
			grid-template-columns: 1fr;
			gap: 0.4rem;
		}

		.week-change,
		.items-found {
			text-align: left;
		}
	}
</style>
```

---

## Task 8: Config Registration + Dashboard Wiring

**Files:**
- Modify: `src/lib/config/panels.ts`
- Modify: `src/lib/components/panels/index.ts`
- Modify: `src/lib/components/dashboard/SignalDeck.svelte`

- [ ] **Step 1: Add PanelId and config to panels.ts**

In `src/lib/config/panels.ts`, add `'grocery-basket'` to the `PanelId` type union:

```typescript
export type PanelId =
	| 'map'
	| 'local-wire'
	| 'pulse'
	| 'safety'
	| 'weather'
	| 'cameras'
	| 'conditions'
	| 'outdoors'
	| 'civic'
	| 'housing'
	| 'cycling'
	| 'shows'
	| 'prep'
	| 'farm'
	| 'monitors'
	| 'correlation'
	| 'narrative'
	| 'satire'
	| 'gas-prices'
	| 'leaderboards'
	| 'ev-charging'
	| 'wastewater'
	| 'airport-status'
	| 'grocery-basket';
```

Add the panel config entry to `PANELS`:

```typescript
'grocery-basket': {
	name: 'The Bare Essentials',
	priority: 3,
	description: '12-item grocery basket tracked weekly via Instacart'
},
```

Add `'grocery-basket'` to `DEFAULT_PANEL_ORDER` array, after `'gas-prices'`:

```typescript
export const DEFAULT_PANEL_ORDER: PanelId[] = [
	'map',
	'pulse',
	'local-wire',
	'safety',
	'weather',
	'cameras',
	'conditions',
	'airport-status',
	'wastewater',
	'civic',
	'outdoors',
	'housing',
	'gas-prices',
	'grocery-basket',
	'ev-charging',
	'cycling',
	'leaderboards',
	'shows',
	'prep',
	'farm',
	'monitors',
	'correlation',
	'narrative',
	'satire'
];
```

- [ ] **Step 2: Export from panels barrel**

Add to `src/lib/components/panels/index.ts`:

```typescript
export { default as GroceryBasketPanel } from './GroceryBasketPanel.svelte';
```

- [ ] **Step 3: Add to SignalDeck**

In `src/lib/components/dashboard/SignalDeck.svelte`, add the import:

```typescript
import {
	WeatherPanel,
	TidesPanel,
	PulsePanel,
	OutlooksPanel,
	SignalsPanel,
	HousingPanel,
	GasPricesPanel,
	GroceryBasketPanel,
	EvChargingPanel,
	EnvironmentPanel,
	ConditionsPanel,
	WastewaterPanel,
	AirportStatusPanel
} from '$lib/components/panels';
```

Add the panel rendering block inside the right signal column, after the `GasPricesPanel` block and before the `EvChargingPanel` block:

```svelte
{#if isPanelVisible('grocery-basket')}
	<div class="signal-card signal-grocery-basket animate-enter-up stagger-4 hover-lift">
		<GroceryBasketPanel />
	</div>
{/if}
```

- [ ] **Step 4: Verify full build**

```bash
cd /Users/tammypais/projects/marin-monitor && npm run check
```

Expected: no TypeScript errors.

```bash
cd /Users/tammypais/projects/marin-monitor && npm run build
```

Expected: build succeeds.

---

## Task 9: Run All Tests

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/tammypais/projects/marin-monitor && npm run test:unit
```

Expected: all existing tests still pass, plus the new tests:
- `src/lib/config/grocery-basket.test.ts` (6 tests)
- `src/lib/server/scrapers/grocery-basket.test.ts` (8 tests)
- `src/lib/api/marin/grocery-basket.test.ts` (3 tests)

Total new tests: 17

---

## Task 10: Commit

- [ ] **Step 1: Stage and commit all new and modified files**

```bash
cd /Users/tammypais/projects/marin-monitor && git add \
	src/lib/types/grocery.ts \
	src/lib/types/index.ts \
	src/lib/config/grocery-basket.ts \
	src/lib/config/grocery-basket.test.ts \
	src/lib/server/scrapers/grocery-basket.ts \
	src/lib/server/scrapers/grocery-basket.test.ts \
	src/routes/api/cron/sync-grocery-basket/+server.ts \
	src/routes/api/data/grocery-basket/+server.ts \
	src/lib/api/marin/grocery-basket.ts \
	src/lib/api/marin/grocery-basket.test.ts \
	src/lib/stores/grocery-basket.ts \
	src/lib/components/panels/GroceryBasketPanel.svelte \
	src/lib/components/panels/index.ts \
	src/lib/components/dashboard/SignalDeck.svelte \
	src/lib/config/panels.ts \
	vercel.json
```

```bash
cd /Users/tammypais/projects/marin-monitor && git commit -m "$(cat <<'EOF'
Add The Bare Essentials grocery basket index

Weekly Instacart cross-store scraper tracks 12 Marin-coded products
(Vital Farms eggs, Silver Oak cab, Marin Kombucha, etc.) across
Sprouts, Safeway, Total Wine, and other local stores. Panel shows
basket total with week-over-week trend, sparkline, biggest movers,
and per-item price breakdown with store-level spread.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

```bash
cd /Users/tammypais/projects/marin-monitor && git push origin main
```

---

## Post-Deploy Notes

### Manual First Run

After deploying, trigger the first sync manually to populate the blob:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
	https://marin.monitor/api/cron/sync-grocery-basket
```

### Instacart Scraping Fragility

The Instacart scraper uses multiple parsing strategies (JSON-LD, data-testid attributes, aria-labels, generic price patterns). If Instacart changes their HTML structure, the parser will start returning 0 results and log warnings. Monitor the cron logs for `[grocery-basket] No products found` warnings.

If the basic `fetch` approach gets blocked by Instacart (403/captcha), the scraper will need to switch to Playwright headless browser, similar to the Cappuccino Index Toast scraper. The architecture is designed so only `src/lib/server/scrapers/grocery-basket.ts` needs to change -- everything downstream (cron, API, store, panel) stays the same.

### Sanity Bounds

The scraper does not currently enforce sanity bounds on prices. A future enhancement should reject prices outside reasonable ranges:
- Eggs: $4-$20
- Wine: $30-$200
- Avocado: $1-$8

This prevents data corruption if the scraper matches the wrong product.

### Future Enhancements

1. **Sale price tracking** -- Instacart sometimes shows strikethrough prices. The parser could detect `<s>` or `data-testid="original-price"` patterns to separate regular vs sale prices.
2. **Store-specific basket totals** -- Instead of cheapest-mix, show "Your Sprouts basket: $X" vs "Your Safeway basket: $X".
3. **Contribution to Cost of Being Marin composite** -- The `totalCheapest` value feeds directly into the Tier 1 (Daily Life) sub-score at 40% weight.
