/**
 * Client-side adapter for airport status data (SFO & OAK)
 */

import { logger } from '$lib/config/api';
import { fetchJson } from './fetch-helpers';
import type { AirportStatusData } from '$lib/types/airport';

export async function fetchAirportStatus(): Promise<AirportStatusData | null> {
	try {
		logger.log('Airport', 'Loading airport status from /api/airport-status');
		return await fetchJson<AirportStatusData>('/api/airport-status');
	} catch (error) {
		logger.warn('Airport', `Airport status fetch failed: ${(error as Error).message}`);
		return null;
	}
}
