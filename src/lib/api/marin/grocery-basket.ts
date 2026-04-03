/**
 * Client-side adapter for grocery basket data
 */

import { createDataFetcher } from './data-fetcher';
import type { GroceryBasketData } from '$lib/types/grocery';

export const fetchGroceryBasketData = createDataFetcher<GroceryBasketData>(
	'/api/data/grocery-basket',
	'GroceryBasket',
	{ current: null, history: [] }
);
