import { createDataFetcher } from './data-fetcher';
import type { NewsItem } from '$lib/types';

export const fetchSupplementalPoliceLogs = createDataFetcher<NewsItem[]>(
	'/api/data/police-logs',
	'POLICE',
	[]
);
