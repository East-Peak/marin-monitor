/**
 * Client-side adapter for EV charging station data
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { EvChargingData } from '$lib/types/ev-charging';

export async function fetchEvChargingData(): Promise<EvChargingData> {
	try {
		logger.log('EvCharging', 'Loading EV charging data from /api/data/ev-charging');

		const response = await fetchWithTimeout('/api/data/ev-charging');
		if (!response.ok) {
			throw new Error(`EV charging data fetch failed: ${response.status}`);
		}

		return (await response.json()) as EvChargingData;
	} catch (error) {
		logger.warn('EvCharging', `EV charging data fetch failed: ${(error as Error).message}`);
		return { current: null, history: [] };
	}
}
