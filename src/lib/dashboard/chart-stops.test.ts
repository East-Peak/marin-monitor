import { describe, expect, it } from 'vitest';
import { nearestPoint, wordsText, type Reading } from './chart-readout';
import { dayStops, eventStops, heightStops, rainStops, seriesStops, startAt } from './chart-stops';

const H = 3_600_000;
const NOW = Date.parse('2026-10-31T17:10:00Z'); // Saturday 10:10 AM PDT
const HOUR = Date.parse('2026-10-31T17:00:00Z');
const said = (s: { words: Parameters<typeof wordsText>[0] }) => wordsText(s.words);
const yOf = (v: number) => v / 10;

describe('tide events (chart 7)', () => {
	const events = [
		{ atMs: HOUR + H, heightFt: 6.3, type: 'H' as const },
		{ atMs: HOUR + 30 * H, heightFt: 0.4, type: 'L' as const }
	];
	it('reads only NOAA’s events, with their weekday, never the drawn curve', () => {
		const stops = eventStops(events, yOf, NOW);
		expect(stops.map(said)).toEqual([
			'predicted high 6.3 ft · Sat 11 AM',
			'predicted low 0.4 ft · Sun 3 PM'
		]);
		expect(nearestPoint(stops, HOUR + 15 * H)).toBe(stops[0]);
	});
	it('says stale', () => {
		expect(said(eventStops(events, yOf, NOW, true)[0])).toContain('· stale');
	});
});

describe('hourly heights (chart 2)', () => {
	const events = [{ atMs: HOUR + 90 * 60_000, heightFt: 6.3, type: 'H' as const }];
	it('reads NOAA’s hourly points and names the events on them', () => {
		const pts = [
			{ atMs: HOUR, ft: 5.1 },
			{ atMs: HOUR + 90 * 60_000, ft: 6.3 },
			{ atMs: HOUR + 2 * H, ft: 6.0 }
		];
		const stops = heightStops(pts, events, yOf, NOW);
		expect(stops.map(said)).toEqual([
			'predicted 5.1 ft · 10 AM',
			'predicted high 6.3 ft · 11:30 AM',
			'predicted 6 ft · 12 PM'
		]);
	});
	it('an event and an hour each keep their own source’s freshness', () => {
		const pts = [
			{ atMs: HOUR, ft: 5.1 },
			{ atMs: HOUR + 90 * 60_000, ft: 6.3 }
		];
		const stale = heightStops(pts, events, yOf, NOW, { hourly: false, events: true });
		expect(said(stale[0])).toBe('predicted 5.1 ft · 10 AM');
		expect(said(stale[1])).toBe('predicted high 6.3 ft · 11:30 AM · stale');
		const hourly = heightStops(pts, events, yOf, NOW, { hourly: true, events: false });
		expect(said(hourly[0])).toContain('stale');
		expect(said(hourly[1])).not.toContain('stale');
	});
	it('a break in the series is a silence, not a reading', () => {
		const pts = [
			{ atMs: HOUR, ft: 5.1 },
			{ atMs: HOUR + 2 * H, ft: Number.NaN },
			{ atMs: HOUR + 4 * H, ft: 6 }
		];
		const stops = heightStops(pts, [], yOf, NOW);
		expect(stops.map(said)).toEqual([
			'predicted 5.1 ft · 10 AM',
			'No readings 10 AM–2 PM',
			'predicted 6 ft · 2 PM'
		]);
		expect(stops[1]).toMatchObject({ from: HOUR, to: HOUR + 4 * H, y: null });
	});
});

describe('rain (chart 5)', () => {
	it('each bar reads its hour; a missing hour reads as none, and 0 as 0', () => {
		const stops = rainStops([0, null, 30], [HOUR, HOUR + H, HOUR + 2 * H], yOf, NOW);
		expect(stops.map(said)).toEqual([
			'forecast 0% chance · 10 AM',
			'No reading · 11 AM',
			'forecast 30% chance · 12 PM'
		]);
		expect(stops[1].y).toBeNull();
		expect(stops[0].at).toBe(HOUR + H / 2);
	});
});

describe('daily (chart 6)', () => {
	it('reads each day’s forecast high and low', () => {
		const stops = dayStops([{ name: 'Today', hi: 67, lo: 52 }]);
		expect(said(stops[0])).toBe('forecast 67° high · 52° low · Today');
		expect(stops[0]).toMatchObject({ at: 0.5, y: null });
	});
});

describe('any series', () => {
	const r = (at: number, value: number | null): Reading => ({
		at,
		value,
		kind: 'forecast',
		unit: ' ft'
	});
	it('keeps null slots, and time spacing', () => {
		const stops = seriesStops([r(HOUR, 4), r(HOUR + H, null), r(HOUR + 5 * H, 5)], {
			y: yOf,
			when: (ms) => `${(ms - HOUR) / H}h`,
			format: (v) => `${v.toFixed(1)} ft`
		});
		expect(stops.map(said)).toEqual([
			'forecast 4.0 ft · 0h',
			'No reading · 1h',
			'forecast 5.0 ft · 5h'
		]);
		expect(stops[1].y).toBeNull();
	});
	it('a gap rule adds the silence between readings and at the ends', () => {
		const stops = seriesStops([r(HOUR + 2 * H, 4), r(HOUR + 8 * H, 5)], {
			y: yOf,
			when: (ms) => `${(ms - HOUR) / H}h`,
			gapMs: H,
			domain: [HOUR, HOUR + 10 * H]
		});
		expect(stops.map(said)).toEqual([
			'No readings before 2h',
			'forecast 4 ft · 2h',
			'No readings 2h–8h',
			'forecast 5 ft · 8h',
			'No readings since 8h'
		]);
	});
	it('stops are in time order whatever arrived', () => {
		const stops = seriesStops([r(HOUR + H, 5), r(HOUR, 4)], { y: yOf, when: () => 'x' });
		expect(stops.map((s) => s.at)).toEqual([HOUR, HOUR + H]);
	});
});

describe('startAt', () => {
	it('is the reading nearest now, for the keys to start from', () => {
		const stops = [{ at: 0 }, { at: 10 }, { at: 20 }];
		expect(startAt(stops, 12)).toBe(1);
		expect(startAt([], 12)).toBeUndefined();
	});
});
