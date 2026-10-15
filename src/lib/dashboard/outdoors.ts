/**
 * Outdoors & Conditions (desktop Goal 2): a pure view over the brief's own
 * hourly forecast and tides (no extra NWS or NOAA request) and three
 * status-bearing detail reads (Open-Meteo marine, CAL FIRE + NIFC, USGS 7 d).
 * A missing hour, failed read or unvouched empty list is never shown as 0 or "none".
 */
import type { EarthquakeData } from '$lib/types';
import type { FireRead, V2Fire } from '$lib/api/marin/calfire';
import type { MarineForecastRead } from '$lib/api/marin/marine';
import type { EarthquakeRead } from '$lib/api/marin/usgs';
import type { HourlyForecast, HourlyPop, TideEvent } from '$lib/weather/brief';
import type { BriefCard, BriefState } from './brief-store';
import { PACIFIC, pacificDate, pacificMidnightAfter } from './pacific-time';
import { emptyWording, mapMeasured, measuredFromEntry, type Measured } from './measured';
import { datasetEntry, type DatasetFetch } from './source-adapters';
import { presentSection, type SectionPresentation, type SourceStatusEntry } from './source-status';

export const SURF_SOURCE = 'Open-Meteo marine forecast';
export const AIR_QUALITY = { value: 'Unavailable', detail: 'no AQI feed connected' } as const;

/** Each read refreshes with the page (5 min); 30 min is several missed cycles. */
export const OUTDOORS_MAX_AGE_MS = 30 * 60_000;
export const OUTDOORS_DATASETS = {
	marine: { id: 'marine', name: SURF_SOURCE },
	fires: { id: 'fires', name: 'CAL FIRE + NIFC incidents' },
	quakes: { id: 'quakes-week', name: 'USGS earthquakes, 7 days' }
} as const;

const HOURS_SHOWN = 24;
const DAYS_SHOWN = 6;
const DAY_MS = 86_400_000;

export interface TempPoint {
	atMs: number;
	f: number | null;
}
export interface TempSeries {
	hours: TempPoint[];
	high: { f: number; atMs: number } | null;
	low: { f: number; atMs: number } | null;
}

const H = 3_600_000;

/**
 * 24 clock-hour slots from the current hour (Pacific is a whole-hour offset of UTC).
 * A slot the response has no period for is null, so a gap can't hide or pull in hour 25.
 */
function next24(
	periods: readonly HourlyPop[],
	now: number
): { atMs: number; p: HourlyPop | null }[] {
	const byStart = new Map(periods.map((p) => [p.startMs, p]));
	const start = Math.floor(now / H) * H;
	return Array.from({ length: HOURS_SHOWN }, (_, i) => {
		const atMs = start + i * H;
		const p = byStart.get(atMs);
		return { atMs, p: p && p.endMs === atMs + H ? p : null };
	});
}

export function tempSeries(periods: readonly HourlyPop[], now: number): TempSeries | null {
	const window = next24(periods, now);
	if (window.every((s) => s.p === null)) return null;
	const hours = window.map(({ atMs, p }) => ({ atMs, f: p?.temperatureF ?? null }));
	let high: TempSeries['high'] = null;
	let low: TempSeries['low'] = null;
	for (const { atMs, f } of hours) {
		if (f === null) continue;
		if (!high || f > high.f) high = { f, atMs };
		if (!low || f < low.f) low = { f, atMs };
	}
	return { hours, high, low };
}

export interface RainSeries {
	bars: (number | null)[];
	meta: string;
	/** Every one of the 24 hours forecast, each at 0%: the only case that may read as dry. */
	allDry: boolean;
}

export function rainSeries(periods: readonly HourlyPop[], now: number): RainSeries {
	const bars = next24(periods, now).map(({ p }) => p?.pop ?? null);
	const known = bars.filter((b): b is number => b !== null);
	if (known.length === 0) return { bars, meta: 'no rain chance forecast', allDry: false };
	const peak = Math.max(...known);
	const missing = bars.length - known.length;
	if (missing === 0 && peak === 0) return { bars, meta: '0% every hour', allDry: true };
	const gap = missing ? ` · ${missing} ${missing === 1 ? 'hour' : 'hours'} not forecast` : '';
	return { bars, meta: `peak ${peak}%${gap}`, allDry: false };
}

export interface DayRange {
	date: string;
	name: string;
	hi: number;
	lo: number;
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, weekday: 'short' });

/** Six Pacific calendar days from today; a day with no forecast temperature is absent. */
export function dailyRange(periods: readonly HourlyPop[], now: number): DayRange[] {
	const today = pacificDate(now);
	// Noon of the last day: a DST shift of an hour can't move it across midnight.
	const lastDate = pacificDate(pacificMidnightAfter(now) + (DAYS_SHOWN - 2) * DAY_MS + DAY_MS / 2);
	const byDate = new Map<string, { hi: number; lo: number; at: number }>();
	for (const p of periods) {
		if (p.temperatureF === null || p.endMs <= now) continue;
		const date = pacificDate(p.startMs);
		if (date < today || date > lastDate) continue;
		const d = byDate.get(date);
		if (!d) byDate.set(date, { hi: p.temperatureF, lo: p.temperatureF, at: p.startMs });
		else
			byDate.set(date, {
				...d,
				hi: Math.max(d.hi, p.temperatureF),
				lo: Math.min(d.lo, p.temperatureF)
			});
	}
	return [...byDate.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, d]) => ({
			date,
			name: date === today ? 'Today' : WEEKDAY.format(d.at),
			hi: d.hi,
			lo: d.lo
		}));
}

/**
 * A cosine curve through the hi/lo predictions on one uniform grid from the first event,
 * every `stepMs`, so a chart's index is time. An event on the grid is exact.
 */
export function tideCurve(
	events: readonly TideEvent[],
	stepMs: number
): { atMs: number; ft: number }[] {
	const sorted = [...events].sort((a, b) => a.atMs - b.atMs);
	if (sorted.length < 2) return [];
	const curve: { atMs: number; ft: number }[] = [];
	let i = 0;
	for (let t = sorted[0].atMs; t <= sorted[sorted.length - 1].atMs; t += stepMs) {
		while (sorted[i + 1].atMs < t) i++;
		const a = sorted[i];
		const b = sorted[i + 1];
		const x = (t - a.atMs) / (b.atMs - a.atMs);
		curve.push({
			atMs: t,
			ft: a.heightFt + ((b.heightFt - a.heightFt) * (1 - Math.cos(Math.PI * x))) / 2
		});
	}
	return curve;
}

export interface GroundRow {
	value: string;
	detail: string | null;
}

interface Freshness {
	now: number;
	maxAgeMs: number | null;
}

/** Loading, failure, or an empty list nobody can vouch for: the row's honest wording, else null. */
function notAList<T>(
	m: Measured<readonly T[]>,
	empty: string,
	opts: Freshness,
	failed: string
): GroundRow | null {
	if (m.kind === 'loading') return { value: 'Loading…', detail: null };
	if (m.kind !== 'value') return { value: failed, detail: m.reason };
	if (m.value.length > 0) return null;
	const none = emptyWording(m, empty, opts);
	return none
		? { value: none, detail: null }
		: { value: 'Unknown', detail: 'no confirmed recent read' };
}

export function quakesRow(m: Measured<readonly EarthquakeData[]>, opts: Freshness): GroundRow {
	const other = notAList(m, 'None in 7 days', opts, 'Unknown');
	if (other || m.kind !== 'value') return other ?? { value: 'Unknown', detail: null };
	const largest = m.value.reduce((a, q) => (q.magnitude > a.magnitude ? q : a));
	return {
		value: String(m.value.length),
		detail: `Largest M${largest.magnitude.toFixed(1)} ${largest.place}`
	};
}

export function wildfireRow(m: Measured<readonly V2Fire[]>, opts: Freshness): GroundRow {
	const other = notAList(m, 'None near', opts, 'Unavailable');
	if (other || m.kind !== 'value') return other ?? { value: 'Unavailable', detail: null };
	// "Largest" only among fires that report acreage; with none reported, the first is named as is.
	const sized = m.value.filter((x) => x.acres !== null);
	const f = sized.length
		? sized.reduce((a, x) => ((x.acres ?? 0) > (a.acres ?? 0) ? x : a))
		: m.value[0];
	const lead = !sized.length
		? ''
		: sized.length < m.value.length
			? 'Largest reported: '
			: 'Largest: ';
	const where = f.county ? `, ${f.county} Co.` : '';
	const acres =
		f.acres === null ? 'acreage not reported' : `${f.acres.toLocaleString('en-US')} acres`;
	const contained =
		f.containment === null ? 'containment not reported' : `${f.containment}% contained`;
	return {
		value: `${m.value.length} active near`,
		detail: `${lead}${f.name}${where}, ${acres}, ${contained}`
	};
}

export interface SurfView {
	current: { waveFt: number; periodS: number | null; directionDeg: number | null } | null;
	/** Significant wave height for the next 48 hours; a missing hour stays null. */
	heights: (number | null)[];
}

export function surfView(m: Measured<MarineForecastRead>): SurfView {
	if (m.kind !== 'value') return { current: null, heights: [] };
	const first = m.value.points[0];
	return {
		current:
			first && first.waveFt !== null
				? { waveFt: first.waveFt, periodS: first.periodS, directionDeg: first.directionDeg }
				: null,
		heights: m.value.points.slice(0, 48).map((p) => p.waveFt)
	};
}

// ── The section's one view ──────────────────────────────────────────────

export interface OutdoorsInput {
	brief: BriefState | null;
	marine: MarineForecastRead | null;
	fires: FireRead | null;
	quakes: EarthquakeRead | null;
	outcomes: Readonly<Record<string, DatasetFetch>>;
	now: number;
}

export interface OutdoorsView {
	forecast: {
		measured: Measured<HourlyForecast>;
		scope: string | null;
		temp: TempSeries | null;
		rain: RainSeries | null;
		days: DayRange[];
	};
	tides: {
		measured: Measured<TideEvent[]>;
		station: string | null;
		curve: { atMs: number; ft: number }[];
		next: TideEvent[];
	};
	surf: { measured: Measured<MarineForecastRead>; view: SurfView };
	ground: {
		fires: Measured<V2Fire[]>;
		quakes: Measured<EarthquakeData[]>;
		wildfire: GroundRow;
		quake: GroundRow;
	};
	status: SectionPresentation;
}

function briefEntry(
	id: string,
	name: string,
	card: BriefCard<unknown> | undefined
): SourceStatusEntry {
	if (!card) return { id, name, state: 'loading', observedAt: null, maxAgeMs: null, detail: null };
	return {
		id,
		name,
		state: card.state,
		observedAt: card.observedAt,
		maxAgeMs: card.maxAgeMs,
		detail: card.detail
	};
}

export function outdoorsView(input: OutdoorsInput): OutdoorsView {
	const { brief, now } = input;
	const fresh = { now, maxAgeMs: OUTDOORS_MAX_AGE_MS };
	const D = OUTDOORS_DATASETS;
	const entries = {
		forecast: briefEntry('brief:forecast', 'NWS hourly forecast', brief?.forecast),
		tides: briefEntry('brief:tides', 'NOAA tide predictions', brief?.tides),
		marine: datasetEntry(
			D.marine.id,
			D.marine.name,
			input.outcomes[D.marine.id],
			OUTDOORS_MAX_AGE_MS
		),
		fires: datasetEntry(D.fires.id, D.fires.name, input.outcomes[D.fires.id], OUTDOORS_MAX_AGE_MS),
		quakes: datasetEntry(
			D.quakes.id,
			D.quakes.name,
			input.outcomes[D.quakes.id],
			OUTDOORS_MAX_AGE_MS
		)
	};
	const forecast = measuredFromEntry(
		entries.forecast,
		brief?.forecast.value ?? null,
		'NWS hourly forecast',
		now
	);
	const tides = measuredFromEntry(
		entries.tides,
		brief?.tides.value ?? null,
		'NOAA prediction, MLLW',
		now
	);
	const marine = measuredFromEntry(entries.marine, input.marine, SURF_SOURCE, now);
	const fires = mapMeasured(
		measuredFromEntry(entries.fires, input.fires, 'CAL FIRE + NIFC', now),
		(r) => r.fires
	);
	const quakes = mapMeasured(
		measuredFromEntry(entries.quakes, input.quakes, 'USGS, within 100 km', now),
		(r) => r.quakes
	);
	const periods = forecast.kind === 'value' ? forecast.value.periods : [];
	const tideEvents = tides.kind === 'value' ? tides.value : [];
	const all = Object.values(entries);
	const valued = [forecast, tides, marine, fires, quakes].filter((m) => m.kind === 'value').length;
	return {
		forecast: {
			measured: forecast,
			scope: brief?.forecast.scope ?? null,
			temp: tempSeries(periods, now),
			rain: periods.length ? rainSeries(periods, now) : null,
			days: dailyRange(periods, now)
		},
		tides: {
			measured: tides,
			station: brief?.tides.scope ?? null,
			curve: tideCurve(tideEvents, 20 * 60_000),
			next: [...tideEvents]
				.sort((a, b) => a.atMs - b.atMs)
				.filter((e) => e.atMs > now)
				.slice(0, 4)
		},
		surf: { measured: marine, view: surfView(marine) },
		ground: {
			fires,
			quakes,
			wildfire: wildfireRow(fires, fresh),
			quake: quakesRow(quakes, fresh)
		},
		status: presentSection(all, { total: valued, matching: valued }, now)
	};
}
