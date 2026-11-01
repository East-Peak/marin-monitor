/**
 * Weather tile C (Stuart, 2026-11-01): one grid of hour columns, the past hours observed at the
 * station, now, then the forecast at the same grid point. A column's number and the line can't
 * disagree, and each column's readout gives the report's own time. There are no marks between
 * columns: a silence shows only where a column has no reading.
 */
import {
	clockTime,
	gapWords,
	readingWords,
	stamp,
	wordsText,
	type ReadingKind,
	type ReadoutWords
} from './chart-readout';
import type { TempReport } from '$lib/api/marin/nws-observation';
import type { HourlyPop } from '$lib/weather/brief';

const H = 3_600_000;
const SNAP_MS = 30 * 60_000;
const PAST_HOURS = 4;
const PLACE = 'Gnoss Field';

export interface HourColumn {
	/** The column's clock hour. */
	at: number;
	f: number | null;
	pop: number | null;
	kind: Extract<ReadingKind, 'observed' | 'forecast'>;
	isNow: boolean;
	/** The report it shows, when it shows one. */
	reportAt: number | null;
	words: ReadoutWords;
	/** The same, with the rain chance the column shows, for a screen reader. */
	spoken?: string;
	/** The column's hour, when it has no reading to stop on. */
	from?: number;
	to?: number;
}

export interface HourColumnsInput {
	/** Null: the station's reports couldn't be read, which isn't a silence at the station. */
	reports: readonly TempReport[] | null;
	/** The headline's own report: Now equals it whenever it's recent enough to be Now. */
	headline?: TempReport | null;
	/** Null: the forecast couldn't be read. Nothing stands in for it. */
	periods: readonly HourlyPop[] | null;
	now: number;
	/** Forecast hours after now. */
	ahead: number;
	staleReports?: boolean;
	staleForecast?: boolean;
	staleHeadline?: boolean;
}

/** The report nearest the hour within ±30 min; a tie goes to the earlier one. */
function nearestReport(reports: readonly TempReport[], hour: number): TempReport | null {
	let best: TempReport | null = null;
	for (const r of reports) {
		const d = Math.abs(r.atMs - hour);
		if (d > SNAP_MS) continue;
		const b = best ? Math.abs(best.atMs - hour) : Infinity;
		if (d < b || (d === b && best !== null && r.atMs < best.atMs)) best = r;
	}
	return best;
}

export function hourColumns(input: HourColumnsInput): HourColumn[] {
	const { now, ahead, staleReports, staleForecast, staleHeadline, headline } = input;
	const hour0 = Math.floor(now / H) * H;
	const reports = [...(input.reports ?? [])].sort((a, b) => a.atMs - b.atMs);
	const whole = new Map(
		(input.periods ?? []).flatMap((p) => (p.endMs === p.startMs + H ? [[p.startMs, p]] : []))
	);

	const observed = (
		at: number,
		r: TempReport,
		isNow = false,
		stale = staleReports
	): HourColumn => ({
		at,
		f: r.tempF,
		pop: null,
		kind: 'observed',
		isNow,
		reportAt: r.atMs,
		words: {
			...readingWords(
				{ at: r.atMs, value: r.tempF, kind: 'observed', unit: '°' },
				{ when: clockTime(r.atMs), notes: [PLACE], stale }
			),
			lead: 'observed'
		}
	});
	const empty = (at: number, kind: HourColumn['kind'], words: ReadoutWords): HourColumn => ({
		at,
		f: null,
		pop: null,
		kind,
		isNow: false,
		reportAt: null,
		words,
		from: at - SNAP_MS,
		to: at + SNAP_MS
	});
	/** No report in reach of the hour: the words give the real silence around it. */
	const missing = (at: number): HourColumn => {
		if (input.reports === null)
			return empty(at, 'observed', {
				lead: '',
				figure: 'Readings unavailable',
				tail: clockTime(at)
			});
		const before = reports.filter((r) => r.atMs < at).at(-1)?.atMs ?? null;
		const after = reports.find((r) => r.atMs > at)?.atMs ?? null;
		return empty(at, 'observed', gapWords({ from: before, to: after }, clockTime));
	};
	const forecast = (at: number): HourColumn => {
		const p = whole.get(at);
		const when = stamp(at, now);
		if (p?.temperatureF == null)
			return empty(at, 'forecast', { lead: '', figure: 'No forecast', tail: when });
		const words = readingWords(
			{ at, value: p.temperatureF, kind: 'forecast', unit: '°' },
			{ when, stale: staleForecast }
		);
		const rain = p.pop === null ? 'chance of rain unknown' : `${p.pop}% chance of rain`;
		return {
			at,
			f: p.temperatureF,
			pop: p.pop,
			kind: 'forecast',
			isNow: false,
			reportAt: null,
			words,
			spoken: `${wordsText(words)} · ${rain}`
		};
	};

	const past = Array.from({ length: PAST_HOURS }, (_, i) => {
		const at = hour0 - (PAST_HOURS - i) * H;
		const r = nearestReport(reports, at);
		return r ? observed(at, r) : missing(at);
	});
	const latest = headline ?? reports.at(-1);
	const current =
		latest && latest.atMs >= hour0 - SNAP_MS
			? observed(hour0, latest, true, headline ? staleHeadline : staleReports)
			: { ...forecast(hour0), isNow: true };
	const future = Array.from({ length: ahead }, (_, i) => forecast(hour0 + (i + 1) * H));
	return [...past, current, ...future];
}
