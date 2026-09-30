import { describe, expect, it } from 'vitest';
import {
	celsiusToFahrenheit,
	forecastScope,
	nextTide,
	restOfTodayRainChance,
	type HourlyPop
} from './brief';

const H = 3_600_000;
/** Hourly periods from `startIso`, one per value. */
function hours(startIso: string, pops: (number | null)[]): HourlyPop[] {
	const start = Date.parse(startIso);
	return pops.map((pop, i) => ({ startMs: start + i * H, endMs: start + (i + 1) * H, pop }));
}

describe('restOfTodayRainChance (§13.9)', () => {
	const now = Date.parse('2026-09-29T15:30:00Z'); // 8:30 AM PDT; midnight is 07:00Z
	it('is the max over the periods from now to the next Pacific midnight', () => {
		const periods = hours('2026-09-29T15:00:00Z', [10, 20, 60, 30, ...Array(20).fill(5)]);
		expect(restOfTodayRainChance(periods, now)).toEqual({ maxPct: 60, hours: 16 });
	});
	it('ignores tomorrow', () => {
		const periods = hours('2026-09-29T15:00:00Z', [...Array(16).fill(10), 90, 90]);
		expect(restOfTodayRainChance(periods, now)?.maxPct).toBe(10);
	});
	it('a missing probability makes the answer unknown, never 0%', () => {
		const periods = hours('2026-09-29T15:00:00Z', [0, 0, null, ...Array(20).fill(0)]);
		expect(restOfTodayRainChance(periods, now)).toBeNull();
	});
	it('a gap, or data that stops before midnight, is unknown', () => {
		const gap = hours('2026-09-29T15:00:00Z', Array(24).fill(10)).filter((_, i) => i !== 5);
		expect(restOfTodayRainChance(gap, now)).toBeNull();
		expect(
			restOfTodayRainChance(hours('2026-09-29T15:00:00Z', Array(10).fill(10)), now)
		).toBeNull();
	});
	it('stale data (every period already over) is unknown', () => {
		expect(
			restOfTodayRainChance(hours('2026-09-28T15:00:00Z', Array(24).fill(10)), now)
		).toBeNull();
	});
	it('at 11:30 PM only the last hour counts; just after midnight it is a new day', () => {
		const periods = hours('2026-09-30T05:00:00Z', [80, 20, 50, 50]); // 10 PM, 11 PM PDT, then Sep 30
		expect(restOfTodayRainChance(periods, Date.parse('2026-09-30T06:30:00Z'))).toEqual({
			maxPct: 20,
			hours: 1
		});
		const nextDay = hours('2026-09-30T07:00:00Z', Array(24).fill(35));
		expect(restOfTodayRainChance(nextDay, Date.parse('2026-09-30T07:05:00Z'))).toEqual({
			maxPct: 35,
			hours: 24
		});
	});
	it('on the 25-hour fall-back day the window still ends at local midnight', () => {
		const periods = hours('2026-11-01T07:00:00Z', Array(26).fill(15)); // midnight PDT → 1 AM Nov 2 PST
		expect(restOfTodayRainChance(periods, Date.parse('2026-11-01T07:00:00Z'))).toEqual({
			maxPct: 15,
			hours: 25
		});
	});
});

describe('tides and helpers', () => {
	const events = [
		{ atMs: Date.parse('2026-09-29T19:41:00Z'), heightFt: 6.287, type: 'H' as const },
		{ atMs: Date.parse('2026-09-29T13:35:00Z'), heightFt: 2.173, type: 'L' as const },
		{ atMs: Date.parse('2026-09-30T02:48:00Z'), heightFt: -0.202, type: 'L' as const }
	];
	it('the next tide is the first one after now, and advances with the clock', () => {
		expect(nextTide(events, Date.parse('2026-09-29T15:00:00Z'))?.heightFt).toBe(6.287);
		expect(nextTide(events, Date.parse('2026-09-29T19:41:00Z'))?.heightFt).toBe(-0.202);
		expect(nextTide(events, Date.parse('2026-09-30T03:00:00Z'))).toBeNull();
	});
	it('names the forecast for the grid point actually requested', () => {
		expect(forecastScope({ name: 'Central Marin' })).toBe('Central Marin forecast');
	});
	it('converts Celsius observations to whole Fahrenheit', () => {
		expect(celsiusToFahrenheit(15.5)).toBe(60);
		expect(celsiusToFahrenheit(-40)).toBe(-40);
	});
});
