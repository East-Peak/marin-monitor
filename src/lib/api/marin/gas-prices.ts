/**
 * Client-side adapter for gas price data
 */

import { createDataFetcherWithStatus } from './data-fetcher';
import type { GasPriceData } from '$lib/types/gas';

const FALLBACK: GasPriceData = { current: null, history: [] };

export const fetchGasPriceDataWithStatus = createDataFetcherWithStatus<GasPriceData>(
	'/api/data/gas-prices',
	'GasPrices',
	FALLBACK
);
