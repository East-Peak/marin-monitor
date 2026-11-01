/**
 * CHARTREAD1: reading a chart by pointing at it. Every series handed to a chart is a list of
 * readings at their own times; the readout snaps to one and says what kind of number it is. It
 * never interpolates, and a silence is said, not hidden. Pure: ChartReadout.svelte is its view.
 */
import { PACIFIC, formatAsOf, pacificDate } from './pacific-time';

export type ReadingKind = 'observed' | 'forecast' | 'prediction' | 'reference';

/** One slot of a series. A null value is a slot with no reading, kept where it falls. */
export interface Reading {
	at: number;
	value: number | null;
	kind: ReadingKind;
	unit: string;
}

/** What the label says: the figure on TEXT1's value role, the rest on meta. */
export interface ReadoutWords {
	lead: string;
	figure: string;
	tail: string;
}

export const wordsText = ({ lead, figure, tail }: ReadoutWords) =>
	[`${lead}${lead ? ' ' : ''}${figure}`, tail].filter(Boolean).join(' · ');

/** One place the readout can stop. `from`/`to` make it a silence, which nothing snaps out of. */
export interface ReadoutStop {
	at: number;
	/** The dot's height as a fraction of the chart (0 top); null draws no dot. */
	y: number | null;
	words: ReadoutWords;
	/** Fuller words for a screen reader, when the drawing shows more than the label says. */
	spoken?: string;
	from?: number;
	to?: number;
}

type Located = Pick<ReadoutStop, 'at' | 'from' | 'to'>;
const isGap = (s: Located) => s.from !== undefined && s.to !== undefined;

/**
 * The stop to read at `t`. Inside a silence, the silence; otherwise the nearest stop, the earlier
 * on a tie. Order doesn't matter, and nothing is made up between two stops.
 */
export function nearestPoint<T extends Located>(stops: readonly T[], t: number): T | null {
	const gap = stops.find((s) => isGap(s) && t > s.from! && t < s.to!);
	if (gap) return gap;
	let best: T | null = null;
	for (const s of stops) {
		if (isGap(s)) continue;
		const d = Math.abs(s.at - t);
		const b = best ? Math.abs(best.at - t) : Infinity;
		if (d < b || (d === b && best !== null && s.at < best.at)) best = s;
	}
	return best;
}

export interface Silence {
	/** Null: the silence runs from the domain's start, before the first reading. */
	from: number | null;
	/** Null: the silence runs to the domain's end, after the last reading. */
	to: number | null;
	/** Where it starts and ends on the chart. */
	start: number;
	end: number;
}

/** Stretches longer than `gapMs` with no reading, the two ends of the domain included. */
export function silences(
	times: readonly number[],
	gapMs: number,
	domain?: readonly [number, number]
): Silence[] {
	const at = [...times].sort((a, b) => a - b);
	if (at.length === 0) return [];
	const out: Silence[] = [];
	if (domain && at[0] - domain[0] > gapMs)
		out.push({ from: null, to: at[0], start: domain[0], end: at[0] });
	at.forEach((t, i) => {
		const next = at[i + 1];
		if (next !== undefined && next - t > gapMs)
			out.push({ from: t, to: next, start: t, end: next });
	});
	const last = at[at.length - 1];
	if (domain && domain[1] - last > gapMs)
		out.push({ from: last, to: null, start: last, end: domain[1] });
	return out;
}

/** "4 PM", "2:15 PM": a time on its own, in Pacific. */
export const clockTime = (ms: number) => formatAsOf(ms, ms).replace(':00', '');

const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, weekday: 'short' });

/** A time with its weekday when it isn't today's, or always on a chart spanning several days. */
export function stamp(ms: number, now: number, always = false): string {
	const day = always || pacificDate(ms) !== pacificDate(now) ? `${WEEKDAY.format(ms)} ` : '';
	return `${day}${clockTime(ms)}`;
}

/** "9:55–11:15 AM": the first end drops its AM or PM when both ends share it. */
export function timeSpan(a: string, b: string): string {
	const shared = / [AP]M$/.exec(a)?.[0];
	return shared && b.endsWith(shared) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

const LEAD: Record<ReadingKind, string> = {
	observed: '',
	forecast: 'forecast',
	prediction: 'predicted',
	reference: ''
};

export interface WordOptions {
	/** The figure's own form: "$5.89", "6.3 ft". Defaults to the value with its unit. */
	format?: (value: number) => string;
	/** The time as this chart writes it. */
	when: string;
	/** Named facts after the time ("high", "Gnoss Field", "recomputed"). */
	notes?: readonly string[];
	/** The series is out of date, so the readout says so. */
	stale?: boolean;
}

/** "58° · 2:15 PM", "predicted 6.3 ft · 10:19 AM", "No reading · 3 PM". */
export function readingWords(r: Reading, opts: WordOptions): ReadoutWords {
	const tail = [opts.when, ...(opts.notes ?? [])];
	if (opts.stale) tail.push('stale');
	if (r.value === null) return { lead: '', figure: 'No reading', tail: tail.join(' · ') };
	if (r.kind === 'reference') tail.push('reference');
	const format = opts.format ?? ((v: number) => `${v}${r.unit}`);
	return { lead: LEAD[r.kind], figure: format(r.value), tail: tail.join(' · ') };
}

/** A band's reading: the average with its low–high range, or only the average without both. */
export function rangeWords(
	avg: string,
	low: string | null,
	high: string | null,
	when: string,
	stale = false
): ReadoutWords {
	const tail = [
		low !== null && high !== null ? `${low}–${high}` : null,
		when,
		stale ? 'stale' : null
	]
		.filter(Boolean)
		.join(' · ');
	return { lead: '', figure: `${avg} average`, tail };
}

/** A silence in words; `when` writes each end as the chart writes its times. */
export function gapWords(
	gap: Pick<Silence, 'from' | 'to'>,
	when: (ms: number) => string
): ReadoutWords {
	const { from, to } = gap;
	const tail =
		from !== null && to !== null
			? timeSpan(when(from), when(to))
			: to !== null
				? `before ${when(to)}`
				: from !== null
					? `since ${when(from)}`
					: '';
	return { lead: '', figure: `No readings${tail && ' '}${tail}`, tail: '' };
}

/** A silence as a stop: no dot, and in the middle of what it spans. */
export function gapStop(gap: Silence, when: (ms: number) => string): ReadoutStop {
	return {
		at: (gap.start + gap.end) / 2,
		y: null,
		from: gap.start,
		to: gap.end,
		words: gapWords(gap, when)
	};
}

/** The drawing's horizontal scale, in the units of its viewBox. */
export interface PlotScale {
	domain: readonly [number, number];
	/** The plot's left and right edges within the viewBox. */
	left: number;
	right: number;
	/** The viewBox's whole width. */
	width: number;
}

/** A time's position on the chart, in rendered pixels, whatever it's scaled to. */
export function pixelAtTime(t: number, plot: PlotScale, rendered: number): number {
	const { domain, left, right, width } = plot;
	const span = domain[1] - domain[0];
	const x = left + (span === 0 ? 0 : ((t - domain[0]) / span) * (right - left));
	return (x / width) * rendered;
}

/** The time under a rendered pixel, the inverse of pixelAtTime. */
export function timeAtPixel(px: number, plot: PlotScale, rendered: number): number {
	const { domain, left, right, width } = plot;
	return domain[0] + (((px / rendered) * width - left) / (right - left)) * (domain[1] - domain[0]);
}
