/**
 * Client-side adapter for the Marin Coffee Index.
 */

import { createDataFetcher } from './data-fetcher';
import type { CoffeeIndexData } from '$lib/types/coffee';

export const fetchCoffeeIndexData = createDataFetcher<CoffeeIndexData>(
	'/api/data/coffee',
	'Coffee',
	{ current: null, history: [] }
);
