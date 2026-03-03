/**
 * Client-side adapter for wastewater pathogen surveillance data
 */

import { logger } from '$lib/config/api';
import { fetchJson } from './fetch-helpers';
import type { WastewaterData } from '$lib/types';

export async function fetchWastewaterData(): Promise<WastewaterData | null> {
	try {
		logger.log('Wastewater', 'Loading wastewater data from /api/wastewater');
		return await fetchJson<WastewaterData>('/api/wastewater');
	} catch (error) {
		logger.warn('Wastewater', `Wastewater data fetch failed: ${(error as Error).message}`);
		return null;
	}
}
