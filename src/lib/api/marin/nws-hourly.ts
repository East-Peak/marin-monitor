/**
 * NWS Hourly Forecast adapter
 *
 * Fetches the hourly forecast for the next 24 hours from the NWS gridpoints API.
 * Used by the upgraded WeatherPanel for the temperature sparkline.
 */

import { logger } from '$lib/config/api';
import { getGridPoint } from './nws-common';
import { serviceClient } from '$lib/services/client';

export interface HourlyPeriod {
	startTime: string;
	temperature: number;
	precipitationChance: number;
	temperatureUnit: string;
	windSpeed: string;
	windDirection: string;
	shortForecast: string;
	isDaytime: boolean;
	dewpoint: number | null;
	relativeHumidity: number | null;
}

/** QPF (Quantitative Precipitation Forecast) for a time window */
export interface QpfPeriod {
	startTime: string;
	endTime: string;
	rainInches: number;
}

/** NWS API response shapes */
interface NwsHourlyResponse {
	properties?: {
		periods: Array<{
			startTime: string;
			temperature: number;
			probabilityOfPrecipitation?: { value: number | null };
			temperatureUnit: string;
			windSpeed: string;
			windDirection: string;
			shortForecast: string;
			isDaytime: boolean;
			dewpoint?: { value: number | null; unitCode?: string };
			relativeHumidity?: { value: number | null };
		}>;
	};
}

interface NwsGridpointResponse {
	properties?: {
		quantitativePrecipitation?: {
			values: Array<{ validTime: string; value: number }>;
		};
	};
}

const NWS_OPTIONS = {
	accept: 'application/geo+json',
	headers: { 'User-Agent': 'MarinMonitor/1.0 (marin-monitor@example.com)' }
};

/** Daily rain total derived from QPF */
export interface DailyRainForecast {
	/** Date string YYYY-MM-DD */
	date: string;
	/** Total estimated rainfall in inches */
	totalInches: number;
}

/**
 * Fetch hourly forecast for the next 24 hours
 */
export async function fetchHourlyForecast(lat?: number, lon?: number): Promise<HourlyPeriod[]> {
	try {
		const grid = await getGridPoint(lat, lon);
		const endpoint = `/gridpoints/${grid.office}/${grid.gridX},${grid.gridY}/forecast/hourly`;

		logger.log('NWS', `Fetching hourly forecast: ${endpoint}`);

		const result = await serviceClient.request<NwsHourlyResponse>('NWS', endpoint, NWS_OPTIONS);
		const periods = result.data.properties?.periods || [];

		// Return next 24 hours
		return periods.slice(0, 24).map((p) => ({
			startTime: p.startTime,
			temperature: p.temperature,
			precipitationChance: p.probabilityOfPrecipitation?.value ?? 0,
			temperatureUnit: p.temperatureUnit,
			windSpeed: p.windSpeed,
			windDirection: p.windDirection,
			shortForecast: p.shortForecast,
			isDaytime: p.isDaytime,
			dewpoint:
				p.dewpoint?.value != null ? Math.round(p.dewpoint.value * (9 / 5) + 32) : null,
			relativeHumidity: p.relativeHumidity?.value ?? null
		}));
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
		const endpoint = `/gridpoints/${grid.office}/${grid.gridX},${grid.gridY}`;

		logger.log('NWS', `Fetching QPF: ${endpoint}`);

		const result = await serviceClient.request<NwsGridpointResponse>('NWS', endpoint, NWS_OPTIONS);
		const qpf = result.data.properties?.quantitativePrecipitation;
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
