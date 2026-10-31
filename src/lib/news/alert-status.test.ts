import { describe, expect, it } from 'vitest';
import {
	ALERT_WINDOW_MS,
	LIVE_ALERT_MAX_AGE_MS,
	isActiveAlert,
	isPublisherAlert
} from './alert-status';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const HOUR = 3_600_000;
const nixle = { id: 'nixle-novato-pd-a', isAlert: true, timestamp: NOW - HOUR };
const live = (over = {}) => ({
	id: '511-GF-1',
	isAlert: true,
	timestamp: NOW - 5 * 24 * HOUR,
	alertLive: { seenAt: NOW - 60_000, periods: [] },
	...over
});

describe('isPublisherAlert', () => {
	it.each(['nixle-a', '511-GF-1', 'nps-a', 'usgs-a'])('%s: a source that publishes alerts', (id) =>
		expect(isPublisherAlert({ id, isAlert: true })).toBe(true)
	);

	it('a flag on any other source is not an alert (a pre-flagged item)', () => {
		expect(isPublisherAlert({ id: 'city-of-san-rafael:x', isAlert: true })).toBe(false);
	});

	it('a publisher item it did not flag is not an alert (a Nixle "Community" post)', () => {
		expect(isPublisherAlert({ id: 'nixle-a', isAlert: false })).toBe(false);
		expect(isPublisherAlert({ id: 'nixle-a' })).toBe(false);
	});
});

describe('isActiveAlert', () => {
	it('a dated alert with no published end holds for its window, then ends', () => {
		const at = (age: number) => ({ ...nixle, timestamp: NOW - age });
		expect(isActiveAlert(at(ALERT_WINDOW_MS), NOW)).toBe(true);
		expect(isActiveAlert(at(ALERT_WINDOW_MS + 1), NOW)).toBe(false);
	});

	it('an unknown publication time is unknown status, never claimed active', () => {
		expect(isActiveAlert({ ...nixle, timestamp: NaN }, NOW)).toBe(false);
		expect(isActiveAlert({ ...nixle, publishedAtStatus: 'missing' as const }, NOW)).toBe(false);
	});

	it('a live list holds a long-running alert however old its start', () => {
		expect(isActiveAlert(live(), NOW)).toBe(true);
	});

	it('a published period is honoured, either side of its end', () => {
		const ending = (end: number) =>
			live({ alertLive: { seenAt: NOW - 60_000, periods: [{ start: null, end }] } });
		expect(isActiveAlert(ending(NOW + 1), NOW)).toBe(true);
		expect(isActiveAlert(ending(NOW), NOW)).toBe(false);
	});

	it('not started yet is not active', () => {
		const later = { start: NOW + HOUR, end: null };
		expect(isActiveAlert(live({ alertLive: { seenAt: NOW, periods: [later] } }), NOW)).toBe(false);
	});

	it('a recurring alert is active only inside a period, whatever their order', () => {
		const am = { start: NOW - 4 * HOUR, end: NOW - 3 * HOUR };
		const pm = { start: NOW + 3 * HOUR, end: NOW + 4 * HOUR };
		const now = { start: NOW - HOUR, end: NOW + HOUR };
		const at = (periods: (typeof am)[]) =>
			isActiveAlert(live({ alertLive: { seenAt: NOW, periods } }), NOW);
		expect(at([am, pm])).toBe(false);
		expect(at([pm, now, am])).toBe(true);
	});

	it('kept after a failed refresh: active while the read is recent, then unknown', () => {
		const read = (age: number) => live({ alertLive: { seenAt: NOW - age, periods: [] } });
		expect(isActiveAlert(read(LIVE_ALERT_MAX_AGE_MS), NOW)).toBe(true);
		expect(isActiveAlert(read(LIVE_ALERT_MAX_AGE_MS + 1), NOW)).toBe(false);
	});
});
