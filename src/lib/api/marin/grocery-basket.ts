/**
 * Client-side adapter for grocery basket data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { GroceryBasketData } from '$lib/types/grocery';

export async function fetchGroceryBasketData(): Promise<GroceryBasketData> {
	try {
		logger.log('GroceryBasket', 'Loading grocery basket data from /api/data/grocery-basket');

		const response = await fetchWithTimeout('/api/data/grocery-basket');
		if (!response.ok) {
			throw new Error(`Grocery basket data fetch failed: ${response.status}`);
		}

		return (await response.json()) as GroceryBasketData;
	} catch (error) {
		logger.warn('GroceryBasket', `Grocery basket data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
