/**
 * Client-side adapter for wine index data
 */

import { createDataFetcher } from './data-fetcher';
import type { WineIndexData } from '$lib/types/wine';

export const fetchWineIndexData = createDataFetcher<WineIndexData>(
	'/api/data/wine-index',
	'WineIndex',
	{ current: null, history: [] }
);
