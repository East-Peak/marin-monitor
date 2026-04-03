/**
 * Tests for format utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timeAgo } from './format';

describe('timeAgo', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns "just now" for dates less than 60 seconds ago', () => {
		const thirtySecsAgo = new Date('2026-04-01T11:59:30Z');
		expect(timeAgo(thirtySecsAgo)).toBe('just now');
	});

	it('returns "just now" for the current time', () => {
		const now = new Date('2026-04-01T12:00:00Z');
		expect(timeAgo(now)).toBe('just now');
	});

	it('returns minutes for 1-59 minutes ago', () => {
		const fiveMinsAgo = new Date('2026-04-01T11:55:00Z');
		expect(timeAgo(fiveMinsAgo)).toBe('5m');

		const oneMinAgo = new Date('2026-04-01T11:59:00Z');
		expect(timeAgo(oneMinAgo)).toBe('1m');

		const fiftyNineMinsAgo = new Date('2026-04-01T11:01:00Z');
		expect(timeAgo(fiftyNineMinsAgo)).toBe('59m');
	});

	it('returns hours for 1-23 hours ago', () => {
		const twoHoursAgo = new Date('2026-04-01T10:00:00Z');
		expect(timeAgo(twoHoursAgo)).toBe('2h');

		const oneHourAgo = new Date('2026-04-01T11:00:00Z');
		expect(timeAgo(oneHourAgo)).toBe('1h');
	});

	it('returns days for 24+ hours ago', () => {
		const oneDayAgo = new Date('2026-03-31T12:00:00Z');
		expect(timeAgo(oneDayAgo)).toBe('1d');

		const threeDaysAgo = new Date('2026-03-29T12:00:00Z');
		expect(timeAgo(threeDaysAgo)).toBe('3d');
	});

	it('handles future dates', () => {
		const fiveMinsFuture = new Date('2026-04-01T12:05:00Z');
		expect(timeAgo(fiveMinsFuture)).toBe('in 5m');

		const twoHoursFuture = new Date('2026-04-01T14:00:00Z');
		expect(timeAgo(twoHoursFuture)).toBe('in 2h');

		const oneDayFuture = new Date('2026-04-02T12:00:00Z');
		expect(timeAgo(oneDayFuture)).toBe('in 1d');
	});

	it('returns "soon" for future dates less than 60 seconds away', () => {
		const thirtySecsFuture = new Date('2026-04-01T12:00:30Z');
		expect(timeAgo(thirtySecsFuture)).toBe('soon');
	});

	it('accepts string date input', () => {
		expect(timeAgo('2026-04-01T11:55:00Z')).toBe('5m');
	});

	it('accepts numeric timestamp input', () => {
		const fiveMinsAgo = new Date('2026-04-01T11:55:00Z').getTime();
		expect(timeAgo(fiveMinsAgo)).toBe('5m');
	});
});
