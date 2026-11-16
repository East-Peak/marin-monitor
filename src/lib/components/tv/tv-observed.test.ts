import { describe, expect, it } from 'vitest';
import { OBSERVATION_MAX_AGE_MS, type ObservedNow } from '$lib/weather/brief';
import { observedNowTemp } from './tv-observed';

const NOW = Date.parse('2026-11-15T20:00:00Z');
const reading = (over: Partial<ObservedNow>): ObservedNow => ({
	stationName: 'Gnoss Field (Novato)',
	observedAt: NOW - 10 * 60_000,
	listNewestAt: NOW - 10 * 60_000,
	tempF: 54,
	text: 'Cloudy',
	...over
});

describe('observedNowTemp (the TV header "Now")', () => {
	it('is the station reading when it is recent and has a temperature', () => {
		expect(observedNowTemp(reading({}), NOW)).toBe(54);
	});
	it('is null when there is no observation', () => {
		expect(observedNowTemp(null, NOW)).toBeNull();
	});
	it('is null when the report has no usable temperature', () => {
		expect(observedNowTemp(reading({ tempF: null }), NOW)).toBeNull();
	});
	it('is null once the report is older than the dashboard bound', () => {
		const old = NOW - OBSERVATION_MAX_AGE_MS - 1;
		expect(observedNowTemp(reading({ observedAt: old }), NOW)).toBeNull();
	});
});
