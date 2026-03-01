/**
 * AirNow AQI adapter for Marin County
 *
 * Fetches current Air Quality Index from EPA's AirNow API.
 * Free key required (VITE_AIRNOW_API_KEY).
 * Docs: https://docs.airnowapi.org/
 */

import type { AirQualityData } from '$lib/types';
import { AIRNOW_API_KEY, API_URLS, logger } from '$lib/config/api';
import { MARIN_CENTER } from '$lib/config/towns';

interface AirNowObservation {
	DateObserved: string;
	HourObserved: number;
	LocalTimeZone: string;
	ReportingArea: string;
	StateCode: string;
	Latitude: number;
	Longitude: number;
	ParameterName: string;
	AQI: number;
	Category: {
		Number: number;
		Name: string;
	};
}

/**
 * Map AQI category number to display color
 */
function aqiColor(categoryNumber: number): string {
	switch (categoryNumber) {
		case 1:
			return '#00e400'; // Good — green
		case 2:
			return '#ffff00'; // Moderate — yellow
		case 3:
			return '#ff7e00'; // USG — orange
		case 4:
			return '#ff0000'; // Unhealthy — red
		case 5:
			return '#8f3f97'; // Very Unhealthy — purple
		case 6:
			return '#7e0023'; // Hazardous — maroon
		default:
			return '#999999';
	}
}

/**
 * Fetch current AQI for Marin County area.
 * Returns the highest-AQI observation (typically PM2.5 or Ozone).
 */
export async function fetchAirQuality(): Promise<AirQualityData | null> {
	if (!AIRNOW_API_KEY) {
		logger.warn('AirNow', 'No API key configured (VITE_AIRNOW_API_KEY)');
		return null;
	}

	try {
		const params = new URLSearchParams({
			format: 'application/json',
			latitude: String(MARIN_CENTER.lat),
			longitude: String(MARIN_CENTER.lon),
			distance: '25',
			API_KEY: AIRNOW_API_KEY
		});

		const url = `${API_URLS.airnow}/?${params}`;
		logger.log('AirNow', `Fetching AQI: ${url.replace(AIRNOW_API_KEY, '***')}`);

		const response = await fetch(url, {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			throw new Error(`AirNow API failed: ${response.status}`);
		}

		const observations: AirNowObservation[] = await response.json();

		if (observations.length === 0) {
			logger.warn('AirNow', 'No observations returned');
			return null;
		}

		// Pick the highest AQI observation (worst pollutant)
		const worst = observations.reduce((a, b) => (a.AQI >= b.AQI ? a : b));

		return {
			aqi: worst.AQI,
			category: worst.Category.Name,
			color: aqiColor(worst.Category.Number),
			pollutant: worst.ParameterName,
			timestamp: Date.now()
		};
	} catch (error) {
		logger.warn('AirNow', `AQI fetch failed: ${(error as Error).message}`);
		return null;
	}
}
