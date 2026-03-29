/**
 * Client-side adapter for cappuccino price data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { CoffeeData } from '$lib/types/coffee';

export async function fetchCappuccinoData(): Promise<CoffeeData> {
	try {
		logger.log('Cappuccino', 'Loading cappuccino prices from /api/data/cappuccino');

		const response = await fetchWithTimeout('/api/data/cappuccino');
		if (!response.ok) {
			throw new Error(`Cappuccino data fetch failed: ${response.status}`);
		}

		return (await response.json()) as CoffeeData;
	} catch (error) {
		logger.warn('Cappuccino', `Cappuccino data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
