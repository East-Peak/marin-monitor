import { describe, expect, it } from 'vitest';
import {
	formatAsOf,
	pacificDate,
	pacificMidnightAfter,
	parsePacificWallTime
} from './pacific-time';

describe('pacific time', () => {
	it('reads the Pacific calendar date, not the UTC one', () => {
		// 2026-09-30T05:30Z is still Sep 29 in Marin (PDT, UTC-7)
		expect(pacificDate(Date.parse('2026-09-30T05:30:00Z'))).toBe('2026-09-29');
		expect(pacificDate(Date.parse('2026-09-30T07:30:00Z'))).toBe('2026-09-30');
	});
	it('finds the next Pacific midnight, including across the fall-back day (25 h)', () => {
		expect(pacificMidnightAfter(Date.parse('2026-09-29T15:00:00Z'))).toBe(
			Date.parse('2026-09-30T07:00:00Z')
		);
		// Sun 2026-11-01 is 25 hours long in Pacific time: midnight after is 08:00Z (PST)
		expect(pacificMidnightAfter(Date.parse('2026-11-01T12:00:00Z'))).toBe(
			Date.parse('2026-11-02T08:00:00Z')
		);
	});
	it('parses NOAA wall-clock times in Pacific time and rejects the spring-forward gap', () => {
		expect(parsePacificWallTime('2026-09-29 12:41')).toBe(Date.parse('2026-09-29T19:41:00Z'));
		expect(parsePacificWallTime('2026-01-15T06:00')).toBe(Date.parse('2026-01-15T14:00:00Z'));
		expect(parsePacificWallTime('2026-03-08 02:30')).toBeNull();
		expect(parsePacificWallTime('not a time')).toBeNull();
	});
	it('formats "as of" times absolutely, adding the date only on another day', () => {
		const now = Date.parse('2026-09-29T18:00:00Z'); // 11:00 AM PDT
		expect(formatAsOf(Date.parse('2026-09-29T14:53:00Z'), now)).toBe('7:53 AM');
		expect(formatAsOf(Date.parse('2026-09-28T14:53:00Z'), now)).toBe('Sep 28, 7:53 AM');
		expect(formatAsOf(Date.parse('2026-09-29T14:53:00Z'), now)).not.toMatch(/live|just now/i);
	});
});
