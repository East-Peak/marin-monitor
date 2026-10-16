import { describe, expect, it } from 'vitest';
import { airQualityFromObservations, observationTime } from './airnow';

const NOW = Date.parse('2026-10-16T12:10:00Z');

/** The ziplatlong endpoint's real shape (San Rafael, 2026-10-16). */
function obs(over: Record<string, unknown> = {}) {
	return {
		dateObserved: '2026-10-16',
		hourObserved: '04:00',
		localTimeZone: 'PDT',
		reportingAreaName: 'San Rafael',
		siteID: '060410001',
		siteName: 'San Rafael',
		parameterName: 'PM2.5',
		nowcastAQI: 9,
		aqiCategoryName: 'Good',
		reportingAgency: 'Bay Area Air District',
		lookupBehavior: 'Closest Reading By Pollutant',
		consideredMonitors: 'All',
		lookupBoundary: '50 Miles',
		...over
	};
}

describe('observationTime', () => {
	it('reads the local date, hour and zone as one instant', () => {
		expect(observationTime('2026-10-16', '04:00', 'PDT')).toBe(Date.parse('2026-10-16T11:00:00Z'));
		expect(observationTime('2026-12-01', '23:00', 'PST')).toBe(Date.parse('2026-12-02T07:00:00Z'));
	});

	it('an unknown zone or malformed date is no time at all, never a guess', () => {
		expect(observationTime('2026-10-16', '04:00', 'XYZ')).toBeNull();
		expect(observationTime('16/10/2026', '04:00', 'PDT')).toBeNull();
		expect(observationTime('2026-10-16', '4 AM', 'PDT')).toBeNull();
	});

	it('an impossible hour or date is rejected, never rolled into another day (Codex)', () => {
		expect(observationTime('2026-10-15', '28:00', 'PDT')).toBeNull();
		expect(observationTime('2026-02-30', '04:00', 'PST')).toBeNull();
		expect(observationTime('2026-13-01', '04:00', 'PST')).toBeNull();
		expect(observationTime('2026-10-16', '23:00', 'PDT')).toBe(Date.parse('2026-10-17T06:00:00Z'));
	});
});

describe('airQualityFromObservations', () => {
	it('reports the highest NowCast AQI with its category, pollutant, area and observation time', () => {
		const reading = airQualityFromObservations(
			[obs(), obs({ parameterName: 'OZONE', nowcastAQI: 14 })],
			NOW
		);
		expect(reading).toEqual({
			aqi: 14,
			category: 'Good',
			color: '#00e400',
			pollutant: 'OZONE',
			area: 'San Rafael',
			observedAt: Date.parse('2026-10-16T11:00:00Z'),
			timestamp: NOW
		});
	});

	it('colours by the category name the endpoint gives', () => {
		const color = (aqiCategoryName: string) =>
			airQualityFromObservations([obs({ aqiCategoryName })], NOW)?.color;
		expect(color('Moderate')).toBe('#ffff00');
		expect(color('Unhealthy for Sensitive Groups')).toBe('#ff7e00');
		expect(color('Unhealthy')).toBe('#ff0000');
		expect(color('Very Unhealthy')).toBe('#8f3f97');
		expect(color('Hazardous')).toBe('#7e0023');
		expect(color('Unavailable')).toBe('#999999');
	});

	it('a missing (-1) or non-numeric AQI is skipped, never read as clean air', () => {
		expect(
			airQualityFromObservations(
				[obs({ nowcastAQI: -1 }), obs({ parameterName: 'OZONE', nowcastAQI: 'n/a' })],
				NOW
			)
		).toBeNull();
		expect(
			airQualityFromObservations(
				[obs({ nowcastAQI: -1 }), obs({ parameterName: 'OZONE', nowcastAQI: 31 })],
				NOW
			)?.aqi
		).toBe(31);
	});

	it('no observations is no reading', () => {
		expect(airQualityFromObservations([], NOW)).toBeNull();
	});

	it('a reading whose time cannot be read keeps a null time', () => {
		expect(
			airQualityFromObservations([obs({ localTimeZone: undefined })], NOW)?.observedAt
		).toBeNull();
	});

	it('a service error object (e.g. the retired endpoint) is a failure, not "no reading"', () => {
		expect(() =>
			airQualityFromObservations(
				{ WebServiceError: [{ Message: 'This web service has been retired' }] },
				NOW
			)
		).toThrow(/retired/);
		expect(() => airQualityFromObservations('nonsense', NOW)).toThrow();
	});
});
