/**
 * Client-side adapter for grocery basket data
 */

import { createDataFetcherWithStatus } from './data-fetcher';
import type { GroceryBasketData } from '$lib/types/grocery';

const FALLBACK: GroceryBasketData = { current: null, history: [] };

export const fetchGroceryBasketDataWithStatus = createDataFetcherWithStatus<GroceryBasketData>(
	'/api/data/grocery-basket',
	'GroceryBasket',
	FALLBACK
);
