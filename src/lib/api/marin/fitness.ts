/**
 * Client-side adapter for fitness drop-in price data
 */

import { createDataFetcher } from './data-fetcher';
import type { FitnessData } from '$lib/types/fitness';

export const fetchFitnessData = createDataFetcher<FitnessData>(
	'/api/data/fitness',
	'Fitness',
	{ current: null, history: [] }
);
