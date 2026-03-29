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
