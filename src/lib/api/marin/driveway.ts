/**
 * Client-side adapter for Marin Driveway Index data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { DrivewayData } from '$lib/types/driveway';

export async function fetchDrivewayData(): Promise<DrivewayData> {
	try {
		logger.log('Driveway', 'Loading driveway data from /api/data/driveway');

		const response = await fetchWithTimeout('/api/data/driveway');
		if (!response.ok) {
			throw new Error(`Driveway data fetch failed: ${response.status}`);
		}

		return (await response.json()) as DrivewayData;
	} catch (error) {
		logger.warn('Driveway', `Driveway data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
