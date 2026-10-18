import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { NewsItem } from '$lib/types';

export const fetchSupplementalActivityFeeds = createDataFetcher<NewsItem[]>(
	'/api/data/activity',
	'ACTIVITY',
	[]
);

/** The activity items with the time the cron wrote them (null when the payload doesn't say). */
export interface ActivityRead {
	items: NewsItem[];
	syncedAt: string | null;
}

/** v2's Events and map read: a failure is a failure, never an empty calendar (NEWSPIN1). */
export const fetchActivityReadWithStatus = createDataFetcherWithStatus<ActivityRead>(
	'/api/data/activity',
	'ACTIVITY',
	{ items: [], syncedAt: null },
	(body, response) => ({
		items: body as NewsItem[],
		syncedAt: response.headers.get('X-Synced-At')
	})
);
