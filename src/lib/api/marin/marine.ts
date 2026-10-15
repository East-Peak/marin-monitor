import { logger } from '$lib/config/api';
import { fetchWithTimeout, type OwnerOptions } from './fetch-helpers';

const MARINE_BASE = 'https://marine-api.open-meteo.com/v1/marine';
const POINT_REYES = { lat: 37.996, lon: -122.976 };

export interface MarineSnapshot {
	time: string;
	waveHeight: number | null;
	swellHeight: number | null;
	swellPeriod: number | null;
	swellDirection: number | null;
	next12hMaxSwell: number | null;
	next12hPeakDirection: number | null;
}

export interface MarineOutlookDay {
	date: string;
	swellHeightMax: number | null;
	swellPeriodMax: number | null;
	swellDirectionDominant: number | null;
	waveHeightMax: number | null;
}

export interface MarineHourlyPoint {
	time: string;
	waveHeight: number | null;
	swellHeight: number | null;
	swellPeriod: number | null;
	swellDirection: number | null;
}

interface MarineApiResponse {
	hourly?: {
		time?: string[];
		wave_height?: number[];
		swell_wave_height?: number[];
		swell_wave_period?: number[];
		swell_wave_direction?: number[];
	};
	daily?: {
		time?: string[];
		wave_height_max?: number[];
		swell_wave_height_max?: number[];
		swell_wave_period_max?: number[];
		swell_wave_direction_dominant?: number[];
	};
}

export async function fetchMarineSnapshot(): Promise<MarineSnapshot | null> {
	try {
		const params = new URLSearchParams({
			latitude: String(POINT_REYES.lat),
			longitude: String(POINT_REYES.lon),
			hourly: 'wave_height,swell_wave_height,swell_wave_period,swell_wave_direction',
			timezone: 'America/Los_Angeles',
			forecast_days: '2'
		});

		const url = `${MARINE_BASE}?${params}`;
		logger.log('MARINE', `Fetching marine forecast: ${url}`);
		const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
		if (!response.ok) throw new Error(`Marine API failed: ${response.status}`);

		const data = (await response.json()) as MarineApiResponse;
		const times = data.hourly?.time || [];
		if (times.length === 0) return null;

		const now = Date.now();
		let idx = 0;
		let best = Number.POSITIVE_INFINITY;
		for (let i = 0; i < times.length; i++) {
			const diff = Math.abs(new Date(times[i]).getTime() - now);
			if (diff < best) {
				best = diff;
				idx = i;
			}
		}

		return {
			time: times[idx],
			waveHeight: data.hourly?.wave_height?.[idx] ?? null,
			swellHeight: data.hourly?.swell_wave_height?.[idx] ?? null,
			swellPeriod: data.hourly?.swell_wave_period?.[idx] ?? null,
			swellDirection: data.hourly?.swell_wave_direction?.[idx] ?? null,
			next12hMaxSwell: (() => {
				const values = (data.hourly?.swell_wave_height || [])
					.slice(idx, idx + 12)
					.filter(Number.isFinite);
				return values.length > 0 ? Math.max(...values) : null;
			})(),
			next12hPeakDirection: (() => {
				const heights = data.hourly?.swell_wave_height || [];
				const dirs = data.hourly?.swell_wave_direction || [];
				let bestIdx = -1;
				let bestHeight = -1;
				for (let i = idx; i < Math.min(idx + 12, heights.length); i++) {
					const h = heights[i];
					if (typeof h === 'number' && h > bestHeight) {
						bestHeight = h;
						bestIdx = i;
					}
				}
				return bestIdx >= 0 ? (dirs[bestIdx] ?? null) : null;
			})()
		};
	} catch (error) {
		logger.warn('MARINE', `Marine fetch failed: ${(error as Error).message}`);
		return null;
	}
}

export async function fetchMarineOutlook(days: number = 5): Promise<MarineOutlookDay[]> {
	try {
		const params = new URLSearchParams({
			latitude: String(POINT_REYES.lat),
			longitude: String(POINT_REYES.lon),
			daily:
				'wave_height_max,swell_wave_height_max,swell_wave_period_max,swell_wave_direction_dominant',
			timezone: 'America/Los_Angeles',
			forecast_days: String(days)
		});

		const url = `${MARINE_BASE}?${params}`;
		logger.log('MARINE', `Fetching marine outlook: ${url}`);
		const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
		if (!response.ok) throw new Error(`Marine outlook failed: ${response.status}`);

		const data = (await response.json()) as MarineApiResponse;
		const times = data.daily?.time || [];
		return times.map((date, index) => ({
			date,
			waveHeightMax: data.daily?.wave_height_max?.[index] ?? null,
			swellHeightMax: data.daily?.swell_wave_height_max?.[index] ?? null,
			swellPeriodMax: data.daily?.swell_wave_period_max?.[index] ?? null,
			swellDirectionDominant: data.daily?.swell_wave_direction_dominant?.[index] ?? null
		}));
	} catch (error) {
		logger.warn('MARINE', `Marine outlook fetch failed: ${(error as Error).message}`);
		return [];
	}
}

export async function fetchMarineHourly(hours: number = 12): Promise<MarineHourlyPoint[]> {
	try {
		const forecastDays = Math.max(2, Math.ceil(hours / 24) + 1);
		const params = new URLSearchParams({
			latitude: String(POINT_REYES.lat),
			longitude: String(POINT_REYES.lon),
			hourly: 'wave_height,swell_wave_height,swell_wave_period,swell_wave_direction',
			timezone: 'America/Los_Angeles',
			forecast_days: String(forecastDays)
		});

		const url = `${MARINE_BASE}?${params}`;
		logger.log('MARINE', `Fetching marine hourly: ${url}`);
		const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
		if (!response.ok) throw new Error(`Marine hourly failed: ${response.status}`);

		const data = (await response.json()) as MarineApiResponse;
		const times = data.hourly?.time || [];
		if (times.length === 0) return [];

		const now = Date.now();
		let startIndex = 0;
		let best = Number.POSITIVE_INFINITY;
		for (let i = 0; i < times.length; i++) {
			const diff = Math.abs(new Date(times[i]).getTime() - now);
			if (diff < best) {
				best = diff;
				startIndex = i;
			}
		}

		return times.slice(startIndex, startIndex + hours).map((time, index) => {
			const sourceIndex = startIndex + index;
			return {
				time,
				waveHeight: data.hourly?.wave_height?.[sourceIndex] ?? null,
				swellHeight: data.hourly?.swell_wave_height?.[sourceIndex] ?? null,
				swellPeriod: data.hourly?.swell_wave_period?.[sourceIndex] ?? null,
				swellDirection: data.hourly?.swell_wave_direction?.[sourceIndex] ?? null
			};
		});
	} catch (error) {
		logger.warn('MARINE', `Marine hourly fetch failed: ${(error as Error).message}`);
		return [];
	}
}

/** One forecast hour at Point Reyes, in feet and seconds; a missing value stays null. */
export interface MarinePoint {
	atMs: number;
	waveFt: number | null;
	periodS: number | null;
	directionDeg: number | null;
}

/** An Open-Meteo marine forecast (a model, not a buoy), stamped with the time it was checked. */
export interface MarineForecastRead {
	points: MarinePoint[];
	checkedAt: number;
}

const finiteOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * v2 surf: wave height and period from the current hour on, or a throw.
 * Unix times in feet, so no zone or unit is guessed (the legacy readers above are unchanged).
 */
export async function readMarineForecastOrThrow({
	signal,
	now = Date.now
}: OwnerOptions & { now?: () => number } = {}): Promise<MarineForecastRead> {
	const params = new URLSearchParams({
		latitude: String(POINT_REYES.lat),
		longitude: String(POINT_REYES.lon),
		hourly: 'wave_height,wave_period,wave_direction',
		length_unit: 'imperial',
		timeformat: 'unixtime',
		forecast_days: '3'
	});
	const response = await fetchWithTimeout(`${MARINE_BASE}?${params}`, {
		headers: { Accept: 'application/json' },
		signal
	});
	if (!response.ok) throw new Error(`Marine forecast failed: ${response.status}`);
	const hourly = ((await response.json()) as { hourly?: Record<string, unknown[]> }).hourly;
	const times = hourly?.time;
	if (!Array.isArray(times) || times.length === 0) throw new Error('Marine forecast has no hours');
	const checkedAt = now();
	const points = times.flatMap((t, i) => {
		const atMs = finiteOrNull(t) === null ? null : (t as number) * 1000;
		if (atMs === null || atMs + 3_600_000 <= checkedAt) return [];
		return [
			{
				atMs,
				waveFt: finiteOrNull(hourly?.wave_height?.[i]),
				periodS: finiteOrNull(hourly?.wave_period?.[i]),
				directionDeg: finiteOrNull(hourly?.wave_direction?.[i])
			}
		];
	});
	return { points, checkedAt };
}
