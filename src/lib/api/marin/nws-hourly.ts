/**
 * NWS Hourly Forecast adapter
 *
 * Fetches the hourly forecast for the next 24 hours from the NWS gridpoints API.
 * Used by the upgraded WeatherPanel for the temperature sparkline.
 */

import { MARIN_CENTER } from '$lib/config/towns';
import { NWS_OFFICE } from '$lib/config/map';
import { logger } from '$lib/config/api';

const NWS_BASE = 'https://api.weather.gov';
const NWS_HEADERS = {
	Accept: 'application/geo+json',
	'User-Agent': 'MarinMonitor/1.0 (marin-monitor@example.com)'
};

export interface HourlyPeriod {
	startTime: string;
	temperature: number;
	precipitationChance: number;
	temperatureUnit: string;
	windSpeed: string;
	windDirection: string;
	shortForecast: string;
	isDaytime: boolean;
}

/** QPF (Quantitative Precipitation Forecast) for a time window */
export interface QpfPeriod {
	startTime: string;
	endTime: string;
	rainInches: number;
}

/** Daily rain total derived from QPF */
export interface DailyRainForecast {
	/** Date string YYYY-MM-DD */
	date: string;
	/** Total estimated rainfall in inches */
	totalInches: number;
}

// Cache grid coordinates keyed by lat/lon
const gridCacheMap = new Map<string, { office: string; gridX: number; gridY: number }>();

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
 * Fetch hourly forecast for the next 24 hours
 */
export async function fetchHourlyForecast(lat?: number, lon?: number): Promise<HourlyPeriod[]> {
	try {
		const grid = await getGridPoint(lat, lon);
		const url = `${NWS_BASE}/gridpoints/${grid.office}/${grid.gridX},${grid.gridY}/forecast/hourly`;

		logger.log('NWS', `Fetching hourly forecast: ${url}`);

		const response = await fetch(url, { headers: NWS_HEADERS });
		if (!response.ok) {
			throw new Error(`NWS hourly forecast failed: ${response.status}`);
		}

		const data = await response.json();
		const periods = data.properties?.periods || [];

		// Return next 24 hours
		return periods
			.slice(0, 24)
			.map(
				(p: {
					startTime: string;
					temperature: number;
					probabilityOfPrecipitation?: { value: number | null };
					temperatureUnit: string;
					windSpeed: string;
					windDirection: string;
					shortForecast: string;
					isDaytime: boolean;
				}) => ({
					startTime: p.startTime,
					temperature: p.temperature,
					precipitationChance: p.probabilityOfPrecipitation?.value ?? 0,
					temperatureUnit: p.temperatureUnit,
					windSpeed: p.windSpeed,
					windDirection: p.windDirection,
					shortForecast: p.shortForecast,
					isDaytime: p.isDaytime
				})
			);
	} catch (error) {
		logger.warn('NWS', `Hourly forecast fetch failed: ${(error as Error).message}`);
		return [];
	}
}

/**
 * Parse an ISO 8601 duration + validTime into start/end timestamps.
 * Format: "2026-03-02T06:00:00+00:00/PT6H"
 */
function parseValidTime(validTime: string): { start: Date; end: Date } | null {
	const parts = validTime.split('/');
	if (parts.length !== 2) return null;
	const start = new Date(parts[0]);
	if (isNaN(start.getTime())) return null;

	const durationMatch = parts[1].match(/PT(\d+)H/);
	if (!durationMatch) return null;
	const hours = parseInt(durationMatch[1], 10);
	const end = new Date(start.getTime() + hours * 3600_000);
	return { start, end };
}

/**
 * Fetch quantitative precipitation forecast (QPF) and aggregate by day.
 * Returns daily totals in inches for the next 5 days.
 */
export async function fetchDailyRainForecast(
	lat?: number,
	lon?: number
): Promise<DailyRainForecast[]> {
	try {
		const grid = await getGridPoint(lat, lon);
		const url = `${NWS_BASE}/gridpoints/${grid.office}/${grid.gridX},${grid.gridY}`;

		logger.log('NWS', `Fetching QPF: ${url}`);

		const response = await fetch(url, { headers: NWS_HEADERS });
		if (!response.ok) {
			throw new Error(`NWS gridpoint failed: ${response.status}`);
		}

		const data = await response.json();
		const qpf = data.properties?.quantitativePrecipitation;
		if (!qpf?.values?.length) return [];

		// Aggregate mm values by local date
		const dailyMm = new Map<string, number>();

		for (const entry of qpf.values) {
			const parsed = parseValidTime(entry.validTime);
			if (!parsed || !entry.value) continue;

			// Use local date of the period start
			const dateStr = parsed.start.toLocaleDateString('en-CA'); // YYYY-MM-DD
			dailyMm.set(dateStr, (dailyMm.get(dateStr) ?? 0) + entry.value);
		}

		// Convert to inches, keep only next 5 days with any rain
		const today = new Date().toLocaleDateString('en-CA');
		return [...dailyMm.entries()]
			.filter(([date]) => date >= today)
			.slice(0, 7)
			.map(([date, mm]) => ({
				date,
				totalInches: Math.round((mm / 25.4) * 100) / 100
			}));
	} catch (error) {
		logger.warn('NWS', `QPF fetch failed: ${(error as Error).message}`);
		return [];
	}
}
