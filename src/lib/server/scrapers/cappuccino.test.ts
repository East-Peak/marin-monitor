// src/lib/server/scrapers/cappuccino.test.ts

import { describe, it, expect } from 'vitest';
import {
	extractCappuccinoPrice,
	extractPriceFromState,
	computeMedian,
	buildSnapshot,
	mergeCoffeeShopWithFallback
} from './cappuccino';
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

describe('extractPriceFromState', () => {
	it('extracts cappuccino price from OO_STATE structure', () => {
		const state = {
			'Menu:abc123': {
				groups: [
					{
						name: 'Hot Drinks',
						items: [
							{ name: 'Cappuccino', prices: [5.25], description: '8oz', outOfStock: false },
							{ name: 'Latte', prices: [5.75], description: '12oz', outOfStock: false }
						]
					}
				]
			}
		};
		expect(extractPriceFromState(state, 'cappuccino')).toBe(5.25);
	});

	it('returns null when item not found', () => {
		const state = {
			'Menu:abc123': {
				groups: [
					{
						name: 'Hot Drinks',
						items: [{ name: 'Latte', prices: [5.75] }]
					}
				]
			}
		};
		expect(extractPriceFromState(state, 'cappuccino')).toBeNull();
	});

	it('returns null for null/empty state', () => {
		expect(extractPriceFromState(null as any, 'cappuccino')).toBeNull();
		expect(extractPriceFromState({}, 'cappuccino')).toBeNull();
	});

	it('handles multiple menu keys', () => {
		const state = {
			'Menu:first': {
				groups: [
					{
						name: 'Food',
						items: [{ name: 'Sandwich', prices: [12] }]
					}
				]
			},
			'Menu:second': {
				groups: [
					{
						name: 'Drinks',
						items: [{ name: 'Cappuccino', prices: [5.1] }]
					}
				]
			}
		};
		expect(extractPriceFromState(state, 'cappuccino')).toBe(5.1);
	});

	it('matches case-insensitively', () => {
		const state = {
			'Menu:abc': {
				groups: [
					{
						name: 'Drinks',
						items: [{ name: 'CAPPUCCINO', prices: [5.0] }]
					}
				]
			}
		};
		expect(extractPriceFromState(state, 'cappuccino')).toBe(5.0);
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
				priceSource: 'live',
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
				priceSource: 'fallback',
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
				priceSource: 'hardcoded',
				updateTime: '2026-03-29T10:00:00Z'
			}
		];

		const snapshot = buildSnapshot(shops);
		expect(snapshot.shopCount).toBe(3);
		expect(snapshot.medianPrice).toBe(5.25);
		expect(snapshot.avgPrice).toBe(5.25);
		expect(snapshot.minPrice).toBe(5.0);
		expect(snapshot.maxPrice).toBe(5.5);
		expect(snapshot.pricedShopCount).toBe(2);
		expect(snapshot.liveShopCount).toBe(1);
		expect(snapshot.fallbackShopCount).toBe(1);
		expect(snapshot.hardcodedShopCount).toBe(1);
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

describe('mergeCoffeeShopWithFallback', () => {
	it('reuses the previous known price when a live toast scrape comes back empty', () => {
		const scraped: CoffeeShop = {
			id: 'equator-mill-valley',
			name: 'Equator Coffees',
			address: '2 Miller Ave, Mill Valley',
			town: 'Mill Valley',
			lat: 37.9061,
			lon: -122.5484,
			price: null,
			source: 'toast',
			priceSource: 'unavailable',
			updateTime: '2026-03-30T10:00:00Z'
		};
		const previous: CoffeeShop = {
			...scraped,
			price: 5.75,
			priceSource: 'live',
			updateTime: '2026-03-23T10:00:00Z'
		};

		const merged = mergeCoffeeShopWithFallback(scraped, previous);
		expect(merged.price).toBe(5.75);
		expect(merged.priceSource).toBe('fallback');
		expect(merged.isStale).toBe(true);
		expect(merged.updateTime).toBe('2026-03-23T10:00:00Z');
	});

	it('keeps a live price untouched when the fresh scrape succeeds', () => {
		const scraped: CoffeeShop = {
			id: 'equator-mill-valley',
			name: 'Equator Coffees',
			address: '2 Miller Ave, Mill Valley',
			town: 'Mill Valley',
			lat: 37.9061,
			lon: -122.5484,
			price: 6.0,
			source: 'toast',
			priceSource: 'live',
			updateTime: '2026-03-30T10:00:00Z'
		};

		const merged = mergeCoffeeShopWithFallback(scraped, null);
		expect(merged.price).toBe(6.0);
		expect(merged.priceSource).toBe('live');
		expect(merged.isStale).toBe(false);
	});
});
