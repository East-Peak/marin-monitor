/**
 * Client-side adapter for cappuccino price data
 */

import { createDataFetcher } from './data-fetcher';
import type { CoffeeData } from '$lib/types/coffee';

export const fetchCappuccinoData = createDataFetcher<CoffeeData>(
	'/api/data/cappuccino',
	'Cappuccino',
	{ current: null, history: [] }
);
