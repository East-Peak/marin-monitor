/**
 * Client-side adapter for wine index data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { WineIndexData } from '$lib/types/wine';

export async function fetchWineIndexData(): Promise<WineIndexData> {
	try {
		logger.log('WineIndex', 'Loading wine index data from /api/data/wine-index');

		const response = await fetchWithTimeout('/api/data/wine-index');
		if (!response.ok) {
			throw new Error(`Wine index data fetch failed: ${response.status}`);
		}

		return (await response.json()) as WineIndexData;
	} catch (error) {
		logger.warn('WineIndex', `Wine index data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
