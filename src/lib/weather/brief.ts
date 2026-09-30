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
	/** Null when NWS has no value or its QC rejected it. */
	tempF: number | null;
	text: string | null;
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
