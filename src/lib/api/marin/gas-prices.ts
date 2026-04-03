/**
 * Client-side adapter for gas price data
 */

import { createDataFetcher } from './data-fetcher';
import type { GasPriceData } from '$lib/types/gas';

export const fetchGasPriceData = createDataFetcher<GasPriceData>(
	'/api/data/gas-prices',
	'GasPrices',
	{ current: null, history: [] }
);
