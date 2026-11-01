/**
 * Where each chart's readout can stop (CHARTREAD1): pure, from the same values the chart draws.
 * `y` is the caller's: a value's height as a fraction of its chart, 0 at the top.
 */
import {
	gapStop,
	nearestPoint,
	readingWords,
	silences,
	stamp,
	type Reading,
	type ReadoutStop
} from './chart-readout';
import type { TideEvent } from '$lib/weather/brief';

const H = 3_600_000;
const feet = (v: number) => `${v.toFixed(1)} ft`;
const eventName = (e: TideEvent) => (e.type === 'H' ? 'high' : 'low');
const prediction = (at: number, value: number): Reading => ({
	at,
	value,
	kind: 'prediction',
	unit: ' ft'
});

/** The stop nearest now, for the keys to start from. */
export function startAt(stops: readonly { at: number }[], now: number): number | undefined {
	const near = nearestPoint(stops, now);
	return near ? stops.indexOf(near) : undefined;
}

export interface SeriesOptions {
	y: (value: number) => number;
	when: (ms: number) => string;
	format?: (value: number) => string;
	notes?: readonly string[];
	stale?: boolean;
	/** The chart's gap rule: a longer stretch without a reading is said, not hidden. */
	gapMs?: number;
	domain?: readonly [number, number];
}

/** Any series: a stop per slot, null slots kept, with each silence past the chart's gap rule. */
export function seriesStops(series: readonly Reading[], opts: SeriesOptions): ReadoutStop[] {
	const { y, when, format, notes, stale, gapMs, domain } = opts;
	const points = series.map((r) => ({
		at: r.at,
		y: r.value === null ? null : y(r.value),
		words: readingWords(r, { format, when: when(r.at), notes, stale })
	}));
	const gaps =
		gapMs === undefined
			? []
			: silences(
					series.map((r) => r.at),
					gapMs,
					domain
				).map((g) => gapStop(g, when));
	return [...points, ...gaps].sort((a, b) => a.at - b.at);
}

/** Chart 7: NOAA's high and low events only. The curve between them is ours and is never read. */
export function eventStops(
	events: readonly TideEvent[],
	y: (ft: number) => number,
	now: number,
	stale = false
): ReadoutStop[] {
	return [...events]
		.sort((a, b) => a.atMs - b.atMs)
		.map((e) => ({
			at: e.atMs,
			y: y(e.heightFt),
			words: readingWords(prediction(e.atMs, e.heightFt), {
				format: (v) => `${eventName(e)} ${feet(v)}`,
				when: stamp(e.atMs, now, true),
				stale
			})
		}));
}

/** Chart 2: NOAA's hourly heights, an event named where it falls; ft NaN is a break in them. */
export function heightStops(
	points: readonly { atMs: number; ft: number }[],
	events: readonly TideEvent[],
	y: (ft: number) => number,
	now: number,
	stale: { hourly: boolean; events: boolean } = { hourly: false, events: false }
): ReadoutStop[] {
	const byTime = new Map(events.map((e) => [e.atMs, e]));
	const when = (ms: number) => stamp(ms, now);
	const stops: ReadoutStop[] = [];
	points.forEach((p, i) => {
		if (!Number.isFinite(p.ft)) {
			const from = points[i - 1].atMs;
			const to = points[i + 1].atMs;
			stops.push(gapStop({ from, to, start: from, end: to }, when));
			return;
		}
		const event = byTime.get(p.atMs);
		stops.push({
			at: p.atMs,
			y: y(p.ft),
			words: readingWords(prediction(p.atMs, p.ft), {
				format: (v) => {
					const size = Number.isInteger(v) ? `${v} ft` : feet(v);
					return event ? `${eventName(event)} ${size}` : size;
				},
				when: when(p.atMs),
				stale: event ? stale.events : stale.hourly
			})
		});
	});
	return stops;
}

/** Chart 5: a stop per hour's bar, at its middle. */
export function rainStops(
	bars: readonly (number | null)[],
	hours: readonly number[],
	y: (pct: number) => number,
	now: number,
	stale = false
): ReadoutStop[] {
	return bars.map((value, i) => ({
		at: hours[i] + H / 2,
		y: value === null ? null : y(value),
		words: readingWords(
			{ at: hours[i], value, kind: 'forecast', unit: '%' },
			{ format: (v) => `${v}% chance`, when: stamp(hours[i], now), stale }
		)
	}));
}

/** Chart 6: a stop per day's column; its position is the column, as the columns are equal. */
export function dayStops(
	days: readonly { name: string; hi: number; lo: number }[],
	stale = false
): ReadoutStop[] {
	return days.map((d, i) => ({
		at: i + 0.5,
		y: null,
		words: {
			lead: 'forecast',
			figure: `${d.hi}° high`,
			tail: [`${d.lo}° low`, d.name, stale ? 'stale' : null].filter(Boolean).join(' · ')
		}
	}));
}
