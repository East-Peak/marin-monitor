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
