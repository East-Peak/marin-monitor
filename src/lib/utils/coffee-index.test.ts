/**
 * Tests for coffee-index utilities
 */

import { describe, it, expect, vi } from 'vitest';
import type { CoffeeDrinkId, CoffeeIndexShop } from '$lib/types/coffee';

// Mock the coffee config module so tests are isolated from real data
vi.mock('$lib/config/coffee', () => ({
	COFFEE_PRIMARY_DRINK: 'cappuccino' as CoffeeDrinkId,
	COFFEE_INDEX_DRINKS: [
		{ id: 'cappuccino', label: 'Cappuccino', aliases: ['cappuccino'] },
		{ id: 'latte', label: 'Latte', aliases: ['latte'] },
		{ id: 'flat_white', label: 'Flat White', aliases: ['flat white'] },
		{ id: 'house_coffee', label: 'House Coffee', aliases: ['drip', 'house'] },
		{ id: 'pour_over', label: 'Pour Over', aliases: ['pour over'] }
	]
}));

import {
	formatCoffeePrice,
	getOrderedCoffeeDrinkPrices,
	getCoffeeHeadlinePrice,
	formatCoffeeMenuSummary,
	getCoffeeStatusLabel,
	sortCoffeeShopsByHeadline
} from './coffee-index';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeShop(overrides: Partial<CoffeeIndexShop> = {}): CoffeeIndexShop {
	return {
		id: 'test-shop',
		name: 'Test Coffee',
		address: '1 Main St',
		town: 'Mill Valley',
		lat: 37.9,
		lon: -122.5,
		source: 'toast',
		prices: {},
		...overrides
	};
}

function makeDrinkPrice(drinkId: CoffeeDrinkId, price: number, label?: string) {
	return {
		drinkId,
		label: label ?? drinkId,
		price,
		priceSource: 'live' as const,
		updateTime: '2026-04-01T00:00:00Z'
	};
}

// ---------------------------------------------------------------------------
// formatCoffeePrice
// ---------------------------------------------------------------------------

describe('formatCoffeePrice', () => {
	it('formats a whole-dollar price with two decimals', () => {
		expect(formatCoffeePrice(5)).toBe('$5.00');
	});

	it('formats a price with cents', () => {
		expect(formatCoffeePrice(6.5)).toBe('$6.50');
	});

	it('formats a price already at two decimals', () => {
		expect(formatCoffeePrice(4.75)).toBe('$4.75');
	});

	it('rounds a price with excess decimals', () => {
		expect(formatCoffeePrice(5.999)).toBe('$6.00');
	});

	it('formats zero', () => {
		expect(formatCoffeePrice(0)).toBe('$0.00');
	});

	it('handles a sub-dollar price', () => {
		expect(formatCoffeePrice(0.99)).toBe('$0.99');
	});
});

// ---------------------------------------------------------------------------
// getOrderedCoffeeDrinkPrices
// ---------------------------------------------------------------------------

describe('getOrderedCoffeeDrinkPrices', () => {
	it('returns an empty array when the shop has no prices', () => {
		const shop = makeShop();
		expect(getOrderedCoffeeDrinkPrices(shop)).toEqual([]);
	});

	it('returns prices with the primary drink first by default', () => {
		const shop = makeShop({
			prices: {
				latte: makeDrinkPrice('latte', 6.0, 'Latte'),
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino')
			}
		});
		const result = getOrderedCoffeeDrinkPrices(shop);
		expect(result).toHaveLength(2);
		expect(result[0].drinkId).toBe('cappuccino');
		expect(result[1].drinkId).toBe('latte');
	});

	it('respects a custom preferred drink', () => {
		const shop = makeShop({
			prices: {
				latte: makeDrinkPrice('latte', 6.0, 'Latte'),
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino')
			}
		});
		const result = getOrderedCoffeeDrinkPrices(shop, 'latte');
		expect(result[0].drinkId).toBe('latte');
		expect(result[1].drinkId).toBe('cappuccino');
	});

	it('filters out drinks not present on the shop menu', () => {
		const shop = makeShop({
			prices: {
				pour_over: makeDrinkPrice('pour_over', 7.0, 'Pour Over')
			}
		});
		const result = getOrderedCoffeeDrinkPrices(shop);
		expect(result).toHaveLength(1);
		expect(result[0].drinkId).toBe('pour_over');
	});

	it('returns all five drinks when all are present, primary first', () => {
		const shop = makeShop({
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino'),
				latte: makeDrinkPrice('latte', 6.0, 'Latte'),
				flat_white: makeDrinkPrice('flat_white', 6.5, 'Flat White'),
				house_coffee: makeDrinkPrice('house_coffee', 3.0, 'House Coffee'),
				pour_over: makeDrinkPrice('pour_over', 7.0, 'Pour Over')
			}
		});
		const result = getOrderedCoffeeDrinkPrices(shop);
		expect(result).toHaveLength(5);
		expect(result[0].drinkId).toBe('cappuccino');
	});
});

// ---------------------------------------------------------------------------
// getCoffeeHeadlinePrice
// ---------------------------------------------------------------------------

describe('getCoffeeHeadlinePrice', () => {
	it('returns null when the shop has no prices', () => {
		const shop = makeShop();
		expect(getCoffeeHeadlinePrice(shop)).toBeNull();
	});

	it('returns the primary drink price when available', () => {
		const shop = makeShop({
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino'),
				latte: makeDrinkPrice('latte', 6.0, 'Latte')
			}
		});
		const result = getCoffeeHeadlinePrice(shop);
		expect(result).not.toBeNull();
		expect(result!.drinkId).toBe('cappuccino');
		expect(result!.price).toBe(5.5);
	});

	it('falls back to the next available drink when primary is missing', () => {
		const shop = makeShop({
			prices: {
				latte: makeDrinkPrice('latte', 6.0, 'Latte')
			}
		});
		const result = getCoffeeHeadlinePrice(shop);
		expect(result).not.toBeNull();
		expect(result!.drinkId).toBe('latte');
	});

	it('uses the preferred drink when specified', () => {
		const shop = makeShop({
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino'),
				flat_white: makeDrinkPrice('flat_white', 6.5, 'Flat White')
			}
		});
		const result = getCoffeeHeadlinePrice(shop, 'flat_white');
		expect(result!.drinkId).toBe('flat_white');
	});

	it('falls back when the preferred drink is missing', () => {
		const shop = makeShop({
			prices: {
				house_coffee: makeDrinkPrice('house_coffee', 3.0, 'House Coffee')
			}
		});
		const result = getCoffeeHeadlinePrice(shop, 'pour_over');
		// pour_over missing, falls through order: cappuccino, latte, flat_white, house_coffee
		expect(result!.drinkId).toBe('house_coffee');
	});
});

// ---------------------------------------------------------------------------
// formatCoffeeMenuSummary
// ---------------------------------------------------------------------------

describe('formatCoffeeMenuSummary', () => {
	it('returns an empty string when the shop has no prices', () => {
		const shop = makeShop();
		expect(formatCoffeeMenuSummary(shop)).toBe('');
	});

	it('formats a single drink', () => {
		const shop = makeShop({
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino')
			}
		});
		expect(formatCoffeeMenuSummary(shop)).toBe('Cappuccino $5.50');
	});

	it('joins multiple drinks with a middle dot separator', () => {
		const shop = makeShop({
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino'),
				latte: makeDrinkPrice('latte', 6.0, 'Latte')
			}
		});
		expect(formatCoffeeMenuSummary(shop)).toBe('Cappuccino $5.50 · Latte $6.00');
	});

	it('limits output to 4 drinks by default', () => {
		const shop = makeShop({
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino'),
				latte: makeDrinkPrice('latte', 6.0, 'Latte'),
				flat_white: makeDrinkPrice('flat_white', 6.5, 'Flat White'),
				house_coffee: makeDrinkPrice('house_coffee', 3.0, 'House Coffee'),
				pour_over: makeDrinkPrice('pour_over', 7.0, 'Pour Over')
			}
		});
		const parts = formatCoffeeMenuSummary(shop).split(' · ');
		expect(parts).toHaveLength(4);
	});

	it('respects a custom limit', () => {
		const shop = makeShop({
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino'),
				latte: makeDrinkPrice('latte', 6.0, 'Latte'),
				flat_white: makeDrinkPrice('flat_white', 6.5, 'Flat White')
			}
		});
		const result = formatCoffeeMenuSummary(shop, 'cappuccino', 2);
		const parts = result.split(' · ');
		expect(parts).toHaveLength(2);
	});

	it('puts the preferred drink first in the summary', () => {
		const shop = makeShop({
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino'),
				latte: makeDrinkPrice('latte', 6.0, 'Latte')
			}
		});
		const result = formatCoffeeMenuSummary(shop, 'latte');
		expect(result.startsWith('Latte')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// getCoffeeStatusLabel
// ---------------------------------------------------------------------------

describe('getCoffeeStatusLabel', () => {
	it('returns "Tracking soon" when the shop has no prices', () => {
		const shop = makeShop();
		expect(getCoffeeStatusLabel(shop)).toBe('Tracking soon');
	});

	it('returns "Price available" when a headline price exists', () => {
		const shop = makeShop({
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 5.5, 'Cappuccino')
			}
		});
		expect(getCoffeeStatusLabel(shop)).toBe('Price available');
	});

	it('returns "Price available" even when only a non-primary drink exists', () => {
		const shop = makeShop({
			prices: {
				pour_over: makeDrinkPrice('pour_over', 7.0, 'Pour Over')
			}
		});
		expect(getCoffeeStatusLabel(shop)).toBe('Price available');
	});

	it('uses the preferred drink parameter', () => {
		const shop = makeShop({
			prices: {
				latte: makeDrinkPrice('latte', 6.0, 'Latte')
			}
		});
		// Even with a different preferred drink, latte is still in the fallback order
		expect(getCoffeeStatusLabel(shop, 'flat_white')).toBe('Price available');
	});
});

// ---------------------------------------------------------------------------
// sortCoffeeShopsByHeadline
// ---------------------------------------------------------------------------

describe('sortCoffeeShopsByHeadline', () => {
	it('returns an empty array for empty input', () => {
		expect(sortCoffeeShopsByHeadline([])).toEqual([]);
	});

	it('sorts shops by ascending headline price', () => {
		const cheap = makeShop({
			id: 'cheap',
			name: 'Cheap Coffee',
			prices: { cappuccino: makeDrinkPrice('cappuccino', 4.0, 'Cappuccino') }
		});
		const expensive = makeShop({
			id: 'expensive',
			name: 'Fancy Coffee',
			prices: { cappuccino: makeDrinkPrice('cappuccino', 8.0, 'Cappuccino') }
		});
		const mid = makeShop({
			id: 'mid',
			name: 'Mid Coffee',
			prices: { cappuccino: makeDrinkPrice('cappuccino', 6.0, 'Cappuccino') }
		});
		const sorted = sortCoffeeShopsByHeadline([expensive, cheap, mid]);
		expect(sorted.map((s) => s.id)).toEqual(['cheap', 'mid', 'expensive']);
	});

	it('breaks ties by name alphabetically', () => {
		const alpha = makeShop({
			id: 'alpha',
			name: 'Alpha Cafe',
			prices: { cappuccino: makeDrinkPrice('cappuccino', 5.0, 'Cappuccino') }
		});
		const beta = makeShop({
			id: 'beta',
			name: 'Beta Cafe',
			prices: { cappuccino: makeDrinkPrice('cappuccino', 5.0, 'Cappuccino') }
		});
		const sorted = sortCoffeeShopsByHeadline([beta, alpha]);
		expect(sorted.map((s) => s.id)).toEqual(['alpha', 'beta']);
	});

	it('pushes shops without prices to the end', () => {
		const priced = makeShop({
			id: 'priced',
			name: 'Priced Shop',
			prices: { cappuccino: makeDrinkPrice('cappuccino', 5.0, 'Cappuccino') }
		});
		const unpriced = makeShop({
			id: 'unpriced',
			name: 'No Price Shop',
			prices: {}
		});
		const sorted = sortCoffeeShopsByHeadline([unpriced, priced]);
		expect(sorted.map((s) => s.id)).toEqual(['priced', 'unpriced']);
	});

	it('sorts two unpriced shops alphabetically by name', () => {
		const zulu = makeShop({ id: 'zulu', name: 'Zulu Coffee', prices: {} });
		const alpha = makeShop({ id: 'alpha', name: 'Alpha Coffee', prices: {} });
		const sorted = sortCoffeeShopsByHeadline([zulu, alpha]);
		expect(sorted.map((s) => s.id)).toEqual(['alpha', 'zulu']);
	});

	it('does not mutate the original array', () => {
		const a = makeShop({
			id: 'a',
			name: 'A',
			prices: { cappuccino: makeDrinkPrice('cappuccino', 8.0, 'Cappuccino') }
		});
		const b = makeShop({
			id: 'b',
			name: 'B',
			prices: { cappuccino: makeDrinkPrice('cappuccino', 4.0, 'Cappuccino') }
		});
		const original = [a, b];
		const sorted = sortCoffeeShopsByHeadline(original);
		expect(original[0].id).toBe('a');
		expect(sorted[0].id).toBe('b');
	});

	it('sorts by preferred drink price when specified', () => {
		// Shop A has cheap cappuccino but expensive latte
		const shopA = makeShop({
			id: 'a',
			name: 'A',
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 4.0, 'Cappuccino'),
				latte: makeDrinkPrice('latte', 9.0, 'Latte')
			}
		});
		// Shop B has expensive cappuccino but cheap latte
		const shopB = makeShop({
			id: 'b',
			name: 'B',
			prices: {
				cappuccino: makeDrinkPrice('cappuccino', 8.0, 'Cappuccino'),
				latte: makeDrinkPrice('latte', 5.0, 'Latte')
			}
		});
		// By default (cappuccino), A is cheaper
		const byDefault = sortCoffeeShopsByHeadline([shopB, shopA]);
		expect(byDefault[0].id).toBe('a');
		// By latte, B is cheaper
		const byLatte = sortCoffeeShopsByHeadline([shopA, shopB], 'latte');
		expect(byLatte[0].id).toBe('b');
	});

	it('handles a mix of priced and unpriced shops correctly', () => {
		const pricedCheap = makeShop({
			id: 'cheap',
			name: 'Cheap',
			prices: { cappuccino: makeDrinkPrice('cappuccino', 4.0, 'Cappuccino') }
		});
		const unpricedAlpha = makeShop({ id: 'ua', name: 'Alpha Unpriced', prices: {} });
		const pricedExpensive = makeShop({
			id: 'expensive',
			name: 'Expensive',
			prices: { cappuccino: makeDrinkPrice('cappuccino', 9.0, 'Cappuccino') }
		});
		const unpricedZulu = makeShop({ id: 'uz', name: 'Zulu Unpriced', prices: {} });

		const sorted = sortCoffeeShopsByHeadline([
			unpricedZulu,
			pricedExpensive,
			unpricedAlpha,
			pricedCheap
		]);
		expect(sorted.map((s) => s.id)).toEqual(['cheap', 'expensive', 'ua', 'uz']);
	});

	it('returns a single-element array unchanged', () => {
		const shop = makeShop({ id: 'solo', name: 'Solo' });
		const sorted = sortCoffeeShopsByHeadline([shop]);
		expect(sorted).toHaveLength(1);
		expect(sorted[0].id).toBe('solo');
	});
});
