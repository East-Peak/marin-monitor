/**
 * Answers for the v2 morning brief (spec §2.3, §13.9). Values carry their
 * provenance and are derived against the clock at render time, so midnight
 * and the next tide need no refetch. Unknown stays unknown, never 0.
 */
import { pacificMidnightAfter } from '$lib/dashboard/pacific-time';

/** One QC'd ASOS station for all of Marin; the label names it (Decision 7). */
export const OBSERVATION_STATION = { id: 'KDVO', name: 'Gnoss Field (Novato)' } as const;
export const OBSERVATION_MAX_AGE_MS = 90 * 60_000;
export const FORECAST_MAX_AGE_MS = 6 * 3_600_000;

export interface HourlyPop {
	startMs: number;
	endMs: number;
	/** Probability of precipitation in percent; null = NWS gave none. */
	pop: number | null;
}

export interface HourlyForecast {
	/** The forecast's own update time (NWS `updateTime`); null if absent. */
	updatedAt: number | null;
	periods: HourlyPop[];
}

export interface RainChance {
	maxPct: number;
	hours: number;
}

export function restOfTodayRainChance(
	periods: readonly HourlyPop[],
	now: number
): RainChance | null {
	const end = pacificMidnightAfter(now);
	const window = periods
		.filter((p) => p.endMs > now && p.startMs < end)
		.sort((a, b) => a.startMs - b.startMs);
	if (window.length === 0 || window[0].startMs > now || window[window.length - 1].endMs < end)
		return null;
	let maxPct = 0;
	for (let i = 0; i < window.length; i++) {
		if (i > 0 && window[i].startMs > window[i - 1].endMs) return null;
		const pop = window[i].pop;
		if (pop === null) return null;
		maxPct = Math.max(maxPct, pop);
	}
	return { maxPct, hours: window.length };
}

export interface ObservedNow {
	stationName: string;
	observedAt: number;
	/** Newest report the selection considered; provenance for the store's guard (Decision 7). */
	listNewestAt: number;
	/** Null when NWS has no value or its QC rejected it. */
	tempF: number | null;
	text: string | null;
}

/** A report stamped further ahead of our clock than this is not believed (as `effectiveState`). */
const FUTURE_SKEW_MS = 5 * 60_000;

/** One report from a station's observation list. */
export interface StationReading {
	observedAt: number;
	/** Null when the report has no usable temperature. */
	tempF: number | null;
	text: string | null;
}

/**
 * The report the card shows: the newest with a temperature within
 * OBSERVATION_MAX_AGE_MS, else the newest as it is (unknown, or old and so
 * shown out of date). One report supplies every field. `listNewestAt` is the
 * newest report considered, so the store can recognise a stale copy of the list.
 */
export function chooseObservation(
	readings: readonly StationReading[],
	now: number
): { reading: StationReading; listNewestAt: number } | null {
	const candidates = readings
		.filter((r) => Number.isFinite(r.observedAt) && r.observedAt <= now + FUTURE_SKEW_MS)
		.sort((a, b) => b.observedAt - a.observedAt);
	if (candidates.length === 0) return null;
	const usable = candidates.find(
		(r) => r.tempF !== null && now - r.observedAt <= OBSERVATION_MAX_AGE_MS
	);
	return { reading: usable ?? candidates[0], listNewestAt: candidates[0].observedAt };
}

export function celsiusToFahrenheit(c: number): number {
	return Math.round((c * 9) / 5 + 32);
}

export interface TideEvent {
	atMs: number;
	heightFt: number;
	type: 'H' | 'L';
}

export function nextTide(events: readonly TideEvent[], now: number): TideEvent | null {
	return [...events].sort((a, b) => a.atMs - b.atMs).find((e) => e.atMs > now) ?? null;
}

export function forecastScope(preset: { name: string }): string {
	return `${preset.name} forecast`;
}
