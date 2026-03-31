import { describe, it, expect } from 'vitest';
import {
	COFFEE_SHOPS,
	CAPPUCCINO_SHOPS,
	TOAST_SHOPS,
	COFFEE_INDEX_DRINKS,
	COFFEE_INDEX_NAME,
	COFFEE_PRIMARY_DRINK
} from './coffee';

describe('coffee shop config', () => {
	it('has 12 total shops', () => {
		expect(COFFEE_SHOPS).toHaveLength(15);
	});

	it('has 14 cappuccino shops (excludes Philz)', () => {
		expect(CAPPUCCINO_SHOPS).toHaveLength(14);
	});

	it('has 10 Toast shops', () => {
		expect(TOAST_SHOPS).toHaveLength(10);
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

	it('points Firehouse at the current live menu domain', () => {
		const firehouse = COFFEE_SHOPS.find((s) => s.id === 'firehouse-sausalito');
		expect(firehouse?.url).toBe('https://www.firehousecoffeetea.com/menu');
	});

	it('Philz is marked as no cappuccino with altDrink', () => {
		const philz = COFFEE_SHOPS.find((s) => s.id === 'philz-corte-madera');
		expect(philz).toBeDefined();
		expect(philz!.hasCappuccino).toBe(false);
		expect(philz!.altDrink).toBe('Pour-Over (Tesora)');
	});

	it('marks fallback-only shops that do not publish live drink prices', () => {
		const fallbackOnlyIds = COFFEE_SHOPS.filter((shop) => shop.supportsLivePriceScrape === false).map(
			(shop) => shop.id
		);
		expect(fallbackOnlyIds).toEqual([
			'fox-kit-san-rafael',
			'philz-corte-madera',
			'red-whale-san-rafael'
		]);
	});

	it('defines the Marin Coffee Index with cappuccino as the headline drink', () => {
		expect(COFFEE_INDEX_NAME).toBe('Marin Coffee Index');
		expect(COFFEE_PRIMARY_DRINK).toBe('cappuccino');
	});

	it('tracks the current canonical coffee drink set', () => {
		expect(COFFEE_INDEX_DRINKS.map((drink) => drink.id)).toEqual([
			'cappuccino',
			'latte',
			'flat_white',
			'house_coffee',
			'pour_over'
		]);
	});
});
