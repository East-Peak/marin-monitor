/**
 * Client-side adapter for fitness drop-in price data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { FitnessData } from '$lib/types/fitness';

export async function fetchFitnessData(): Promise<FitnessData> {
	try {
		logger.log('Fitness', 'Loading fitness data from /api/data/fitness');

		const response = await fetchWithTimeout('/api/data/fitness');
		if (!response.ok) {
			throw new Error(`Fitness data fetch failed: ${response.status}`);
		}

		return (await response.json()) as FitnessData;
	} catch (error) {
		logger.warn('Fitness', `Fitness data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
