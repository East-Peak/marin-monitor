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
