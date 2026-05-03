/**
 * Client-side adapter for school tuition index data
 */

import { createDataFetcher, createDataFetcherWithStatus } from './data-fetcher';
import type { SchoolIndexData } from '$lib/types/school';

const FALLBACK: SchoolIndexData = { current: null, history: [] };

export const fetchSchoolTuitionData = createDataFetcher<SchoolIndexData>(
	'/api/data/school-tuition',
	'SchoolTuition',
	FALLBACK
);

export const fetchSchoolTuitionDataWithStatus = createDataFetcherWithStatus<SchoolIndexData>(
	'/api/data/school-tuition',
	'SchoolTuition',
	FALLBACK
);
