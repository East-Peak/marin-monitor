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
