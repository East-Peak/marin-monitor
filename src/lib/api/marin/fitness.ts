/**
 * Client-side adapter for fitness drop-in price data
 */

import { createDataFetcherWithStatus } from './data-fetcher';
import type { FitnessData } from '$lib/types/fitness';

const FALLBACK: FitnessData = { current: null, history: [] };

export const fetchFitnessDataWithStatus = createDataFetcherWithStatus<FitnessData>(
	'/api/data/fitness',
	'Fitness',
	FALLBACK
);
