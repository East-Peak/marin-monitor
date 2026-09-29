import { describe, expect, it } from 'vitest';
import { isWithinWindow, withinFutureSkew } from './recency';

const NOW = Date.parse('2026-09-28T20:00:00Z');
const H = 3_600_000;

describe('isWithinWindow', () => {
	it('counts known times inside the window', () => {
		expect(isWithinWindow({ timestamp: NOW - 2 * H }, 24 * H, NOW)).toBe(true);
		expect(
			isWithinWindow({ publishedAtStatus: 'valid', timestamp: NOW - 2 * H }, 24 * H, NOW)
		).toBe(true);
	});
	it('never counts an unknown time (NaN is not "recent")', () => {
		for (const item of [
			{ timestamp: Number.NaN },
			{ publishedAtStatus: 'missing' as const, timestamp: Number.NaN },
			{ publishedAtStatus: 'future' as const, timestamp: Number.NaN },
			{ publishedAtStatus: 'invalid' as const, timestamp: NOW - H }
		]) {
			expect(isWithinWindow(item, 7 * 24 * H, NOW)).toBe(false);
		}
	});
	it('excludes times older than the window and more than 5 minutes ahead', () => {
		expect(isWithinWindow({ timestamp: NOW - 25 * H }, 24 * H, NOW)).toBe(false);
		expect(isWithinWindow({ timestamp: NOW + 6 * 60_000 }, 24 * H, NOW)).toBe(false);
		expect(isWithinWindow({ timestamp: NOW + 4 * 60_000 }, 24 * H, NOW)).toBe(true);
	});
});

describe('withinFutureSkew', () => {
	it('tolerates up to 5 minutes ahead of now and rejects beyond', () => {
		expect(withinFutureSkew(NOW - 30 * 24 * H, NOW)).toBe(true);
		expect(withinFutureSkew(NOW + 5 * 60_000, NOW)).toBe(true);
		expect(withinFutureSkew(NOW + 5 * 60_000 + 1, NOW)).toBe(false);
	});
	it('is false for an unknown time', () => {
		expect(withinFutureSkew(Number.NaN, NOW)).toBe(false);
	});
});
