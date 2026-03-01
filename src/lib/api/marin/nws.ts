/**
 * National Weather Service adapter for Marin County
 *
 * Uses the free NWS API (api.weather.gov) — no API key required.
 * NWS requires a User-Agent header but otherwise has no rate limits.
 *
 * Endpoints used:
 * - /points/{lat},{lon} → gets forecast office + grid coordinates
 * - /gridpoints/{office}/{x},{y}/forecast → 7-day forecast
 * - /alerts/active?zone=CAZ006 → active weather alerts for Marin
 */

import { NWS_ZONE, NWS_OFFICE } from '$lib/config/map';
import { MARIN_CENTER } from '$lib/config/towns';
import type { WeatherData, FireWeatherAlert } from '$lib/types';
import { logger } from '$lib/config/api';

const NWS_BASE = 'https://api.weather.gov';
const NWS_HEADERS = {
	Accept: 'application/geo+json',
	'User-Agent': 'MarinMonitor/1.0 (marin-monitor@example.com)'
};

/** NWS forecast period from the API */
interface NwsForecastPeriod {
	number: number;
	name: string;
	startTime: string;
	endTime: string;
	isDaytime: boolean;
	temperature: number;
	temperatureUnit: string;
	windSpeed: string;
	windDirection: string;
	shortForecast: string;
	detailedForecast: string;
	icon: string;
}

/** NWS alert feature from the API */
interface NwsAlertFeature {
	properties: {
		id: string;
		event: string;
		headline: string;
		description: string;
		severity: string;
		urgency: string;
		onset: string;
		expires: string;
		areaDesc: string;
	};
}

// Cache the grid coordinates keyed by lat/lon
const gridCacheMap = new Map<string, { office: string; gridX: number; gridY: number }>();

/**
 * Get NWS grid coordinates for a location (defaults to Marin County center)
 */
async function getGridPoint(
	lat: number = MARIN_CENTER.lat,
	lon: number = MARIN_CENTER.lon
): Promise<{ office: string; gridX: number; gridY: number }> {
	const key = `${lat},${lon}`;
	const cached = gridCacheMap.get(key);
	if (cached) return cached;

	const url = `${NWS_BASE}/points/${lat},${lon}`;
	const response = await fetch(url, { headers: NWS_HEADERS });

	if (!response.ok) {
		throw new Error(`NWS points lookup failed: ${response.status}`);
	}

	const data = await response.json();
	const grid = {
		office: data.properties.gridId || NWS_OFFICE,
		gridX: data.properties.gridX,
		gridY: data.properties.gridY
	};
	gridCacheMap.set(key, grid);

	return grid;
}

/**
 * Fetch current forecast for Marin County
 * Returns the current period and the next period
 */
export async function fetchForecast(
	lat?: number,
	lon?: number
): Promise<(WeatherData & { name: string })[]> {
	try {
		const grid = await getGridPoint(lat, lon);
		const url = `${NWS_BASE}/gridpoints/${grid.office}/${grid.gridX},${grid.gridY}/forecast`;

		logger.log('NWS', `Fetching forecast: ${url}`);

		const response = await fetch(url, { headers: NWS_HEADERS });
		if (!response.ok) {
			throw new Error(`NWS forecast failed: ${response.status}`);
		}

		const data = await response.json();
		const periods: NwsForecastPeriod[] = data.properties?.periods || [];

		// Include enough periods to derive a real 5-day daytime outlook.
		return periods.slice(0, 14).map((period) => ({
			temperature: period.temperature,
			temperatureUnit: period.temperatureUnit,
			windSpeed: period.windSpeed,
			windDirection: period.windDirection,
			shortForecast: period.shortForecast,
			detailedForecast: period.detailedForecast,
			isDaytime: period.isDaytime,
			timestamp: new Date(period.startTime).getTime(),
			name: period.name
		})) as (WeatherData & { name: string })[];
	} catch (error) {
		logger.warn('NWS', `Forecast fetch failed: ${(error as Error).message}`);
		throw error;
	}
}

/**
 * Fetch active weather alerts for Marin County
 */
export async function fetchAlerts(): Promise<FireWeatherAlert[]> {
	try {
		const url = `${NWS_BASE}/alerts/active?zone=${NWS_ZONE}`;
		logger.log('NWS', `Fetching alerts: ${url}`);

		const response = await fetch(url, { headers: NWS_HEADERS });
		if (!response.ok) {
			throw new Error(`NWS alerts failed: ${response.status}`);
		}

		const data = await response.json();
		const features: NwsAlertFeature[] = data.features || [];

		return features.map((feature) => ({
			id: feature.properties.id,
			event: feature.properties.event,
			headline: feature.properties.headline,
			description: feature.properties.description,
			severity: feature.properties.severity as FireWeatherAlert['severity'],
			urgency: feature.properties.urgency as FireWeatherAlert['urgency'],
			onset: feature.properties.onset,
			expires: feature.properties.expires,
			areaDesc: feature.properties.areaDesc
		}));
	} catch (error) {
		logger.warn('NWS', `Alerts fetch failed: ${(error as Error).message}`);
		throw error;
	}
}

/**
 * Fetch both forecast and alerts in parallel
 */
export async function fetchWeather(
	lat?: number,
	lon?: number
): Promise<{
	forecast: (WeatherData & { name: string })[];
	alerts: FireWeatherAlert[];
}> {
	const [forecast, alerts] = await Promise.allSettled([fetchForecast(lat, lon), fetchAlerts()]);

	return {
		forecast:
			forecast.status === 'fulfilled' ? forecast.value : ([] as (WeatherData & { name: string })[]),
		alerts: alerts.status === 'fulfilled' ? alerts.value : []
	};
}
