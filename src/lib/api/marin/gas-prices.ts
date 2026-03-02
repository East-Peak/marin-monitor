/**
 * Client-side adapter for gas price data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { GasPriceData } from '$lib/types/gas';

export async function fetchGasPriceData(): Promise<GasPriceData> {
	try {
		logger.log('GasPrices', 'Loading gas prices from /api/data/gas-prices');

		const response = await fetchWithTimeout('/api/data/gas-prices');
		if (!response.ok) {
			throw new Error(`Gas price data fetch failed: ${response.status}`);
		}

		return (await response.json()) as GasPriceData;
	} catch (error) {
		logger.warn('GasPrices', `Gas price data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
