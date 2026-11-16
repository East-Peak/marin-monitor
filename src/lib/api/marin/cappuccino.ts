/**
 * Client-side adapter for cappuccino price data
 */

import { createDataFetcherWithStatus } from './data-fetcher';
import type { CoffeeData } from '$lib/types/coffee';

const FALLBACK: CoffeeData = { current: null, history: [] };

export const fetchCappuccinoDataWithStatus = createDataFetcherWithStatus<CoffeeData>(
	'/api/data/cappuccino',
	'Cappuccino',
	FALLBACK
);
