import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { NewsItem } from '$lib/types';

export const fetchSupplementalActivityFeeds = createDataFetcher<NewsItem[]>(
	'/api/data/activity',
	'ACTIVITY',
	[]
);

/** v2's Events read: a failure is a failure, never an empty calendar. */
export const fetchActivityDataWithStatus = createDataFetcherWithStatus<NewsItem[]>(
	'/api/data/activity',
	'ACTIVITY',
	[]
);
