/**
 * The desktop brief's charts (MAPX1): the station's hour columns and today's tide. Every point
 * is a reported or predicted value; an hour or report we don't have stays a gap, and no curve
 * is drawn by us.
 */
import type { TideHeight } from '$lib/api/marin/tides';
import type { TideEvent } from '$lib/weather/brief';
import type { BriefCard, BriefState } from './brief-store';
import { hourColumns, type HourColumn } from './hour-columns';
import { pacificDate, pacificMidnightAfter, parsePacificWallTime } from './pacific-time';
import { effectiveState } from './source-status';

/** The tile: 4 past hours, now, 8 ahead. Outdoors shows 24 ahead. */
export const TILE_HOURS_AHEAD = 8;
/** NOAA's hourly series: anything wider than an hour (plus slack) is a missing hour. */
const TIDE_GAP_MS = 90 * 60_000;

/** A card's series is out of date: its readings say so. */
function isStale(card: BriefCard<unknown>, now: number): boolean {
	const { state, observedAt, maxAgeMs, detail } = card;
	const entry = { id: '', name: '', state, observedAt, maxAgeMs, detail };
	return effectiveState(entry, now) === 'stale';
}

/**
 * The hour columns of charts 1 and 4, one implementation: the station's reports, plus the
 * headline's own report so Now can equal it, and the forecast at the station's grid point. The
 * town's forecast is never read here, so a failed read stays failed.
 */
export function stationColumns(brief: BriefState, now: number, ahead: number): HourColumn[] {
	const { history, stationForecast, observed } = brief;
	const report = observed.value;
	const headline =
		report && report.tempF !== null ? { atMs: report.observedAt, tempF: report.tempF } : null;
	const others = history.value?.filter((r) => r.atMs !== headline?.atMs);
	return hourColumns({
		reports: others && headline ? [...others, headline] : (others ?? null),
		headline,
		periods: stationForecast.value?.periods ?? null,
		now,
		ahead,
		staleReports: isStale(history, now),
		staleForecast: isStale(stationForecast, now),
		staleHeadline: isStale(observed, now)
	});
}

/** Moves with a new read or a town switch, never the clock: a pinned readout clears on it. */
export const stationKey = ({ history, stationForecast, observed, forecast }: BriefState) =>
	[history.observedAt, stationForecast.observedAt, observed.observedAt, forecast.scope].join('|');

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
