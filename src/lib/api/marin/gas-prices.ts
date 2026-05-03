/**
 * Client-side adapter for gas price data
 */

import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { GasPriceData } from '$lib/types/gas';

const FALLBACK: GasPriceData = { current: null, history: [] };

export const fetchGasPriceData = createDataFetcher<GasPriceData>(
	'/api/data/gas-prices',
	'GasPrices',
	FALLBACK
);

export const fetchGasPriceDataWithStatus = createDataFetcherWithStatus<GasPriceData>(
	'/api/data/gas-prices',
	'GasPrices',
	FALLBACK
);
