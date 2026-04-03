import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestResult } from '$lib/services/client';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock serviceClient before importing the module under test
vi.mock('$lib/services/client', () => ({
	serviceClient: {
		request: vi.fn()
	}
}));

// Mock getGridPoint so forecast tests don't hit the real NWS /points endpoint
vi.mock('./nws-common', () => ({
	getGridPoint: vi.fn().mockResolvedValue({ office: 'MTR', gridX: 85, gridY: 105 })
}));

// Mock logger to suppress output
vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

// Mock NWS_ZONE
vi.mock('$lib/config/map', () => ({
	NWS_ZONE: 'CAZ006'
}));

import { fetchForecast, fetchAlerts, fetchWeather } from './nws';
import { serviceClient } from '$lib/services/client';
import { getGridPoint } from './nws-common';

const mockRequest = vi.mocked(serviceClient.request);
const mockGetGridPoint = vi.mocked(getGridPoint);

// ── Fixtures ───────────────────────────────────────────────────────────────

function makePeriod(overrides: Partial<{
	number: number;
	name: string;
	startTime: string;
	endTime: string;
	isDaytime: boolean;
	temperature: number;
	temperatureUnit: string;
	windSpeed: string;
	windDirection: string;
	shortForecast: string;
	detailedForecast: string;
	icon: string;
}> = {}) {
	return {
		number: 1,
		name: 'This Afternoon',
		startTime: '2026-04-01T15:00:00-07:00',
		endTime: '2026-04-01T18:00:00-07:00',
		isDaytime: true,
		temperature: 68,
		temperatureUnit: 'F',
		windSpeed: '10 mph',
		windDirection: 'W',
		shortForecast: 'Sunny',
		detailedForecast: 'Sunny, with a high near 68.',
		icon: 'https://api.weather.gov/icons/land/day/few',
		...overrides
	};
}

function makeAlertFeature(overrides: Partial<{
	id: string;
	event: string;
	headline: string;
	description: string;
	severity: string;
	urgency: string;
	onset: string;
	expires: string;
	areaDesc: string;
}> = {}) {
	return {
		properties: {
			id: 'urn:oid:2.49.0.1.840.0.abc123',
			event: 'Red Flag Warning',
			headline: 'Red Flag Warning issued for Marin County',
			description: 'Gusty winds and low humidity will create critical fire weather conditions.',
			severity: 'Severe',
			urgency: 'Expected',
			onset: '2026-04-01T11:00:00-07:00',
			expires: '2026-04-02T20:00:00-07:00',
			areaDesc: 'Marin County Coast; North Bay Interior Valleys',
			...overrides
		}
	};
}

function wrapResult<T>(data: T): RequestResult<T> {
	return { data, fromCache: false };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NWS adapter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetGridPoint.mockResolvedValue({ office: 'MTR', gridX: 85, gridY: 105 });
	});

	// ── fetchForecast ────────────────────────────────────────────────────

	describe('fetchForecast', () => {
		it('maps NWS periods to WeatherData with correct field values', async () => {
			const period = makePeriod({
				temperature: 72,
				temperatureUnit: 'F',
				windSpeed: '15 mph',
				windDirection: 'NW',
				shortForecast: 'Partly Cloudy',
				detailedForecast: 'Partly cloudy, with a high near 72.',
				isDaytime: true,
				startTime: '2026-04-01T12:00:00-07:00',
				name: 'This Afternoon'
			});

			mockRequest.mockResolvedValueOnce(
				wrapResult({ properties: { periods: [period] } })
			);

			const result = await fetchForecast();

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				temperature: 72,
				temperatureUnit: 'F',
				windSpeed: '15 mph',
				windDirection: 'NW',
				shortForecast: 'Partly Cloudy',
				detailedForecast: 'Partly cloudy, with a high near 72.',
				isDaytime: true,
				timestamp: new Date('2026-04-01T12:00:00-07:00').getTime(),
				name: 'This Afternoon'
			});
		});

		it('converts startTime to numeric timestamp', async () => {
			const startTime = '2026-04-01T15:00:00-07:00';
			mockRequest.mockResolvedValueOnce(
				wrapResult({ properties: { periods: [makePeriod({ startTime })] } })
			);

			const result = await fetchForecast();
			expect(result[0].timestamp).toBe(new Date(startTime).getTime());
		});

		it('caps output at 14 periods for 5-day outlook', async () => {
			const periods = Array.from({ length: 20 }, (_, i) =>
				makePeriod({
					number: i + 1,
					name: `Period ${i + 1}`,
					startTime: new Date(Date.now() + i * 12 * 3600_000).toISOString()
				})
			);

			mockRequest.mockResolvedValueOnce(
				wrapResult({ properties: { periods } })
			);

			const result = await fetchForecast();
			expect(result).toHaveLength(14);
		});

		it('returns fewer than 14 if API provides fewer periods', async () => {
			const periods = [makePeriod(), makePeriod({ number: 2, name: 'Tonight' })];
			mockRequest.mockResolvedValueOnce(
				wrapResult({ properties: { periods } })
			);

			const result = await fetchForecast();
			expect(result).toHaveLength(2);
		});

		it('returns empty array when properties is missing', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({}));

			const result = await fetchForecast();
			expect(result).toEqual([]);
		});

		it('returns empty array when periods is empty', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({ properties: { periods: [] } })
			);

			const result = await fetchForecast();
			expect(result).toEqual([]);
		});

		it('returns empty array on network error', async () => {
			mockRequest.mockRejectedValueOnce(new Error('Network timeout'));

			const result = await fetchForecast();
			expect(result).toEqual([]);
		});

		it('returns empty array on 500 error from serviceClient', async () => {
			mockRequest.mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'));

			const result = await fetchForecast();
			expect(result).toEqual([]);
		});

		it('passes custom lat/lon to getGridPoint', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({ properties: { periods: [makePeriod()] } })
			);

			await fetchForecast(37.95, -122.55);
			expect(mockGetGridPoint).toHaveBeenCalledWith(37.95, -122.55);
		});

		it('builds the correct endpoint from grid point data', async () => {
			mockGetGridPoint.mockResolvedValueOnce({ office: 'MTR', gridX: 85, gridY: 105 });
			mockRequest.mockResolvedValueOnce(
				wrapResult({ properties: { periods: [makePeriod()] } })
			);

			await fetchForecast();

			expect(mockRequest).toHaveBeenCalledWith(
				'NWS',
				'/gridpoints/MTR/85,105/forecast',
				expect.objectContaining({
					accept: 'application/geo+json'
				})
			);
		});

		it('does not include icon field in output (only maps specified fields)', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({ properties: { periods: [makePeriod()] } })
			);

			const result = await fetchForecast();
			expect(result[0]).not.toHaveProperty('icon');
			expect(result[0]).not.toHaveProperty('number');
			expect(result[0]).not.toHaveProperty('endTime');
		});

		it('returns empty array when getGridPoint fails', async () => {
			mockGetGridPoint.mockRejectedValueOnce(new Error('NWS points lookup failed: 404'));

			const result = await fetchForecast();
			expect(result).toEqual([]);
		});

		it('preserves isDaytime=false for nighttime periods', async () => {
			const nightPeriod = makePeriod({
				name: 'Tonight',
				isDaytime: false,
				temperature: 52,
				shortForecast: 'Clear'
			});
			mockRequest.mockResolvedValueOnce(
				wrapResult({ properties: { periods: [nightPeriod] } })
			);

			const result = await fetchForecast();
			expect(result[0].isDaytime).toBe(false);
			expect(result[0].name).toBe('Tonight');
		});
	});

	// ── fetchAlerts ──────────────────────────────────────────────────────

	describe('fetchAlerts', () => {
		it('maps NWS alert features to FireWeatherAlert with correct field values', async () => {
			const feature = makeAlertFeature({
				id: 'urn:oid:2.49.0.1.840.0.xyz789',
				event: 'Wind Advisory',
				headline: 'Wind Advisory issued for Marin County',
				description: 'Winds gusting to 50 mph expected.',
				severity: 'Moderate',
				urgency: 'Expected',
				onset: '2026-04-01T18:00:00-07:00',
				expires: '2026-04-02T06:00:00-07:00',
				areaDesc: 'Marin County Coast'
			});

			mockRequest.mockResolvedValueOnce(wrapResult({ features: [feature] }));

			const result = await fetchAlerts();

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				id: 'urn:oid:2.49.0.1.840.0.xyz789',
				event: 'Wind Advisory',
				headline: 'Wind Advisory issued for Marin County',
				description: 'Winds gusting to 50 mph expected.',
				severity: 'Moderate',
				urgency: 'Expected',
				onset: '2026-04-01T18:00:00-07:00',
				expires: '2026-04-02T06:00:00-07:00',
				areaDesc: 'Marin County Coast'
			});
		});

		it('handles multiple concurrent alerts', async () => {
			const features = [
				makeAlertFeature({ event: 'Red Flag Warning', severity: 'Severe' }),
				makeAlertFeature({ event: 'Wind Advisory', severity: 'Moderate' }),
				makeAlertFeature({ event: 'Frost Advisory', severity: 'Minor' })
			];

			mockRequest.mockResolvedValueOnce(wrapResult({ features }));

			const result = await fetchAlerts();
			expect(result).toHaveLength(3);
			expect(result.map((a) => a.event)).toEqual([
				'Red Flag Warning',
				'Wind Advisory',
				'Frost Advisory'
			]);
			expect(result.map((a) => a.severity)).toEqual(['Severe', 'Moderate', 'Minor']);
		});

		it('returns empty array when no alerts are active', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({ features: [] }));

			const result = await fetchAlerts();
			expect(result).toEqual([]);
		});

		it('returns empty array on network error', async () => {
			mockRequest.mockRejectedValueOnce(new Error('Network timeout'));

			const result = await fetchAlerts();
			expect(result).toEqual([]);
		});

		it('returns empty array on 404 error', async () => {
			mockRequest.mockRejectedValueOnce(new Error('HTTP 404: Not Found'));

			const result = await fetchAlerts();
			expect(result).toEqual([]);
		});

		it('passes zone parameter in the request', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({ features: [] }));

			await fetchAlerts();

			expect(mockRequest).toHaveBeenCalledWith(
				'NWS',
				'/alerts/active',
				expect.objectContaining({
					params: { zone: 'CAZ006' }
				})
			);
		});

		it('returns empty array when features key is missing from response', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({} as { features: never[] }));

			const result = await fetchAlerts();
			expect(result).toEqual([]);
		});

		it('preserves all severity levels as strings', async () => {
			const severities = ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'];
			const features = severities.map((severity) =>
				makeAlertFeature({ severity, event: `${severity} Alert` })
			);

			mockRequest.mockResolvedValueOnce(wrapResult({ features }));

			const result = await fetchAlerts();
			expect(result.map((a) => a.severity)).toEqual(severities);
		});
	});

	// ── fetchWeather ─────────────────────────────────────────────────────

	describe('fetchWeather', () => {
		// fetchWeather uses Promise.all(fetchForecast, fetchAlerts).
		// fetchForecast awaits getGridPoint before calling serviceClient.request,
		// while fetchAlerts calls serviceClient.request immediately.
		// With Promise.all, fetchAlerts' request may fire first.
		// Use mockImplementation to route by endpoint instead of mockResolvedValueOnce.

		it('returns both forecast and alerts in parallel', async () => {
			mockRequest.mockImplementation((_service: string, endpoint: string) => {
				if (endpoint.includes('/gridpoints/')) {
					return Promise.resolve(
						wrapResult({
							properties: {
								periods: [makePeriod({ temperature: 70, shortForecast: 'Sunny' })]
							}
						})
					);
				}
				if (endpoint === '/alerts/active') {
					return Promise.resolve(
						wrapResult({
							features: [makeAlertFeature({ event: 'Heat Advisory' })]
						})
					);
				}
				return Promise.reject(new Error(`Unexpected endpoint: ${endpoint}`));
			});

			const result = await fetchWeather();

			expect(result.forecast).toHaveLength(1);
			expect(result.forecast[0].temperature).toBe(70);
			expect(result.forecast[0].shortForecast).toBe('Sunny');

			expect(result.alerts).toHaveLength(1);
			expect(result.alerts[0].event).toBe('Heat Advisory');
		});

		it('returns empty arrays when both sources fail', async () => {
			mockRequest.mockRejectedValue(new Error('everything is down'));

			const result = await fetchWeather();
			expect(result.forecast).toEqual([]);
			expect(result.alerts).toEqual([]);
		});

		it('passes lat/lon through to fetchForecast', async () => {
			mockRequest.mockImplementation((_service: string, endpoint: string) => {
				if (endpoint.includes('/gridpoints/')) {
					return Promise.resolve(wrapResult({ properties: { periods: [] } }));
				}
				return Promise.resolve(wrapResult({ features: [] }));
			});

			await fetchWeather(38.05, -122.75);
			expect(mockGetGridPoint).toHaveBeenCalledWith(38.05, -122.75);
		});

		it('still returns alerts when forecast fails', async () => {
			mockRequest.mockImplementation((_service: string, endpoint: string) => {
				if (endpoint.includes('/gridpoints/')) {
					return Promise.reject(new Error('forecast down'));
				}
				if (endpoint === '/alerts/active') {
					return Promise.resolve(
						wrapResult({
							features: [makeAlertFeature({ event: 'Flood Watch' })]
						})
					);
				}
				return Promise.reject(new Error(`Unexpected endpoint: ${endpoint}`));
			});

			const result = await fetchWeather();
			expect(result.forecast).toEqual([]);
			expect(result.alerts).toHaveLength(1);
			expect(result.alerts[0].event).toBe('Flood Watch');
		});

		it('still returns forecast when alerts fail', async () => {
			mockRequest.mockImplementation((_service: string, endpoint: string) => {
				if (endpoint.includes('/gridpoints/')) {
					return Promise.resolve(
						wrapResult({
							properties: { periods: [makePeriod({ temperature: 65 })] }
						})
					);
				}
				if (endpoint === '/alerts/active') {
					return Promise.reject(new Error('alerts down'));
				}
				return Promise.reject(new Error(`Unexpected endpoint: ${endpoint}`));
			});

			const result = await fetchWeather();
			expect(result.forecast).toHaveLength(1);
			expect(result.forecast[0].temperature).toBe(65);
			expect(result.alerts).toEqual([]);
		});
	});
});
