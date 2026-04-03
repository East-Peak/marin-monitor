/**
 * Client-side adapter for composite index data
 */

import { createDataFetcher } from './data-fetcher';
import type { CompositeData } from '$lib/types/composite';

export const fetchCompositeData = createDataFetcher<CompositeData>(
	'/api/data/composite',
	'Composite',
	{ current: null, history: [] }
);
