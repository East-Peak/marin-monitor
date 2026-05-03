/**
 * Client-side adapter for wine index data
 */

import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { WineIndexData } from '$lib/types/wine';

const FALLBACK: WineIndexData = { current: null, history: [] };

export const fetchWineIndexData = createDataFetcher<WineIndexData>(
	'/api/data/wine-index',
	'WineIndex',
	FALLBACK
);

export const fetchWineIndexDataWithStatus = createDataFetcherWithStatus<WineIndexData>(
	'/api/data/wine-index',
	'WineIndex',
	FALLBACK
);
