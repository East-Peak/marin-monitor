/**
 * Client-side adapter for cappuccino price data
 */

import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { CoffeeData } from '$lib/types/coffee';

const FALLBACK: CoffeeData = { current: null, history: [] };

export const fetchCappuccinoData = createDataFetcher<CoffeeData>(
	'/api/data/cappuccino',
	'Cappuccino',
	FALLBACK
);

export const fetchCappuccinoDataWithStatus = createDataFetcherWithStatus<CoffeeData>(
	'/api/data/cappuccino',
	'Cappuccino',
	FALLBACK
);
