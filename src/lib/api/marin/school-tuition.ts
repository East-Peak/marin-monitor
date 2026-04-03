/**
 * Client-side adapter for school tuition index data
 */

import { createDataFetcher } from './data-fetcher';
import type { SchoolIndexData } from '$lib/types/school';

export const fetchSchoolTuitionData = createDataFetcher<SchoolIndexData>(
	'/api/data/school-tuition',
	'SchoolTuition',
	{ current: null, history: [] }
);
