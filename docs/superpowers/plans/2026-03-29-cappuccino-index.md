# Cappuccino Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cappuccino Index panel and map layer to Marin Monitor that scrapes cappuccino prices from 11 coffee shops via Playwright (Toast), HTML, and delivery platforms, and displays them as map pins with a median price headline and sparkline trend.

**Architecture:** A weekly Vercel cron triggers a Playwright-based scraper that visits Toast ordering pages, a Squarespace site, and a delivery platform page to extract cappuccino prices at 11 Marin coffee shops. Results are stored as JSON in Vercel Blob (current snapshot + capped history). A public API route serves the Blob data. The client adapter, Svelte store, and panel component follow the exact gas-prices pattern: map pins on the existing MapDataLayer, a dedicated CappuccinoPanel in the SignalDeck, and a sparkline chart of median price over time.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Playwright (headless Chromium), Vercel Blob, Vercel Cron, D3.js, MapLibre GL, Vitest

---

## File Structure

### New Files

| File                                               | Responsibility                                           |
| -------------------------------------------------- | -------------------------------------------------------- |
| `src/lib/types/coffee.ts`                          | CoffeeShop, CoffeeSnapshot, CoffeeData type definitions  |
| `src/lib/config/coffee.ts`                         | Shop locations, Toast URLs, coordinates, scraping config |
| `src/lib/server/scrapers/cappuccino.ts`            | Playwright scraper for Toast + HTML + delivery pages     |
| `src/lib/server/scrapers/cappuccino.test.ts`       | Unit tests for price parsing and aggregation helpers     |
| `src/routes/api/cron/sync-cappuccino/+server.ts`   | Weekly cron job: scrape + store to Blob                  |
| `src/routes/api/data/cappuccino/+server.ts`        | Serve cappuccino data from Blob                          |
| `src/lib/api/marin/cappuccino.ts`                  | Client-side data adapter                                 |
| `src/lib/stores/cappuccino.ts`                     | Svelte store for cappuccino data                         |
| `src/lib/components/panels/CappuccinoPanel.svelte` | Dashboard panel with map pins, sparkline, shop list      |

### Modified Files

| File                                             | Change                                        |
| ------------------------------------------------ | --------------------------------------------- |
| `src/lib/types/index.ts`                         | Re-export coffee types                        |
| `src/lib/config/panels.ts`                       | Add `cappuccino` PanelId + config             |
| `src/lib/components/panels/index.ts`             | Export CappuccinoPanel                        |
| `src/lib/components/dashboard/SignalDeck.svelte` | Render CappuccinoPanel                        |
| `src/lib/components/map/MapDataLayer.svelte`     | Add coffee shop source, layers, click handler |
| `src/lib/components/map/MapControls.svelte`      | Add coffee toggle to layer list               |
| `src/lib/types/index.ts`                         | Add `'coffee'` to MapLayer union              |
| `src/lib/stores/refresh.ts`                      | Add `cappuccino` to tertiary stage            |
| `vercel.json`                                    | Add sync-cappuccino cron entry                |

---

## Task 1: Type Definitions

**Files:**

- Create: `src/lib/types/coffee.ts`
- Modify: `src/lib/types/index.ts`

- [ ] **Step 1: Write type definitions**

```typescript
// src/lib/types/coffee.ts

/** Source platform for scraping */
export type CoffeeSource = 'toast' | 'html' | 'delivery';

/** A single coffee shop with its current cappuccino price */
export interface CoffeeShop {
	id: string;
	name: string;
	address: string;
	town: string;
	lat: number;
	lon: number;
	price: number | null;
	source: CoffeeSource;
	/** For shops without cappuccino (e.g., Philz pour-over only) */
	altDrink?: string;
	altPrice?: number;
	updateTime: string;
}

/** A point-in-time snapshot of all coffee shops */
export interface CoffeeSnapshot {
	timestamp: string;
	shopCount: number;
	medianPrice: number | null;
	avgPrice: number | null;
	minPrice: number | null;
	maxPrice: number | null;
	shops: CoffeeShop[];
}

/** Top-level Blob shape (mirrors GasPriceData) */
export interface CoffeeData {
	current: CoffeeSnapshot | null;
	history: CoffeeSnapshot[];
}
```

- [ ] **Step 2: Re-export types from index**

Add the following to the bottom of `src/lib/types/index.ts`, after the existing Strava re-exports:

```typescript
// In src/lib/types/index.ts — add at end of file:

export type { CoffeeSource, CoffeeShop, CoffeeSnapshot, CoffeeData } from './coffee';
```

- [ ] **Step 3: Add `'coffee'` to the MapLayer union**

In `src/lib/types/index.ts`, find the existing MapLayer type:

```typescript
// FIND this line:
export type MapLayer =
	| 'civic'
	| 'news'
	| 'safety'
	| 'housing'
	| 'activity'
	| 'satire'
	| 'gas'
	| 'ev-charging';

// REPLACE with:
export type MapLayer =
	| 'civic'
	| 'news'
	| 'safety'
	| 'housing'
	| 'activity'
	| 'satire'
	| 'gas'
	| 'ev-charging'
	| 'coffee';
```

- [ ] **Step 4: Verify types compile**

```bash
cd /Users/tammypais/projects/marin-monitor && npx tsc --noEmit --pretty 2>&1 | head -20
# Expected: no errors related to coffee types
```

---

## Task 2: Coffee Shop Configuration

**Files:**

- Create: `src/lib/config/coffee.ts`
- Test: `src/lib/config/coffee.test.ts` (inline validation test)

- [ ] **Step 1: Write shop configuration**

```typescript
// src/lib/config/coffee.ts

import type { CoffeeSource } from '$lib/types/coffee';

/** Blob storage key */
export const CAPPUCCINO_BLOB_KEY = 'marin-cappuccino.json';

/** Max history entries (52 weeks = 1 year at weekly cadence) */
export const MAX_CAPPUCCINO_HISTORY = 52;

/** Scraping timeout per page (ms) */
export const TOAST_PAGE_TIMEOUT = 30000;

/** Search term to find cappuccino on Toast menus */
export const CAPPUCCINO_SEARCH_TERM = 'cappuccino';

export interface CoffeeShopConfig {
	id: string;
	name: string;
	address: string;
	town: string;
	lat: number;
	lon: number;
	source: CoffeeSource;
	/** URL to scrape */
	url: string;
	/** Whether this shop has a cappuccino (false for pour-over-only shops like Philz) */
	hasCappuccino: boolean;
	/** For shops without cappuccino, the alt drink to track */
	altDrink?: string;
}

/** All 11 confirmed coffee shops */
export const COFFEE_SHOPS: CoffeeShopConfig[] = [
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

/** Only shops that sell cappuccinos (excludes Philz) */
export const CAPPUCCINO_SHOPS = COFFEE_SHOPS.filter((s) => s.hasCappuccino);

/** Toast shops only (for batch Playwright scraping) */
export const TOAST_SHOPS = COFFEE_SHOPS.filter((s) => s.source === 'toast');
```

- [ ] **Step 2: Write config validation test**

```typescript
// src/lib/config/coffee.test.ts

import { describe, it, expect } from 'vitest';
import { COFFEE_SHOPS, CAPPUCCINO_SHOPS, TOAST_SHOPS } from './coffee';

describe('coffee shop config', () => {
	it('has 11 total shops', () => {
		expect(COFFEE_SHOPS).toHaveLength(11);
	});

	it('has 10 cappuccino shops (excludes Philz)', () => {
		expect(CAPPUCCINO_SHOPS).toHaveLength(10);
	});

	it('has 8 Toast shops', () => {
		expect(TOAST_SHOPS).toHaveLength(8);
	});

	it('every shop has a unique id', () => {
		const ids = COFFEE_SHOPS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('every shop has valid coordinates', () => {
		for (const shop of COFFEE_SHOPS) {
			expect(shop.lat).toBeGreaterThan(37.5);
			expect(shop.lat).toBeLessThan(38.5);
			expect(shop.lon).toBeGreaterThan(-123);
			expect(shop.lon).toBeLessThan(-122);
		}
	});

	it('every Toast shop URL starts with https://order.toasttab.com', () => {
		for (const shop of TOAST_SHOPS) {
			expect(shop.url).toMatch(/^https:\/\/order\.toasttab\.com\/online\//);
		}
	});

	it('Philz is marked as no cappuccino with altDrink', () => {
		const philz = COFFEE_SHOPS.find((s) => s.id === 'philz-corte-madera');
		expect(philz).toBeDefined();
		expect(philz!.hasCappuccino).toBe(false);
		expect(philz!.altDrink).toBe('Pour-Over (Tesora)');
	});
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/config/coffee.test.ts
# Expected: 7 tests pass
```

---

## Task 3: Toast Scraper (Playwright)

**Files:**

- Create: `src/lib/server/scrapers/cappuccino.ts`
- Create: `src/lib/server/scrapers/cappuccino.test.ts`

- [ ] **Step 1: Write unit tests first (TDD)**

```typescript
// src/lib/server/scrapers/cappuccino.test.ts

import { describe, it, expect } from 'vitest';
import { extractCappuccinoPrice, computeMedian, buildSnapshot } from './cappuccino';
import type { CoffeeShop } from '$lib/types/coffee';

describe('extractCappuccinoPrice', () => {
	it('extracts price from Toast-style text lines', () => {
		const text = `Hot Drinks
Cappuccino$5.25
Latte$5.75
Mocha$6.00
Drip Coffee$3.50`;
		expect(extractCappuccinoPrice(text)).toBe(5.25);
	});

	it('extracts price with space before dollar sign', () => {
		const text = `Cappuccino $5.10
Latte $5.60`;
		expect(extractCappuccinoPrice(text)).toBe(5.1);
	});

	it('extracts price case-insensitively', () => {
		const text = `CAPPUCCINO$5.00
LATTE$6.00`;
		expect(extractCappuccinoPrice(text)).toBe(5.0);
	});

	it('returns null when no cappuccino found', () => {
		const text = `Latte$5.75
Mocha$6.00`;
		expect(extractCappuccinoPrice(text)).toBeNull();
	});

	it('returns null for empty text', () => {
		expect(extractCappuccinoPrice('')).toBeNull();
	});

	it('handles price with no cents', () => {
		const text = `Cappuccino$5
Latte$6`;
		expect(extractCappuccinoPrice(text)).toBe(5);
	});

	it('picks first cappuccino match if multiple exist', () => {
		const text = `Cappuccino$5.25
Iced Cappuccino$5.75`;
		expect(extractCappuccinoPrice(text)).toBe(5.25);
	});

	it('handles multiline with varied formatting', () => {
		const text = `Menu Items

Cappuccino
$5.25

Latte
$5.75`;
		expect(extractCappuccinoPrice(text)).toBe(5.25);
	});
});

describe('computeMedian', () => {
	it('returns median of odd-length array', () => {
		expect(computeMedian([5.0, 5.1, 5.25])).toBe(5.1);
	});

	it('returns median of even-length array', () => {
		expect(computeMedian([4.5, 5.0, 5.1, 5.25])).toBe(5.05);
	});

	it('returns single value for single-element array', () => {
		expect(computeMedian([5.25])).toBe(5.25);
	});

	it('returns null for empty array', () => {
		expect(computeMedian([])).toBeNull();
	});

	it('handles unsorted input', () => {
		expect(computeMedian([5.25, 4.5, 5.1, 6.0, 5.0])).toBe(5.1);
	});
});

describe('buildSnapshot', () => {
	it('computes aggregate stats from shops', () => {
		const shops: CoffeeShop[] = [
			{
				id: 'shop-a',
				name: 'Shop A',
				address: '123 Main St',
				town: 'Mill Valley',
				lat: 37.9,
				lon: -122.5,
				price: 5.0,
				source: 'toast',
				updateTime: '2026-03-29T10:00:00Z'
			},
			{
				id: 'shop-b',
				name: 'Shop B',
				address: '456 Oak St',
				town: 'San Rafael',
				lat: 37.97,
				lon: -122.52,
				price: 5.5,
				source: 'toast',
				updateTime: '2026-03-29T10:00:00Z'
			},
			{
				id: 'shop-c',
				name: 'Shop C',
				address: '789 Pine St',
				town: 'Sausalito',
				lat: 37.86,
				lon: -122.49,
				price: null,
				source: 'html',
				updateTime: '2026-03-29T10:00:00Z'
			}
		];

		const snapshot = buildSnapshot(shops);
		expect(snapshot.shopCount).toBe(3);
		expect(snapshot.medianPrice).toBe(5.25);
		expect(snapshot.avgPrice).toBe(5.25);
		expect(snapshot.minPrice).toBe(5.0);
		expect(snapshot.maxPrice).toBe(5.5);
		expect(snapshot.shops).toHaveLength(3);
		expect(snapshot.timestamp).toBeDefined();
	});

	it('handles all null prices', () => {
		const shops: CoffeeShop[] = [
			{
				id: 'shop-a',
				name: 'Shop A',
				address: '123 Main St',
				town: 'Mill Valley',
				lat: 37.9,
				lon: -122.5,
				price: null,
				source: 'toast',
				updateTime: '2026-03-29T10:00:00Z'
			}
		];

		const snapshot = buildSnapshot(shops);
		expect(snapshot.medianPrice).toBeNull();
		expect(snapshot.avgPrice).toBeNull();
		expect(snapshot.minPrice).toBeNull();
		expect(snapshot.maxPrice).toBeNull();
	});
});
```

- [ ] **Step 2: Implement the scraper**

```typescript
// src/lib/server/scrapers/cappuccino.ts

/**
 * Server-side Playwright scraper for cappuccino prices across Marin coffee shops.
 *
 * Scrapes Toast online ordering pages (7 shops), one Squarespace HTML menu,
 * and one DoorDash delivery listing. Computes aggregate statistics.
 */

import type { CoffeeShop, CoffeeSnapshot } from '$lib/types/coffee';
import { COFFEE_SHOPS, TOAST_PAGE_TIMEOUT, type CoffeeShopConfig } from '$lib/config/coffee';

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
	const prices = shops.filter((s) => s.price !== null).map((s) => s.price!);

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
```

- [ ] **Step 3: Run unit tests**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/server/scrapers/cappuccino.test.ts
# Expected: all extractCappuccinoPrice, computeMedian, and buildSnapshot tests pass
```

---

## Task 4: Cron Job

**Files:**

- Create: `src/routes/api/cron/sync-cappuccino/+server.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the cron endpoint**

```typescript
// src/routes/api/cron/sync-cappuccino/+server.ts

import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeCappuccino } from '$lib/server/scrapers/cappuccino';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { CAPPUCCINO_BLOB_KEY, MAX_CAPPUCCINO_HISTORY } from '$lib/config/coffee';
import type { RequestHandler } from './$types';
import type { CoffeeData, CoffeeSnapshot } from '$lib/types/coffee';

export const config = { maxDuration: 120 };

/** Strip shops[] from a snapshot to keep history entries small */
function toHistoryEntry(snapshot: CoffeeSnapshot): Omit<CoffeeSnapshot, 'shops'> & { shops: [] } {
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

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const snapshot = await scrapeCappuccino();

		// Read existing blob to append history
		let existing: CoffeeData = { current: null, history: [] };
		try {
			const blob = await head(CAPPUCCINO_BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as CoffeeData;
			}
		} catch {
			// No existing blob -- start fresh
		}

		// Append to history (capped), omitting shops[] from history entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(
			0,
			MAX_CAPPUCCINO_HISTORY
		);

		const data: CoffeeData = {
			current: snapshot,
			history
		};

		await put(CAPPUCCINO_BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		const pricesFound = snapshot.shops.filter((s) => s.price !== null).length;
		console.log(
			`[sync-cappuccino] OK: ${pricesFound}/${snapshot.shopCount} shops priced, median $${snapshot.medianPrice?.toFixed(2) ?? 'N/A'} in ${Date.now() - start}ms`
		);

		return new Response(
			JSON.stringify({
				ok: true,
				shopCount: snapshot.shopCount,
				pricesFound,
				medianPrice: snapshot.medianPrice
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-cappuccino] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
```

- [ ] **Step 2: Add cron entry to vercel.json**

In `vercel.json`, add the sync-cappuccino cron to the existing `crons` array. Find the existing array and add the new entry:

```jsonc
// FIND this line in vercel.json:
		{ "path": "/api/cron/sync-strava-leaderboards", "schedule": "0 12 * * *" }

// REPLACE with (add cappuccino cron after it):
		{ "path": "/api/cron/sync-strava-leaderboards", "schedule": "0 12 * * *" },
		{ "path": "/api/cron/sync-cappuccino", "schedule": "0 8 * * 1" }
```

The schedule `0 8 * * 1` runs every Monday at 8 AM UTC (1 AM Pacific).

- [ ] **Step 3: Verify vercel.json is valid JSON**

```bash
cd /Users/tammypais/projects/marin-monitor && node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('Valid JSON')"
# Expected: "Valid JSON"
```

---

## Task 5: API Data Endpoint

**Files:**

- Create: `src/routes/api/data/cappuccino/+server.ts`

- [ ] **Step 1: Write the data endpoint**

```typescript
// src/routes/api/data/cappuccino/+server.ts

import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { CAPPUCCINO_BLOB_KEY } from '$lib/config/coffee';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const blob = await head(CAPPUCCINO_BLOB_KEY, {
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

Note: Cache TTL is longer than gas prices (1 hour s-maxage vs 5 min) since cappuccino prices change weekly at most.

---

## Task 6: Client Adapter + Store

**Files:**

- Create: `src/lib/api/marin/cappuccino.ts`
- Create: `src/lib/stores/cappuccino.ts`
- Modify: `src/lib/stores/refresh.ts`

- [ ] **Step 1: Write the client adapter**

```typescript
// src/lib/api/marin/cappuccino.ts

/**
 * Client-side adapter for cappuccino price data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { CoffeeData } from '$lib/types/coffee';

export async function fetchCappuccinoData(): Promise<CoffeeData> {
	try {
		logger.log('Cappuccino', 'Loading cappuccino prices from /api/data/cappuccino');

		const response = await fetchWithTimeout('/api/data/cappuccino');
		if (!response.ok) {
			throw new Error(`Cappuccino data fetch failed: ${response.status}`);
		}

		return (await response.json()) as CoffeeData;
	} catch (error) {
		logger.warn('Cappuccino', `Cappuccino data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
```

- [ ] **Step 2: Write the Svelte store**

```typescript
// src/lib/stores/cappuccino.ts

/**
 * Cappuccino price store -- shared between CappuccinoPanel and MapDataLayer
 */

import { writable, derived } from 'svelte/store';
import type { CoffeeData } from '$lib/types/coffee';

export const cappuccinoStore = writable<CoffeeData>({ current: null, history: [] });

export const currentCoffeeShops = derived(cappuccinoStore, ($d) => $d.current?.shops ?? []);
```

- [ ] **Step 3: Add cappuccino to refresh stages**

In `src/lib/stores/refresh.ts`, find the tertiary stage and add `'cappuccino'` to its categories:

```typescript
// FIND this line:
		categories: ['housing', 'gas-prices', 'ev-charging', 'satire', 'earthquakes', 'strava'],

// REPLACE with:
		categories: ['housing', 'gas-prices', 'ev-charging', 'cappuccino', 'satire', 'earthquakes', 'strava'],
```

---

## Task 7: Panel Config Registration

**Files:**

- Modify: `src/lib/config/panels.ts`
- Modify: `src/lib/components/panels/index.ts`

- [ ] **Step 1: Add cappuccino to PanelId union**

In `src/lib/config/panels.ts`, add `'cappuccino'` to the PanelId type:

```typescript
// FIND this line:
	| 'airport-status';

// REPLACE with:
	| 'airport-status'
	| 'cappuccino';
```

- [ ] **Step 2: Add cappuccino to PANELS record**

In `src/lib/config/panels.ts`, add the cappuccino entry to the PANELS object. Find the end of the `'airport-status'` entry and add after it:

```typescript
// FIND this block:
	'airport-status': {
		name: 'Airport Status',
		priority: 2,
		description: 'SFO and OAK delays, conditions, and TSA wait times'
	}

// REPLACE with:
	'airport-status': {
		name: 'Airport Status',
		priority: 2,
		description: 'SFO and OAK delays, conditions, and TSA wait times'
	},
	cappuccino: {
		name: 'Cappuccino Index',
		priority: 3,
		description: 'Cappuccino prices at coffee shops across Marin'
	}
```

- [ ] **Step 3: Add cappuccino to DEFAULT_PANEL_ORDER**

In `src/lib/config/panels.ts`, add `'cappuccino'` to the DEFAULT_PANEL_ORDER array after `'ev-charging'`:

```typescript
// FIND this line:
	'ev-charging',

// REPLACE with:
	'ev-charging',
	'cappuccino',
```

- [ ] **Step 4: Add CappuccinoPanel to barrel export**

In `src/lib/components/panels/index.ts`, add the export:

```typescript
// FIND this line:
export { default as LeaderboardsPanel } from './LeaderboardsPanel.svelte';

// REPLACE with:
export { default as LeaderboardsPanel } from './LeaderboardsPanel.svelte';
export { default as CappuccinoPanel } from './CappuccinoPanel.svelte';
```

---

## Task 8: Panel Component

**Files:**

- Create: `src/lib/components/panels/CappuccinoPanel.svelte`

- [ ] **Step 1: Write the CappuccinoPanel**

```svelte
<!-- src/lib/components/panels/CappuccinoPanel.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchCappuccinoData } from '$lib/api/marin/cappuccino';
	import { cappuccinoStore } from '$lib/stores/cappuccino';
	import { townFilter, selectedTownObj } from '$lib/stores/town-filter';
	import { findNearestTown } from '$lib/geo';
	import { select } from 'd3-selection';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';
	import type { CoffeeData, CoffeeSnapshot, CoffeeShop } from '$lib/types/coffee';

	type HoverState = { index: number; x: number } | null;
	type SummaryCard = {
		label: string;
		value: string;
		detail: string;
		tone?: 'default' | 'positive' | 'warning';
	};

	const CHART_LEFT = 44;
	const CHART_RIGHT = 10;
	const ACCENT = '#a16207'; // warm brown for coffee

	let data = $state<CoffeeData>({ current: null, history: [] });
	let chartSvg = $state<SVGSVGElement>(undefined!);
	let dataLoading = $state(false);
	let hoverState = $state<HoverState>(null);

	const current = $derived(data.current);
	const history = $derived(
		data.history
			.filter((h) => h.medianPrice !== null)
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
	);

	// Filter shops by selected town (proximity match)
	const filteredShops = $derived.by<CoffeeShop[]>(() => {
		if (!current?.shops) return [];
		if (!$townFilter) return current.shops;
		return current.shops.filter((s) => findNearestTown(s.lat, s.lon) === $townFilter);
	});

	// Only shops with a cappuccino price (excludes Philz)
	const pricedShops = $derived(
		filteredShops.filter((s) => s.price !== null).sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
	);

	// Philz and other alt-drink shops
	const altDrinkShops = $derived(filteredShops.filter((s) => s.price === null && s.altDrink));

	const summaryCards = $derived.by<SummaryCard[]>(() => {
		if (!current) return [];

		const townName = $selectedTownObj?.name;

		// Compute median from filtered shops
		const prices = pricedShops.map((s) => s.price!);
		const sortedPrices = [...prices].sort((a, b) => a - b);
		const filteredMedian =
			sortedPrices.length > 0
				? sortedPrices.length % 2 === 0
					? Math.round(
							((sortedPrices[Math.floor(sortedPrices.length / 2) - 1] +
								sortedPrices[Math.floor(sortedPrices.length / 2)]) /
								2) *
								100
						) / 100
					: sortedPrices[Math.floor(sortedPrices.length / 2)]
				: null;

		const displayMedian = $townFilter ? filteredMedian : current.medianPrice;

		// Week-over-week change (history is weekly)
		const lastWeek = history.length >= 2 ? history[history.length - 2] : null;
		const priceDelta =
			current.medianPrice !== null && lastWeek?.medianPrice !== null
				? Math.round((current.medianPrice - lastWeek.medianPrice) * 100) / 100
				: null;

		const cheapest = pricedShops[0];
		const priciest = pricedShops[pricedShops.length - 1];

		return [
			{
				label: 'Median Cappuccino',
				value: displayMedian !== null ? `$${displayMedian.toFixed(2)}` : 'N/A',
				detail: townName ? `In ${townName}` : 'County-wide median',
				tone: 'default' as const
			},
			{
				label: 'Weekly Change',
				value:
					priceDelta !== null
						? `${priceDelta >= 0 ? '+' : ''}$${Math.abs(priceDelta).toFixed(2)}`
						: 'N/A',
				detail:
					priceDelta !== null
						? priceDelta <= 0
							? 'Prices stable or down'
							: 'Prices trending up'
						: 'Not enough history yet',
				tone:
					priceDelta !== null
						? priceDelta <= 0
							? ('positive' as const)
							: ('warning' as const)
						: ('default' as const)
			},
			{
				label: 'Cheapest',
				value: cheapest?.price !== undefined ? `$${cheapest.price!.toFixed(2)}` : 'N/A',
				detail: cheapest?.name ?? (townName ? `No shops in ${townName}` : 'No data'),
				tone: 'positive' as const
			},
			{
				label: 'Most Expensive',
				value: priciest?.price !== undefined ? `$${priciest.price!.toFixed(2)}` : 'N/A',
				detail: priciest?.name ?? 'No data',
				tone: 'warning' as const
			}
		];
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
		const pointX = CHART_LEFT + (innerWidth * index) / Math.max(history.length - 1, 1);
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
		const height = 200;
		const margin = { top: 12, right: CHART_RIGHT, bottom: 24, left: CHART_LEFT };
		const innerW = width - margin.left - margin.right;
		const innerH = height - margin.top - margin.bottom;

		const prices = history.map((h) => h.medianPrice!);
		const yMin = Math.min(...prices) * 0.98;
		const yMax = Math.max(...prices) * 1.02;

		const x = scaleLinear()
			.domain([0, history.length - 1])
			.range([0, innerW]);
		const y = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

		const g = svg
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		const areaGen = area<CoffeeSnapshot>()
			.x((_d, i) => x(i))
			.y0(innerH)
			.y1((d) => y(d.medianPrice!))
			.curve(curveMonotoneX);

		g.append('path').datum(history).attr('d', areaGen).attr('fill', 'rgba(161, 98, 7, 0.1)');

		const lineGen = line<CoffeeSnapshot>()
			.x((_d, i) => x(i))
			.y((d) => y(d.medianPrice!))
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
			.attr('cy', (d) => y(d.medianPrice!))
			.attr('r', 2.2)
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
				.attr('cy', y(history[hoverState.index].medianPrice!))
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
				data = await fetchCappuccinoData();
				cappuccinoStore.set(data);
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

<Panel id="cappuccino" title="Cappuccino Index" loading={dataLoading}>
	{#if current}
		<div class="snapshot-bar">
			{#if current.medianPrice !== null}
				<div class="metric">
					<span class="metric-value">${current.medianPrice.toFixed(2)}</span>
					<span class="metric-label">Median</span>
				</div>
			{/if}
			{#if current.minPrice !== null}
				<div class="metric">
					<span class="metric-value">${current.minPrice.toFixed(2)}</span>
					<span class="metric-label">Cheapest</span>
				</div>
			{/if}
			{#if current.maxPrice !== null}
				<div class="metric">
					<span class="metric-value">${current.maxPrice.toFixed(2)}</span>
					<span class="metric-label">Priciest</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if history.length > 1}
		<div class="chart-section">
			<div class="section-label">Median Cappuccino Price Trend</div>
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
						{#if history[hoverState.index].medianPrice !== null}
							<div class="tooltip-line">
								Median ${history[hoverState.index].medianPrice!.toFixed(2)}
							</div>
						{/if}
						{#if history[hoverState.index].avgPrice !== null}
							<div class="tooltip-line">
								Average ${history[hoverState.index].avgPrice!.toFixed(2)}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{:else if dataLoading}
		<div class="chart-loading">Loading cappuccino data...</div>
	{:else if !current}
		<div class="empty-state">Cappuccino price data will appear after the first sync cycle.</div>
	{/if}

	{#if summaryCards.length > 0}
		<div class="market-summary">
			{#each summaryCards as card}
				<div class={`summary-card ${card.tone ?? 'default'}`}>
					<div class="summary-label">{card.label}</div>
					<div class="summary-value">{card.value}</div>
					<div class="summary-detail">{card.detail}</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if pricedShops.length > 0}
		<div class="shop-list-section">
			<div class="section-label">All Shops (cheapest first)</div>
			{#each pricedShops as shop}
				<div class="shop-row">
					<div class="shop-info">
						<span class="shop-name">{shop.name}</span>
						<span class="shop-address">{shop.address}</span>
					</div>
					<span
						class={`shop-price ${shop.price === current?.minPrice ? 'positive' : shop.price === current?.maxPrice ? 'warning' : ''}`}
					>
						${shop.price!.toFixed(2)}
					</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if altDrinkShops.length > 0}
		<div class="shop-list-section">
			<div class="section-label">No Cappuccino</div>
			{#each altDrinkShops as shop}
				<div class="shop-row">
					<div class="shop-info">
						<span class="shop-name">{shop.name}</span>
						<span class="shop-address"
							>{shop.altDrink} {shop.altPrice ? `$${shop.altPrice.toFixed(2)}` : ''}</span
						>
					</div>
					<span class="shop-price muted">N/A</span>
				</div>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.snapshot-bar {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
		gap: 0.55rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.metric {
		text-align: center;
		padding: 0.65rem 0.45rem 0.55rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.metric-value {
		display: block;
		font-size: 1.1rem;
		font-weight: 700;
		color: #a16207;
		letter-spacing: 0.01em;
	}

	.metric-label {
		display: block;
		font-size: 0.58rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.18rem;
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
		height: 200px;
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

	.market-summary {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.summary-card {
		padding: 0.55rem 0.6rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.summary-card.positive {
		background: rgba(16, 185, 129, 0.08);
	}

	.summary-card.warning {
		background: rgba(245, 158, 11, 0.08);
	}

	.summary-label {
		font-size: 0.52rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.summary-value {
		margin-top: 0.14rem;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text);
	}

	.summary-detail {
		margin-top: 0.12rem;
		font-size: 0.54rem;
		line-height: 1.35;
		color: var(--text-dim);
	}

	.shop-list-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.shop-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0;
	}

	.shop-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.shop-name {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.shop-address {
		font-size: 0.52rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.shop-price {
		font-size: 0.72rem;
		font-weight: 700;
		margin-left: 0.5rem;
		white-space: nowrap;
	}

	.shop-price.positive {
		color: #10b981;
	}

	.shop-price.warning {
		color: #f59e0b;
	}

	.shop-price.muted {
		color: var(--text-dim);
		font-weight: 400;
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

	@media (max-width: 1100px) {
		.market-summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
```

---

## Task 9: SignalDeck Integration

**Files:**

- Modify: `src/lib/components/dashboard/SignalDeck.svelte`

- [ ] **Step 1: Import CappuccinoPanel**

In `src/lib/components/dashboard/SignalDeck.svelte`, add `CappuccinoPanel` to the import:

```typescript
// FIND this line:
AirportStatusPanel;

// REPLACE with:
(AirportStatusPanel, CappuccinoPanel);
```

(This is inside the existing import block from `'$lib/components/panels'`.)

- [ ] **Step 2: Add CappuccinoPanel rendering block**

Find the gas-prices panel block in SignalDeck.svelte and add the cappuccino block after it:

```svelte
<!-- FIND this block: -->
{#if isPanelVisible('gas-prices')}
	<div class="signal-card signal-gas-prices animate-enter-up stagger-3 hover-lift">
		<GasPricesPanel />
	</div>
{/if}

<!-- ADD this block immediately after: -->
{#if isPanelVisible('cappuccino')}
	<div class="signal-card signal-cappuccino animate-enter-up stagger-3 hover-lift">
		<CappuccinoPanel />
	</div>
{/if}
```

---

## Task 10: Map Layer Integration

**Files:**

- Modify: `src/lib/components/map/MapControls.svelte`
- Modify: `src/lib/components/map/MapDataLayer.svelte`

- [ ] **Step 1: Add coffee toggle to MapControls**

In `src/lib/components/map/MapControls.svelte`, add the coffee layer to the label map and layer order:

```typescript
// FIND this line:
		'ev-charging': 'EV'

// REPLACE with:
		'ev-charging': 'EV',
		coffee: 'Coffee'
```

```typescript
// FIND this line:
const LAYER_ORDER: MapLayer[] = [
	'news',
	'safety',
	'civic',
	'activity',
	'housing',
	'gas',
	'ev-charging',
	'satire'
];

// REPLACE with:
const LAYER_ORDER: MapLayer[] = [
	'news',
	'safety',
	'civic',
	'activity',
	'housing',
	'gas',
	'ev-charging',
	'coffee',
	'satire'
];
```

- [ ] **Step 2: Add coffee shop data to MapDataLayer**

In `src/lib/components/map/MapDataLayer.svelte`, make the following changes:

**Add the import:**

```typescript
// FIND this line:
import { currentGasStations } from '$lib/stores/gas-prices';

// REPLACE with:
import { currentGasStations } from '$lib/stores/gas-prices';
import { currentCoffeeShops } from '$lib/stores/cappuccino';
```

**Add `'coffee-shop'` to the onFeatureClick kind union type:**

```typescript
// FIND this line:
kind: 'landmark' |
	'fire-zone' |
	'traffic-event' |
	'earthquake' |
	'fire-incident' |
	'gas-station' |
	'ev-charging-station' |
	'airport';

// REPLACE with:
kind: 'landmark' |
	'fire-zone' |
	'traffic-event' |
	'earthquake' |
	'fire-incident' |
	'gas-station' |
	'ev-charging-station' |
	'coffee-shop' |
	'airport';
```

**Add the GeoJSON source (after the `gas-stations` source creation block):**

Find where `map.addSource('gas-stations', ...)` ends and add after it:

```typescript
// Coffee shops source
map.addSource('coffee-shops', {
	type: 'geojson',
	data: { type: 'FeatureCollection', features: [] }
});
```

**Add the map layers (after the `gas-stations-label` layer):**

Find where the gas station label layer ends and add after it:

```typescript
// Coffee shop dots (warm brown)
map.addLayer({
	id: 'coffee-shops-layer',
	type: 'circle',
	source: 'coffee-shops',
	paint: {
		'circle-radius': 5,
		'circle-color': '#a16207',
		'circle-stroke-width': 1,
		'circle-stroke-color': '#1a1a1a'
	}
});

// Coffee shop labels (visible at higher zoom)
map.addLayer({
	id: 'coffee-shops-label',
	type: 'symbol',
	source: 'coffee-shops',
	minzoom: 12,
	layout: {
		'text-field': ['concat', ['get', 'name'], '\n', ['get', 'price']],
		'text-size': 10,
		'text-offset': [0, 1.5],
		'text-anchor': 'top',
		'text-allow-overlap': false
	},
	paint: {
		'text-color': '#a16207',
		'text-halo-color': '#111',
		'text-halo-width': 1
	}
});
```

**Add the click handler (after the gas station click handler):**

```typescript
map.on('click', 'coffee-shops-layer', (e: MapLayerMouseEvent) => {
	const feature = e.features?.[0];
	const name = String(feature?.properties?.name ?? 'Coffee Shop');
	const price = String(feature?.properties?.price ?? '');
	const address = String(feature?.properties?.address ?? '');
	onFeatureClick?.({
		kind: 'coffee-shop',
		title: name,
		subtitle: price ? `Cappuccino: ${price}` : 'Price unavailable',
		description: address,
		lat: e.lngLat.lat,
		lon: e.lngLat.lng
	});
});

map.on('mouseenter', 'coffee-shops-layer', () => {
	map.getCanvas().style.cursor = 'pointer';
});

map.on('mouseleave', 'coffee-shops-layer', () => {
	map.getCanvas().style.cursor = '';
});
```

**Add the subscription (after the gas station subscription):**

```typescript
// Declare at the top with other subscription variables:
let unsubscribeCoffee: (() => void) | null = null;
```

In the subscription setup block (after the gas station subscription):

```typescript
if (!unsubscribeCoffee) {
	unsubscribeCoffee = currentCoffeeShops.subscribe(() => {
		if (updateDataTimer) clearTimeout(updateDataTimer);
		updateDataTimer = setTimeout(() => {
			const m = getMap();
			if (!m || !m.getSource('coffee-shops')) return;
			updateData(m);
		}, 100);
	});
}
```

In the cleanup block, after `unsubscribeGas?.();`:

```typescript
unsubscribeCoffee?.();
```

**Add the data update logic in the `updateData` function (after the gas station data update):**

```typescript
// Coffee shops
const coffeeShops = get(currentCoffeeShops);
const mapCoffeeVisible = mapState.activeLayers['coffee'];
const coffeeFeatures: GeoJSON.Feature[] = mapCoffeeVisible
	? coffeeShops
			.filter((s) => !currentTownFilter || findNearestTown(s.lat, s.lon) === currentTownFilter)
			.filter((s) => s.price !== null)
			.map((s) => ({
				type: 'Feature' as const,
				geometry: {
					type: 'Point' as const,
					coordinates: [s.lon, s.lat]
				},
				properties: {
					name: s.name,
					price: `$${s.price!.toFixed(2)}`,
					address: s.address,
					town: s.town
				}
			}))
	: [];

const coffeeSource = map.getSource('coffee-shops') as GeoJSONSource;
if (coffeeSource) {
	coffeeSource.setData({ type: 'FeatureCollection', features: coffeeFeatures });
}

if (map.getLayer('coffee-shops-layer')) {
	map.setLayoutProperty('coffee-shops-layer', 'visibility', mapCoffeeVisible ? 'visible' : 'none');
}
if (map.getLayer('coffee-shops-label')) {
	map.setLayoutProperty('coffee-shops-label', 'visibility', mapCoffeeVisible ? 'visible' : 'none');
}
```

---

## Task 11: Type Check + Test + Commit

- [ ] **Step 1: Run type checking**

```bash
cd /Users/tammypais/projects/marin-monitor && npx tsc --noEmit --pretty 2>&1 | head -40
# Expected: no type errors
```

- [ ] **Step 2: Run all unit tests**

```bash
cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/config/coffee.test.ts src/lib/server/scrapers/cappuccino.test.ts
# Expected: all tests pass
```

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/tammypais/projects/marin-monitor && npm run test:unit
# Expected: all existing tests still pass + new coffee tests pass
```

- [ ] **Step 4: Run lint**

```bash
cd /Users/tammypais/projects/marin-monitor && npm run lint
# Expected: no lint errors
```

- [ ] **Step 5: Build check**

```bash
cd /Users/tammypais/projects/marin-monitor && npm run build
# Expected: build succeeds
```

- [ ] **Step 6: Commit and push**

```bash
cd /Users/tammypais/projects/marin-monitor && git add -A && git commit -m "feat: add Cappuccino Index panel with Playwright scraper, map layer, and weekly cron

- 11 coffee shops: 8 Toast (Playwright), 1 Squarespace, 1 DoorDash, 1 pour-over-only
- Median price headline with sparkline trend chart
- Map pins on existing MapDataLayer (coffee toggle)
- Weekly cron via Vercel (Mondays 1 AM Pacific)
- Follows gas-prices pattern: types, config, scraper, cron, blob, API, store, panel" && git push
```
