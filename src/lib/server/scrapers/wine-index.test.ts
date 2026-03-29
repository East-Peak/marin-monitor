// src/lib/server/scrapers/wine-index.test.ts

import { describe, it, expect } from 'vitest';
import {
	computeMedian,
	parseShopifyPrice,
	extractProducts,
	buildCategorySnapshot,
	buildStaffPick
} from './wine-index';
import type { WineProduct } from '$lib/types/wine';

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
			{ id: 1, title: 'A', handle: 'a', vendor: 'V', product_type: 'Red', price: 50, compareAtPrice: null, available: true, tags: [] },
			{ id: 2, title: 'B', handle: 'b', vendor: 'V', product_type: 'Red', price: 100, compareAtPrice: null, available: true, tags: [] },
			{ id: 3, title: 'C', handle: 'c', vendor: 'V', product_type: 'Red', price: 75, compareAtPrice: null, available: true, tags: [] }
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
