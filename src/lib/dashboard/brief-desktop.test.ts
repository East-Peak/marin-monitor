import { describe, expect, it } from 'vitest';
import type { HourlyPop, TideEvent } from '$lib/weather/brief';
import { HOURLY_STRIP_HOURS, hourlyStrip, tempTrace, tideDay } from './brief-desktop';

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

describe('hourlyStrip', () => {
	it(`is ${HOURLY_STRIP_HOURS} clock hours from the current one, with temperature and rain chance`, () => {
		const strip = hourlyStrip(periods(HOUR - 2 * H, 30), NOW);
		expect(strip).toHaveLength(HOURLY_STRIP_HOURS);
		expect(strip[0]).toEqual({ atMs: HOUR, f: 62, pop: 10 });
		expect(strip.at(-1)!.atMs).toBe(HOUR + (HOURLY_STRIP_HOURS - 1) * H);
	});
	it('an hour the forecast lacks, or a value NWS omitted, stays unknown (null), never 0', () => {
		const list = periods(HOUR, 30, (i) => (i === 1 ? { pop: null, temperatureF: null } : {}));
		const strip = hourlyStrip(
			list.filter((_, i) => i !== 2),
			NOW
		);
		expect(strip[1]).toEqual({ atMs: HOUR + H, f: null, pop: null });
		expect(strip[2]).toEqual({ atMs: HOUR + 2 * H, f: null, pop: null });
	});
	it('no periods at all: no strip', () => {
		expect(hourlyStrip([], NOW)).toEqual([]);
	});
});

describe('tempTrace', () => {
	const report = (minsAgo: number, tempF: number) => ({ atMs: NOW - minsAgo * MIN, tempF });

	it('spans the last 12 hours, oldest first, with its high and low', () => {
		const t = tempTrace(
			[report(13 * 60, 40), report(700, 50), report(20, 61), report(0, 58)],
			NOW
		)!;
		expect(t.domain).toEqual([NOW - 12 * H, NOW]);
		// 700 → 20 min ago is an 11-hour silence: a break, not a line.
		expect(t.points.map((p) => p.value)).toEqual([50, Number.NaN, 61, 58]);
		expect(t.high).toEqual({ f: 61, atMs: NOW - 20 * MIN });
		expect(t.low).toEqual({ f: 50, atMs: NOW - 700 * MIN });
	});
	it('a gap of over an hour between reports breaks the line: a gap stays a gap', () => {
		const t = tempTrace([report(300, 50), report(280, 51), report(120, 55), report(100, 56)], NOW)!;
		expect(t.points.map((p) => p.value)).toEqual([50, 51, Number.NaN, 55, 56]);
	});
	it('fewer than two reports: no trace', () => {
		expect(tempTrace([report(5, 60)], NOW)).toBeNull();
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
