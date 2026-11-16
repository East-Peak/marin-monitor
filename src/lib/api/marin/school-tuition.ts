/**
 * Client-side adapter for school tuition index data
 */

import { createDataFetcherWithStatus } from './data-fetcher';
import type { SchoolIndexData } from '$lib/types/school';

const FALLBACK: SchoolIndexData = { current: null, history: [] };

export const fetchSchoolTuitionDataWithStatus = createDataFetcherWithStatus<SchoolIndexData>(
	'/api/data/school-tuition',
	'SchoolTuition',
	FALLBACK
);
