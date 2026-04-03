import { createDataFetcher } from './data-fetcher';
import type { NewsItem } from '$lib/types';

export const fetchSupplementalActivityFeeds = createDataFetcher<NewsItem[]>(
	'/api/data/activity',
	'ACTIVITY',
	[]
);
