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
import { serviceClient } from '$lib/services/client';
import type { OwnerOptions } from './fetch-helpers';
import { pacificDate, parsePacificWallTime } from '$lib/dashboard/pacific-time';
import type { TideEvent } from '$lib/weather/brief';

interface NoaaTidePrediction {
	t: string; // time "YYYY-MM-DD HH:MM"
	v: string; // height in feet
	type?: string; // "H" or "L" for hi/lo predictions
}

interface NoaaTideResponse {
	predictions: NoaaTidePrediction[];
}

/** Round date down to the nearest hour for stable cache keys */
function stableHour(d: Date): Date {
	const rounded = new Date(d);
	rounded.setMinutes(0, 0, 0);
	return rounded;
}

/**
 * Fetch high/low tide predictions for the next 48 hours
 */
export async function fetchTidePredictions(
	station: string = TIDE_STATIONS.pointReyes,
	{ signal }: OwnerOptions = {}
): Promise<TidePrediction[]> {
	try {
		const now = stableHour(new Date());
		const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);

		logger.log('NOAA', `Fetching tides for station ${station}`);

		const result = await serviceClient.request<NoaaTideResponse>('NOAA_TIDES', '', {
			params: {
				begin_date: formatDate(now),
				end_date: formatDate(end),
				station,
				product: 'predictions',
				datum: 'MLLW',
				units: 'english',
				time_zone: 'lst_ldt',
				interval: 'hilo',
				format: 'json',
				application: 'MarinMonitor'
			},
			signal
		});
		const predictions: NoaaTidePrediction[] = result.data.predictions || [];

		return predictions.map((p) => ({
			time: p.t,
			height: parseFloat(p.v),
			type: (p.type === 'H' ? 'H' : 'L') as 'H' | 'L'
		}));
	} catch (error) {
		// An owner abort (destroyed dashboard or panel) is not an upstream failure.
		if (!signal?.aborted) logger.warn('NOAA', `Tide fetch failed: ${(error as Error).message}`);
		return [];
	}
}

/**
 * Fetch hourly tide heights for chart display (next 24 hours)
 */
export async function fetchHourlyTides(
	station: string = TIDE_STATIONS.pointReyes,
	{ signal }: OwnerOptions = {}
): Promise<{ time: string; height: number }[]> {
	try {
		const now = stableHour(new Date());
		const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		logger.log('NOAA', `Fetching hourly tides for station ${station}`);

		const result = await serviceClient.request<NoaaTideResponse>('NOAA_TIDES', '', {
			params: {
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
			},
			signal
		});
		const predictions: NoaaTidePrediction[] = result.data.predictions || [];

		return predictions.map((p) => ({
			time: p.t,
			height: parseFloat(p.v)
		}));
	} catch (error) {
		// An owner abort (destroyed dashboard or panel) is not an upstream failure.
		if (!signal?.aborted)
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

/**
 * v2 brief: hi/lo predictions for 48 h from the station's local midnight,
 * with times read as Pacific wall time (DST-checked). Throws on failure.
 * (The legacy functions above build begin_date from the browser's zone.)
 */
export async function fetchTideEventsOrThrow(
	station: string,
	{ signal }: OwnerOptions = {}
): Promise<TideEvent[]> {
	const result = await serviceClient.request<{ predictions?: NoaaTidePrediction[] }>(
		'NOAA_TIDES',
		'',
		{
			signal,
			revalidateInBackground: false,
			params: {
				begin_date: pacificDate(Date.now()).replace(/-/g, ''),
				range: 48,
				station,
				product: 'predictions',
				datum: 'MLLW',
				units: 'english',
				time_zone: 'lst_ldt',
				interval: 'hilo',
				format: 'json',
				application: 'MarinMonitor'
			}
		}
	);
	const predictions = result.data?.predictions;
	if (!Array.isArray(predictions)) throw new Error('NOAA returned no predictions');
	return predictions.flatMap((p) => {
		const atMs = parsePacificWallTime(p.t);
		const heightFt = Number.parseFloat(p.v);
		if (atMs === null || !Number.isFinite(heightFt) || (p.type !== 'H' && p.type !== 'L'))
			return [];
		return [{ atMs, heightFt, type: p.type }];
	});
}
