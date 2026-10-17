/**
 * The desktop brief's charts (MAPX1): an hourly strip, the station's last 12
 * hours, and today's tide. Every point is a reported or predicted value; an
 * hour or report we don't have stays a gap, and no curve is drawn by us.
 */
import type { TempReport } from '$lib/api/marin/nws-observation';
import type { TideHeight } from '$lib/api/marin/tides';
import type { HourlyPop, TideEvent } from '$lib/weather/brief';
import { pacificDate, pacificMidnightAfter, parsePacificWallTime } from './pacific-time';

const H = 3_600_000;
export const HOURLY_STRIP_HOURS = 8;
const TRACE_MS = 12 * H;
/** NOAA's hourly series: anything wider than an hour (plus slack) is a missing hour. */
const TIDE_GAP_MS = 90 * 60_000;
/** KDVO reports every 20 minutes; a silence longer than this is shown as a break. */
const TRACE_GAP_MS = H;

export interface StripHour {
	atMs: number;
	f: number | null;
	pop: number | null;
}

/** Clock hours from the current one; an hour without a period, or a value NWS omitted, is null. */
export function hourlyStrip(periods: readonly HourlyPop[], now: number): StripHour[] {
	if (periods.length === 0) return [];
	const byStart = new Map(periods.map((p) => [p.startMs, p]));
	const start = Math.floor(now / H) * H;
	return Array.from({ length: HOURLY_STRIP_HOURS }, (_, i) => {
		const atMs = start + i * H;
		const p = byStart.get(atMs);
		const whole = p && p.endMs === atMs + H ? p : null;
		return { atMs, f: whole?.temperatureF ?? null, pop: whole?.pop ?? null };
	});
}

export interface TempTrace {
	domain: [number, number];
	/** `value` NaN marks a break: the chart draws no line across a missing stretch. */
	points: { x: number; value: number }[];
	high: { f: number; atMs: number };
	low: { f: number; atMs: number };
}

export function tempTrace(reports: readonly TempReport[], now: number): TempTrace | null {
	const from = now - TRACE_MS;
	const shown = reports
		.filter((r) => r.atMs >= from && r.atMs <= now)
		.sort((a, b) => a.atMs - b.atMs);
	if (shown.length < 2) return null;
	const points: TempTrace['points'] = [];
	let high = { f: shown[0].tempF, atMs: shown[0].atMs };
	let low = high;
	shown.forEach((r, i) => {
		if (i > 0 && r.atMs - shown[i - 1].atMs > TRACE_GAP_MS)
			points.push({ x: (r.atMs + shown[i - 1].atMs) / 2, value: Number.NaN });
		points.push({ x: r.atMs, value: r.tempF });
		if (r.tempF > high.f) high = { f: r.tempF, atMs: r.atMs };
		if (r.tempF < low.f) low = { f: r.tempF, atMs: r.atMs };
	});
	return { domain: [from, now], points, high, low };
}

export interface TideDay {
	domain: [number, number];
	/** NOAA's hourly heights and today's hi/lo predictions, in time order; ft NaN is a break. */
	points: { atMs: number; ft: number }[];
	events: TideEvent[];
}

/** Today's Pacific day of predictions, or null when NOAA gave no hourly heights for it. */
export function tideDay(
	heights: readonly TideHeight[],
	events: readonly TideEvent[],
	now: number
): TideDay | null {
	const start = parsePacificWallTime(`${pacificDate(now)}T00:00`) as number;
	const end = pacificMidnightAfter(now);
	const inDay = (atMs: number) => atMs >= start && atMs <= end;
	const hourly = heights
		.filter((h) => inDay(h.atMs))
		.map((h) => ({ atMs: h.atMs, ft: h.heightFt }));
	if (hourly.length < 2) return null;
	const todays = events.filter((e) => inDay(e.atMs)).sort((a, b) => a.atMs - b.atMs);
	const eventTimes = new Set(todays.map((e) => e.atMs));
	const merged = [
		...hourly.filter((p) => !eventTimes.has(p.atMs)),
		...todays.map((e) => ({ atMs: e.atMs, ft: e.heightFt }))
	].sort((a, b) => a.atMs - b.atMs);
	// An hour NOAA didn't give is a break (ft NaN), never a bridge across it.
	const points: TideDay['points'] = [];
	merged.forEach((p, i) => {
		const prev = merged[i - 1];
		if (prev && p.atMs - prev.atMs > TIDE_GAP_MS)
			points.push({ atMs: (p.atMs + prev.atMs) / 2, ft: Number.NaN });
		points.push(p);
	});
	return { domain: [start, end], points, events: todays };
}
