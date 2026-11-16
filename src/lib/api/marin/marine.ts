import { fetchWithTimeout, type OwnerOptions } from './fetch-helpers';

const MARINE_BASE = 'https://marine-api.open-meteo.com/v1/marine';
const POINT_REYES = { lat: 37.996, lon: -122.976 };

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
 * Unix times in feet, so no zone or unit is guessed.
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
