/**
 * NOAA CO-OPS Tides adapter
 *
 * Fetches tide predictions from NOAA for Point Reyes and San Francisco stations.
 * Free API, no key required.
 *
 * Endpoint: https://api.tidesandcurrents.noaa.gov/api/prod/datagetter
 */

import { TIDE_STATIONS } from '$lib/config/map';
import type { TidePrediction } from '$lib/types';
import { logger } from '$lib/config/api';

const NOAA_BASE = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

interface NoaaTidePrediction {
	t: string; // time "YYYY-MM-DD HH:MM"
	v: string; // height in feet
	type?: string; // "H" or "L" for hi/lo predictions
}

/**
 * Fetch high/low tide predictions for the next 48 hours
 */
export async function fetchTidePredictions(
	station: string = TIDE_STATIONS.pointReyes
): Promise<TidePrediction[]> {
	try {
		const now = new Date();
		const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);

		const beginDate = formatDate(now);
		const endDate = formatDate(end);

		const params = new URLSearchParams({
			begin_date: beginDate,
			end_date: endDate,
			station,
			product: 'predictions',
			datum: 'MLLW',
			units: 'english',
			time_zone: 'lst_ldt',
			interval: 'hilo',
			format: 'json',
			application: 'MarinMonitor'
		});

		const url = `${NOAA_BASE}?${params}`;
		logger.log('NOAA', `Fetching tides: ${url}`);

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`NOAA tides failed: ${response.status}`);
		}

		const data = await response.json();
		const predictions: NoaaTidePrediction[] = data.predictions || [];

		return predictions.map((p) => ({
			time: p.t,
			height: parseFloat(p.v),
			type: (p.type === 'H' ? 'H' : 'L') as 'H' | 'L'
		}));
	} catch (error) {
		logger.warn('NOAA', `Tide fetch failed: ${(error as Error).message}`);
		return [];
	}
}

/**
 * Fetch hourly tide heights for chart display (next 24 hours)
 */
export async function fetchHourlyTides(
	station: string = TIDE_STATIONS.pointReyes
): Promise<{ time: string; height: number }[]> {
	try {
		const now = new Date();
		const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		const params = new URLSearchParams({
			begin_date: formatDate(now),
			end_date: formatDate(end),
			station,
			product: 'predictions',
			datum: 'MLLW',
			units: 'english',
			time_zone: 'lst_ldt',
			interval: '60',
			format: 'json',
			application: 'MarinMonitor'
		});

		const url = `${NOAA_BASE}?${params}`;
		logger.log('NOAA', `Fetching hourly tides: ${url}`);

		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`NOAA hourly tides failed: ${response.status}`);
		}

		const data = await response.json();
		const predictions: NoaaTidePrediction[] = data.predictions || [];

		return predictions.map((p) => ({
			time: p.t,
			height: parseFloat(p.v)
		}));
	} catch (error) {
		logger.warn('NOAA', `Hourly tide fetch failed: ${(error as Error).message}`);
		return [];
	}
}

function formatDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	const h = String(d.getHours()).padStart(2, '0');
	const min = String(d.getMinutes()).padStart(2, '0');
	return `${y}${m}${day} ${h}:${min}`;
}
