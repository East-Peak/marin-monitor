import { describe, expect, it } from 'vitest';
import type { TempReport } from '$lib/api/marin/nws-observation';
import type { HourlyForecast, HourlyPop, TideEvent } from '$lib/weather/brief';
import { stationColumns, stationKey, TILE_HOURS_AHEAD, tideDay } from './brief-desktop';
import { initialBriefState, type BriefCard, type BriefState } from './brief-store';

const H = 3_600_000;
const MIN = 60_000;
const NOW = Date.parse('2026-10-17T15:20:00Z'); // 8:20 AM PDT
const HOUR = Date.parse('2026-10-17T15:00:00Z');

function periods(from: number, n: number, over: (i: number) => Partial<HourlyPop> = () => ({})) {
	return Array.from({ length: n }, (_, i) => ({
		startMs: from + i * H,
		endMs: from + (i + 1) * H,
		pop: 10,
		temperatureF: 60 + i,
		...over(i)
	}));
}

const report = (minutesAgo: number, tempF: number) => ({ atMs: NOW - minutesAgo * MIN, tempF });
const card = <T>(value: T | null, over: Partial<BriefCard<T>> = {}): BriefCard<T> => ({
	value,
	scope: 'Gnoss Field (Novato)',
	observedAt: NOW,
	maxAgeMs: null,
	state: 'ok',
	detail: null,
	updatingFor: null,
	...over
});
const OBS = {
	stationName: 'Gnoss Field (Novato)',
	observedAt: NOW - 5 * MIN,
	listNewestAt: NOW - 5 * MIN,
	tempF: 58,
	text: null
};
const brief = (over: Partial<BriefState> = {}): BriefState => ({
	...initialBriefState(),
	observed: card(OBS),
	history: card([report(70, 50), report(30, 52)]),
	stationForecast: card({ updatedAt: NOW, periods: periods(HOUR, 12) }),
	// The picked town's forecast: never read by these columns.
	forecast: card({ updatedAt: NOW, periods: periods(HOUR, 12, () => ({ temperatureF: 99 })) }),
	...over
});

describe('stationColumns', () => {
	it('Now equals the headline, even when the history list lags it', () => {
		const cols = stationColumns(brief(), NOW, TILE_HOURS_AHEAD);
		expect(cols).toHaveLength(13);
		expect(cols.find((c) => c.isNow)).toMatchObject({ f: 58, reportAt: OBS.observedAt });
	});
	it('with history failed, Now is still the headline', () => {
		const cols = stationColumns(
			brief({ history: card<TempReport[]>(null, { state: 'unavailable' }) }),
			NOW,
			8
		);
		expect(cols.find((c) => c.isNow)).toMatchObject({ f: 58, kind: 'observed' });
	});
	it('a stale headline reads stale though the history is fresh', () => {
		const cols = stationColumns(brief({ observed: card(OBS, { state: 'stale' }) }), NOW, 8);
		expect(cols.find((c) => c.isNow)?.words.tail).toContain('stale');
	});
	it('the key moves with the town and with a new read, not with the clock', () => {
		const a = stationKey(brief());
		expect(stationKey(brief())).toBe(a);
		expect(
			stationKey(brief({ forecast: card<HourlyForecast>(null, { scope: 'Mill Valley forecast' }) }))
		).not.toBe(a);
		expect(stationKey(brief({ history: card([], { observedAt: NOW + 1 }) }))).not.toBe(a);
	});
	it('reads the station’s grid point, never the town’s', () => {
		const cols = stationColumns(brief(), NOW, 8);
		expect(cols.filter((c) => c.kind === 'forecast').map((c) => c.f)).not.toContain(99);
	});
	it('an unavailable forecast is not replaced by the town’s', () => {
		const cols = stationColumns(
			brief({ stationForecast: card<HourlyForecast>(null, { state: 'unavailable' }) }),
			NOW,
			8
		);
		expect(cols.slice(5).every((c) => c.f === null)).toBe(true);
		expect(cols.slice(5).map((c) => c.f)).not.toContain(99);
	});
	it('a report with a null temperature leaves the headline out of the columns', () => {
		const cols = stationColumns(brief({ observed: card({ ...OBS, tempF: null }) }), NOW, 8);
		expect(cols.find((c) => c.isNow)?.reportAt).toBe(NOW - 30 * MIN);
	});
	it('out-of-date series say stale, on their own side', () => {
		const old = brief({
			history: card([report(70, 50), report(30, 52)], {
				observedAt: NOW - 3 * H,
				maxAgeMs: 90 * MIN
			})
		});
		const cols = stationColumns(old, NOW, 8);
		expect(cols[3].words.tail).toContain('stale');
		expect(cols[5].words.tail).not.toContain('stale');
	});
});

describe('tideDay', () => {
	const midnight = Date.parse('2026-10-17T07:00:00Z');
	const next = Date.parse('2026-10-18T07:00:00Z');
	const heights = Array.from({ length: 48 }, (_, i) => ({
		atMs: Date.parse('2026-10-17T00:00:00Z') + i * H,
		heightFt: 3 + Math.sin(i / 2)
	}));
	const events: TideEvent[] = [
		{ atMs: Date.parse('2026-10-17T05:12:00Z'), heightFt: 5.9, type: 'H' }, // yesterday, Pacific
		{ atMs: Date.parse('2026-10-17T11:41:00Z'), heightFt: 0.4, type: 'L' },
		{ atMs: Date.parse('2026-10-17T18:03:00Z'), heightFt: 5.1, type: 'H' }
	];

	it("is today's Pacific day of NOAA hourly heights with today's hi/lo events among them", () => {
		const d = tideDay(heights, events, NOW)!;
		expect(d.domain).toEqual([midnight, next]);
		expect(d.events.map((e) => e.type)).toEqual(['L', 'H']);
		for (const e of d.events) expect(d.points).toContainEqual({ atMs: e.atMs, ft: e.heightFt });
		expect(d.points.every((p) => p.atMs >= midnight && p.atMs <= next)).toBe(true);
		expect(d.points.map((p) => p.atMs)).toEqual(
			[...d.points.map((p) => p.atMs)].sort((a, b) => a - b)
		);
		// Every vertex is a NOAA prediction: 25 hourly (midnight to midnight) plus the 2 events.
		expect(d.points).toHaveLength(27);
	});
	it('no hourly heights for today: no curve (we never draw our own)', () => {
		expect(tideDay([], events, NOW)).toBeNull();
	});
});

describe('tideDay gaps (MAPX1, Codex #2)', () => {
	it('an hour NOAA omitted breaks the curve rather than bridging it', () => {
		const midnight = Date.parse('2026-10-17T07:00:00Z');
		const heights = Array.from({ length: 25 }, (_, i) => ({
			atMs: midnight + i * H,
			heightFt: 3
		})).filter((_, i) => i < 5 || i > 8);
		const d = tideDay(heights, [], NOW)!;
		const breaks = d.points.filter((p) => Number.isNaN(p.ft));
		expect(breaks).toHaveLength(1);
		expect(breaks[0].atMs).toBeGreaterThan(midnight + 4 * H);
		expect(breaks[0].atMs).toBeLessThan(midnight + 9 * H);
	});
});
