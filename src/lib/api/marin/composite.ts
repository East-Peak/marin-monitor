/**
 * Client-side adapter for composite index data
 */

import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { CompositeData } from '$lib/types/composite';

const FALLBACK: CompositeData = { current: null, history: [] };

export const fetchCompositeData = createDataFetcher<CompositeData>(
	'/api/data/composite',
	'Composite',
	FALLBACK
);

export const fetchCompositeDataWithStatus = createDataFetcherWithStatus<CompositeData>(
	'/api/data/composite',
	'Composite',
	FALLBACK
);
