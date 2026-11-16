/**
 * Client-side adapter for the Marin Coffee Index.
 */

import { createDataFetcherWithStatus } from './data-fetcher';
import type { CoffeeIndexData } from '$lib/types/coffee';

const FALLBACK: CoffeeIndexData = { current: null, history: [] };

/** Status-aware and owner-aware: the v2 dataset owner needs failures and fallbacks reported (spec §13.7). */
export const fetchCoffeeIndexDataWithStatus = createDataFetcherWithStatus<CoffeeIndexData>(
	'/api/data/coffee',
	'Coffee',
	FALLBACK
);
