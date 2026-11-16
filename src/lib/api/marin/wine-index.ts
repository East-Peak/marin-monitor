/**
 * Client-side adapter for wine index data
 */

import { createDataFetcherWithStatus } from './data-fetcher';
import type { WineIndexData } from '$lib/types/wine';

const FALLBACK: WineIndexData = { current: null, history: [] };

export const fetchWineIndexDataWithStatus = createDataFetcherWithStatus<WineIndexData>(
	'/api/data/wine-index',
	'WineIndex',
	FALLBACK
);
