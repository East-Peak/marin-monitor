import { describe, expect, it } from 'vitest';
import { COFFEE_INDEX_DRINKS } from '$lib/config/coffee';
import {
	buildCoffeeIndexSnapshot,
	extractDrinkPricesFromItems,
	extractDrinkPricesFromState,
	extractDrinkPricesFromText,
	hasFreshCoffeeIndexCoverage,
	mergeShopDrinkPrices
} from './coffee-index.shared.js';

describe('extractDrinkPricesFromItems', () => {
	it('extracts drinks from structured html menu items', () => {
		const prices = extractDrinkPricesFromItems(
			[
				{ name: 'House Coffee', prices: [3.25, 4] },
				{ name: 'CAPPUCCINO', prices: [4.75, 5.75] },
				{ name: 'LATTE', prices: [5, 6] }
			],
			COFFEE_INDEX_DRINKS,
			'2026-03-31T12:00:00Z'
		);

		expect(prices.house_coffee?.price).toBe(3.25);
		expect(prices.cappuccino?.price).toBe(4.75);
		expect(prices.latte?.price).toBe(5);
	});
});

describe('extractDrinkPricesFromState', () => {
	it('extracts tracked drinks and avoids noisy coffee matches', () => {
		const state = {
			'Menu:abc123': {
				groups: [
					{
						name: 'Hot Drinks',
						items: [
							{ name: 'Cappuccino', prices: [5.25] },
							{ name: 'Caffe Latte', prices: [5.95] },
							{ name: 'Flat White Latte', prices: [5.75] },
							{ name: '10oz Coffee', prices: [3.5] },
							{ name: 'Pour-Over', prices: [4.75] },
							{ name: 'Coffee Cake', prices: [5] }
						]
					}
				]
			}
		};

		const prices = extractDrinkPricesFromState(state, COFFEE_INDEX_DRINKS, '2026-03-30T12:00:00Z');
		expect(prices.cappuccino?.price).toBe(5.25);
		expect(prices.latte?.price).toBe(5.95);
		expect(prices.flat_white?.price).toBe(5.75);
		expect(prices.flat_white?.matchedName).toBe('Flat White Latte');
		expect(prices.house_coffee?.price).toBe(3.5);
		expect(prices.pour_over?.price).toBe(4.75);
	});
});

describe('extractDrinkPricesFromText', () => {
	it('matches multiline menu text for coffee and pour-over without grabbing retail items', () => {
		const text = `Hot Drinks
Cappuccino $5.25
Flat White
$5.50
Coffee
$3.75
Pour-Over
$4.50
Coffee Cake $5.00`;

		const prices = extractDrinkPricesFromText(text, COFFEE_INDEX_DRINKS, '2026-03-30T12:00:00Z');
		expect(prices.flat_white?.price).toBe(5.5);
		expect(prices.cappuccino?.price).toBe(5.25);
		expect(prices.house_coffee?.price).toBe(3.75);
		expect(prices.pour_over?.price).toBe(4.5);
		expect(prices.latte).toBeUndefined();
	});

	it('accepts adjacent price ranges from html menus and uses the lower bound', () => {
		const text = `Coffee
$3.25 - $4.00
House Coffee
$3.25 - $4.00
Cappuccino
$4.75 - $5.75
Latte
$5.00 - $6.00`;

		const prices = extractDrinkPricesFromText(text, COFFEE_INDEX_DRINKS, '2026-03-31T12:00:00Z');
		expect(prices.house_coffee?.price).toBe(3.25);
		expect(prices.cappuccino?.price).toBe(4.75);
		expect(prices.latte?.price).toBe(5);
	});
});

describe('mergeShopDrinkPrices', () => {
	it('prefers live prices, then previous fallback, then hardcoded fallback', () => {
		const merged = mergeShopDrinkPrices(
			COFFEE_INDEX_DRINKS,
			{
				cappuccino: {
					drinkId: 'cappuccino',
					label: 'Cappuccino',
					price: 5.5,
					priceSource: 'live',
					updateTime: '2026-03-30T12:00:00Z',
					matchedName: 'Cappuccino'
				}
			},
			{
				latte: {
					drinkId: 'latte',
					label: 'Latte',
					price: 5.75,
					priceSource: 'live',
					updateTime: '2026-03-23T12:00:00Z',
					matchedName: 'Latte'
				}
			},
			{
				pour_over: 5.75
			},
			'2026-03-30T12:00:00Z'
		);

		expect(merged.cappuccino?.priceSource).toBe('live');
		expect(merged.latte?.priceSource).toBe('fallback');
		expect(merged.latte?.isStale).toBe(true);
		expect(merged.pour_over?.priceSource).toBe('hardcoded');
		expect(merged.house_coffee).toBeUndefined();
	});
});

describe('buildCoffeeIndexSnapshot', () => {
	it('computes per-drink and menu coverage summary stats', () => {
		const snapshot = buildCoffeeIndexSnapshot({
			indexName: 'Marin Coffee Index',
			primaryDrink: 'cappuccino',
			drinks: COFFEE_INDEX_DRINKS,
			lastSuccessfulScrapeAt: '2026-03-30T12:00:00Z',
			liveMenuEligibleShopCount: 1,
			shops: [
				{
					id: 'shop-a',
					name: 'Shop A',
					address: '123 Main St',
					town: 'Mill Valley',
					lat: 37.9,
					lon: -122.5,
					source: 'toast',
					prices: {
						cappuccino: {
							drinkId: 'cappuccino',
							label: 'Cappuccino',
							price: 5.25,
							priceSource: 'live',
							updateTime: '2026-03-30T12:00:00Z',
							matchedName: 'Cappuccino'
						},
						house_coffee: {
							drinkId: 'house_coffee',
							label: 'Coffee',
							price: 3.5,
							priceSource: 'live',
							updateTime: '2026-03-30T12:00:00Z',
							matchedName: '10oz Coffee'
						}
					}
				},
				{
					id: 'shop-b',
					name: 'Shop B',
					address: '456 Oak St',
					town: 'San Rafael',
					lat: 37.97,
					lon: -122.52,
					source: 'html',
					prices: {
						cappuccino: {
							drinkId: 'cappuccino',
							label: 'Cappuccino',
							price: 5.75,
							priceSource: 'fallback',
							updateTime: '2026-03-23T12:00:00Z',
							matchedName: null,
							isStale: true
						},
						pour_over: {
							drinkId: 'pour_over',
							label: 'Pour-Over',
							price: 5.75,
							priceSource: 'hardcoded',
							updateTime: '2026-03-30T12:00:00Z',
							matchedName: null
						}
					}
				}
			]
		});

		expect(snapshot.shopCount).toBe(2);
		expect(snapshot.pricedShopCount).toBe(2);
		expect(snapshot.liveMenuShopCount).toBe(1);
		expect(snapshot.liveMenuEligibleShopCount).toBe(1);
		expect(snapshot.fallbackMenuShopCount).toBe(1);
		expect(snapshot.primaryDrinkSummary.medianPrice).toBe(5.5);
		expect(snapshot.drinks.cappuccino.pricedShopCount).toBe(2);
		expect(snapshot.drinks.house_coffee.liveShopCount).toBe(1);
		expect(snapshot.drinks.pour_over.hardcodedShopCount).toBe(1);
	});
});

describe('hasFreshCoffeeIndexCoverage', () => {
	it('requires the configured live-menu ratio across eligible live sources', () => {
		expect(hasFreshCoffeeIndexCoverage(6, 9, 0.5)).toBe(true);
		expect(hasFreshCoffeeIndexCoverage(4, 9, 0.5)).toBe(false);
	});
});
