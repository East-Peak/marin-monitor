import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { NewsItem } from '$lib/types';

export const fetchSupplementalPoliceLogs = createDataFetcher<NewsItem[]>(
	'/api/data/police-logs',
	'POLICE',
	[]
);

/** v2's police read: a failure is a failure, never "no reports". */
export const fetchPoliceLogsDataWithStatus = createDataFetcherWithStatus<NewsItem[]>(
	'/api/data/police-logs',
	'POLICE',
	[]
);
