/**
 * Client-side adapter for grocery basket data
 */

import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { GroceryBasketData } from '$lib/types/grocery';

const FALLBACK: GroceryBasketData = { current: null, history: [] };

export const fetchGroceryBasketData = createDataFetcher<GroceryBasketData>(
	'/api/data/grocery-basket',
	'GroceryBasket',
	FALLBACK
);

export const fetchGroceryBasketDataWithStatus = createDataFetcherWithStatus<GroceryBasketData>(
	'/api/data/grocery-basket',
	'GroceryBasket',
	FALLBACK
);
