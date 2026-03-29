/**
 * Client-side adapter for school tuition index data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { SchoolIndexData } from '$lib/types/school';

export async function fetchSchoolTuitionData(): Promise<SchoolIndexData> {
	try {
		logger.log('SchoolTuition', 'Loading school tuition data from /api/data/school-tuition');

		const response = await fetchWithTimeout('/api/data/school-tuition');
		if (!response.ok) {
			throw new Error(`School tuition data fetch failed: ${response.status}`);
		}

		return (await response.json()) as SchoolIndexData;
	} catch (error) {
		logger.warn('SchoolTuition', `School tuition data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
