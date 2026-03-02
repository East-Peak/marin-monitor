/**
 * AirNow AQI adapter for Marin County
 *
 * Fetches current Air Quality Index through a first-party API route so the key
 * stays server-side in production.
 * Docs: https://docs.airnowapi.org/
 */

import type { AirQualityData } from '$lib/types';
import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';

/**
 * Fetch current AQI for Marin County area.
 * Returns the highest-AQI observation (typically PM2.5 or Ozone).
 */
export async function fetchAirQuality(): Promise<AirQualityData | null> {
	try {
		const response = await fetchWithTimeout('/api/air-quality', {
			headers: { Accept: 'application/json' }
		});

		if (response.status === 204) {
			return null;
		}
		if (!response.ok) {
			throw new Error(`AirNow proxy failed: ${response.status}`);
		}
		return (await response.json()) as AirQualityData;
	} catch (error) {
		logger.warn('AirNow', `AQI fetch failed: ${(error as Error).message}`);
		return null;
	}
}
