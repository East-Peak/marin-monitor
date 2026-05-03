/**
 * Client-side adapter for fitness drop-in price data
 */

import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { FitnessData } from '$lib/types/fitness';

const FALLBACK: FitnessData = { current: null, history: [] };

export const fetchFitnessData = createDataFetcher<FitnessData>(
	'/api/data/fitness',
	'Fitness',
	FALLBACK
);

export const fetchFitnessDataWithStatus = createDataFetcherWithStatus<FitnessData>(
	'/api/data/fitness',
	'Fitness',
	FALLBACK
);
