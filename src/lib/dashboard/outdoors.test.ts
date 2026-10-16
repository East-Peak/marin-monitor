import { describe, expect, it } from 'vitest';
import type { HourlyPop, TideEvent } from '$lib/weather/brief';
import type { EarthquakeData } from '$lib/types';
import type { V2Fire } from '$lib/api/marin/calfire';
import { measuredLoading, measuredUnavailable, measuredValue } from './measured';
import type { AirQualityData } from '$lib/types';
import {
	AIR_MAX_AGE_MS,
	AIR_SOURCE,
	SURF_SOURCE,
	airRow,
	dailyRange,
	quakesRow,
	rainSeries,
	surfView,
	tempSeries,
	tideCurve,
	wildfireRow
} from './outdoors';

const H = 3_600_000;
const NOW = Date.parse('2026-10-15T15:20:00Z'); // 8:20 AM Pacific
const HOUR0 = Date.parse('2026-10-15T15:00:00Z');

function hours(temps: (number | null)[], pops: (number | null)[] = [], start = HOUR0): HourlyPop[] {
	return temps.map((temperatureF, i) => ({
		startMs: start + i * H,
		endMs: start + (i + 1) * H,
		temperatureF,
		pop: i < pops.length ? pops[i] : 0
	}));
}

describe('tempSeries', () => {
	it("24h series takes the first 24 hours of the reader's periods and names high/low from the data", () => {
		const temps = Array.from({ length: 30 }, (_, i) => 55 + i); // rising past hour 24
		temps[5] = 51; // the low
		temps[20] = 90; // the high within 24 h; hours 24+ (79..84) are not in the series
		const past = hours([99], [], HOUR0 - H); // an hour that has ended is not "next 24"

		const series = tempSeries([...past, ...hours(temps)], NOW)!;

		expect(series.hours).toHaveLength(24);
		expect(series.hours[0].atMs).toBe(HOUR0);
		expect(series.high).toEqual({ f: 90, atMs: HOUR0 + 20 * H });
		expect(series.low).toEqual({ f: 51, atMs: HOUR0 + 5 * H });
	});

	it('a missing temperature stays missing and is never the low', () => {
		const series = tempSeries(hours([60, null, 62]), NOW)!;
		expect(series.hours.slice(0, 3).map((h) => h.f)).toEqual([60, null, 62]);
		expect(series.low).toEqual({ f: 60, atMs: HOUR0 });
	});

	it('the window is 24 clock hours: an absent hour is a null slot, and nothing past 24 h fills in (Codex desk2 #5)', () => {
		const p = hours(Array.from({ length: 30 }, () => 60));
		const gappy = [...p.slice(0, 1), ...p.slice(2)]; // hour 1 missing from the response
		const series = tempSeries(gappy, NOW)!;
		expect(series.hours).toHaveLength(24);
		expect(series.hours.map((h) => h.atMs)).toEqual(
			Array.from({ length: 24 }, (_, i) => HOUR0 + i * H)
		);
		expect(series.hours[1].f).toBeNull();
	});

	it('no periods → null', () => {
		expect(tempSeries([], NOW)).toBeNull();
	});
});

describe('rainSeries', () => {
	const day = (pops: (number | null)[]) =>
		hours(
			Array.from({ length: 24 }, () => 60),
			Array.from({ length: 24 }, (_, i) => (i < pops.length ? pops[i] : 0))
		);
	it('rain: all-zero hours → "0% every hour"; a null pop stays null, not 0%', () => {
		expect(rainSeries(day([]), NOW)).toEqual({
			bars: Array.from({ length: 24 }, () => 0),
			meta: '0% every hour',
			allDry: true
		});
		const gappy = rainSeries(day([0, null, 30]), NOW);
		expect(gappy.bars.slice(0, 3)).toEqual([0, null, 30]);
		expect(gappy.meta).toBe('peak 30% · 1 hour not forecast');
		const dryButGappy = rainSeries(day([0, null]), NOW);
		expect(dryButGappy.meta).toBe('peak 0% · 1 hour not forecast');
		expect(dryButGappy.allDry).toBe(false);
		expect(rainSeries(hours([60], [null]), NOW).meta).toBe('no rain chance forecast');
	});

	it('an hour absent from the response is not "0% every hour" (Codex desk2 #5)', () => {
		const p = day([]);
		const series = rainSeries([...p.slice(0, 1), ...p.slice(2)], NOW);
		expect(series.bars[1]).toBeNull();
		expect(series.meta).toBe('peak 0% · 1 hour not forecast');
		expect(series.allDry).toBe(false);
	});
});

describe('dailyRange', () => {
	it('6-day strip: per-Pacific-day high/low from hourly periods; a day with no periods is absent, not 0°', () => {
		// Pacific midnight Oct 16 = 07:00Z. Today (Oct 15) runs to then.
		const oct16 = Date.parse('2026-10-16T07:00:00Z');
		const today = hours([58, 70, 64], [], HOUR0);
		const tomorrow = hours([50, 77], [], oct16 + 10 * H); // 3 AM and 4 AM... temps per Pacific day
		const oct18 = hours([61], [], oct16 + 2 * 24 * H); // Oct 17 has no periods
		const tail = hours([1, 2, 3, 4, 5, 6, 7], [], oct16 + 4 * 24 * H).map((p, i) => ({
			...p,
			startMs: p.startMs + i * 23 * H, // one period on each later day
			endMs: p.endMs + i * 23 * H
		}));

		const days = dailyRange([...today, ...tomorrow, ...oct18, ...tail], NOW);

		expect(days.map((d) => d.date)).toEqual([
			'2026-10-15',
			'2026-10-16',
			'2026-10-18',
			'2026-10-20'
		]);
		expect(days[0]).toMatchObject({ name: 'Today', hi: 70, lo: 58 });
		expect(days[1]).toMatchObject({ name: 'Fri', hi: 77, lo: 50 });
		expect(days.some((d) => d.hi === 0 || d.lo === 0)).toBe(false);
	});

	it('a day whose periods all lack a temperature is absent', () => {
		expect(dailyRange(hours([null, null]), NOW)).toEqual([]);
	});
});

const quake = (id: string, magnitude: number, time: number): EarthquakeData => ({
	id,
	magnitude,
	place: `${id} place`,
	time,
	lat: 38,
	lon: -122.5,
	depth: 5,
	url: `https://usgs/${id}`
});

describe('quakesRow', () => {
	const opts = { now: NOW, maxAgeMs: 30 * 60_000 };
	it('quakes: failed read → count unknown (never 0); ok read with none → "None in 7 days"', () => {
		const failed = quakesRow(measuredUnavailable('USGS', 'HTTP 503'), opts);
		expect(failed.value).toBe('Unknown');
		expect(failed.value).not.toMatch(/\b0\b/);
		expect(failed.detail).toContain('HTTP 503');

		expect(quakesRow(measuredValue([], 'USGS', NOW - 60_000), opts).value).toBe('None in 7 days');
		// An empty list nobody can vouch for (no time, retained, or too old) is not "none".
		for (const m of [
			measuredValue<EarthquakeData[]>([], 'USGS', null),
			measuredValue<EarthquakeData[]>([], 'USGS', NOW - 60_000, 'HTTP 503'),
			measuredValue<EarthquakeData[]>([], 'USGS', NOW - 3 * 3_600_000)
		])
			expect(quakesRow(m, opts).value).toBe('Unknown');
		expect(quakesRow(measuredLoading('USGS'), opts).value).toBe('Loading…');
	});

	it('names the count and the largest quake', () => {
		const row = quakesRow(
			measuredValue([quake('a', 2.1, NOW - H), quake('b', 3.4, NOW - 2 * H)], 'USGS', NOW),
			opts
		);
		expect(row.value).toBe('2');
		expect(row.detail).toBe('Largest M3.4 b place');
	});
});

const fire = (name: string, acres: number | null, containment: number | null): V2Fire => ({
	id: name,
	name,
	location: '',
	county: 'Sonoma',
	acres,
	containment,
	lat: 38.4,
	lon: -122.7,
	startDate: NOW - 86_400_000,
	updatedDate: NOW,
	url: `https://fire/${name}`,
	source: 'CAL FIRE',
	isActive: true
});

describe('wildfireRow', () => {
	const opts = { now: NOW, maxAgeMs: 30 * 60_000 };
	it('wildfire "None near" only for an ok, timed read; failed upstream → unavailable', () => {
		expect(wildfireRow(measuredValue([], 'CAL FIRE', NOW - 60_000), opts).value).toBe('None near');
		expect(wildfireRow(measuredValue<V2Fire[]>([], 'CAL FIRE', null), opts).value).not.toBe(
			'None near'
		);
		const failed = wildfireRow(measuredUnavailable('CAL FIRE', 'NIFC API failed: 503'), opts);
		expect(failed.value).toBe('Unavailable');
		expect(failed.detail).toContain('503');
	});

	it('active fires: the count, and the largest by acres', () => {
		const row = wildfireRow(
			measuredValue([fire('Small', 10, 90), fire('Big', 1200, 40)], 'CAL FIRE', NOW),
			opts
		);
		expect(row.value).toBe('2 active near');
		expect(row.detail).toBe('Largest: Big, Sonoma Co., 1,200 acres, 40% contained');
	});

	it('unknown acreage or containment is named as unknown, never 0 (Codex desk2 #2)', () => {
		const row = wildfireRow(measuredValue([fire('Quiet', null, null)], 'CAL FIRE', NOW), opts);
		expect(row.detail).toBe('Quiet, Sonoma Co., acreage not reported, containment not reported');
		expect(row.detail).not.toMatch(/\b0\b/);
		const mixed = wildfireRow(
			measuredValue([fire('Unknown', null, 10), fire('Known', 5, 50)], 'CAL FIRE', NOW),
			opts
		);
		expect(mixed.detail).toBe('Largest reported: Known, Sonoma Co., 5 acres, 50% contained');
	});
});

describe('surf and air', () => {
	it('surf source label says forecast, never buoy', () => {
		expect(SURF_SOURCE).toMatch(/forecast/i);
		expect(SURF_SOURCE).not.toMatch(/buoy|NDBC/i);
		const view = surfView(
			measuredValue(
				{
					points: [
						{ atMs: HOUR0, waveFt: 4.3, periodS: 12, directionDeg: 250 },
						{ atMs: HOUR0 + H, waveFt: null, periodS: 12, directionDeg: 250 }
					],
					checkedAt: NOW
				},
				SURF_SOURCE,
				NOW
			)
		);
		expect(view.current).toEqual({ waveFt: 4.3, periodS: 12, directionDeg: 250 });
		expect(view.heights).toEqual([4.3, null]);
	});
});

describe('airRow', () => {
	const reading: AirQualityData = {
		aqi: 14,
		category: 'Good',
		color: '#00e400',
		pollutant: 'OZONE',
		area: 'San Rafael',
		observedAt: NOW - H,
		timestamp: NOW
	};

	it('a reading shows its AQI and category, with the pollutant and area', () => {
		expect(airRow(measuredValue<AirQualityData | null>(reading, AIR_SOURCE, NOW - H))).toEqual({
			value: '14 · Good',
			detail: 'OZONE · San Rafael'
		});
	});

	it('a failed read is "Unavailable" with its reason, never a number', () => {
		expect(airRow(measuredUnavailable(AIR_SOURCE, 'AirNow failed: 502'))).toEqual({
			value: 'Unavailable',
			detail: 'AirNow failed: 502'
		});
	});

	it('a read with no current observation is "Unavailable", never clean air', () => {
		expect(airRow(measuredValue<AirQualityData | null>(null, AIR_SOURCE, NOW))).toEqual({
			value: 'Unavailable',
			detail: 'no current reading'
		});
	});

	it('a reading kept after a failed refresh is "Unavailable" with the reason and the last reading (Codex)', () => {
		expect(
			airRow(
				measuredValue<AirQualityData | null>(reading, AIR_SOURCE, NOW - H, 'AirNow failed: 502')
			)
		).toEqual({ value: 'Unavailable', detail: 'AirNow failed: 502 · last read 14 · Good' });
	});

	it('a reading with no observation time is "Unavailable": its freshness cannot be vouched for (Codex)', () => {
		expect(
			airRow(
				measuredValue<AirQualityData | null>({ ...reading, observedAt: null }, AIR_SOURCE, null)
			)
		).toEqual({ value: 'Unavailable', detail: 'observation time not reported' });
	});

	it('loading is loading', () => {
		expect(airRow(measuredLoading(AIR_SOURCE))).toEqual({ value: 'Loading…', detail: null });
	});

	it('the hourly observation is allowed to be hours old before it reads out of date', () => {
		expect(AIR_MAX_AGE_MS).toBeGreaterThanOrEqual(2 * H);
	});
});

describe('tideCurve', () => {
	it('passes through every hi/lo and stays between its neighbours', () => {
		const events: TideEvent[] = [
			{ atMs: HOUR0, heightFt: 5, type: 'H' },
			{ atMs: HOUR0 + 6 * H, heightFt: 1, type: 'L' }
		];
		const curve = tideCurve(events, H);
		expect(curve[0]).toEqual({ atMs: HOUR0, ft: 5 });
		expect(curve.at(-1)).toEqual({ atMs: HOUR0 + 6 * H, ft: 1 });
		expect(curve[3].ft).toBeCloseTo(3);
		expect(curve.every((p) => p.ft <= 5 && p.ft >= 1)).toBe(true);
		expect(tideCurve(events.slice(0, 1), H)).toEqual([]);
	});

	it('samples one uniform time grid, so an event off the grid cannot shift later ones (Codex desk2 #6)', () => {
		const step = 20 * 60_000;
		const events: TideEvent[] = [
			{ atMs: HOUR0, heightFt: 1, type: 'L' },
			{ atMs: HOUR0 + 6 * H + 10 * 60_000, heightFt: 5, type: 'H' },
			{ atMs: HOUR0 + 12 * H + 20 * 60_000, heightFt: 1, type: 'L' }
		];
		const curve = tideCurve(events, step);
		expect(curve.every((p, i) => p.atMs === HOUR0 + i * step)).toBe(true);
		const at = (ms: number) => curve.find((p) => p.atMs === ms)!.ft;
		expect(at(HOUR0 + 12 * H + 20 * 60_000)).toBeCloseTo(1);
		expect(at(HOUR0 + 6 * H)).toBeGreaterThan(4.9); // next to the high, off-grid by 10 min
	});
});
