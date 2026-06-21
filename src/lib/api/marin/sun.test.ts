import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: vi.fn()
}));

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { fetchSunTimes } from './sun';
import { fetchWithTimeout } from './fetch-helpers';

const mockFetch = vi.mocked(fetchWithTimeout);

function makeResponse(data: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: () => Promise.resolve(data)
	} as Response;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('fetchSunTimes', () => {
	const validApiResponse = {
		status: 'OK',
		results: {
			sunrise: '2024-03-15T14:30:00+00:00',
			sunset: '2024-03-16T02:15:00+00:00',
			solar_noon: '2024-03-15T20:22:00+00:00',
			day_length: 42300,
			civil_twilight_begin: '2024-03-15T14:05:00+00:00',
			civil_twilight_end: '2024-03-16T02:40:00+00:00'
		}
	};

	it('parses valid sun times response', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validApiResponse));

		const result = await fetchSunTimes();

		expect(result).not.toBeNull();
		// Check all fields exist
		expect(result!.sunrise).toBeDefined();
		expect(result!.sunset).toBeDefined();
		expect(result!.solarNoon).toBeDefined();
		expect(result!.dayLength).toBeDefined();
		expect(result!.civilTwilightBegin).toBeDefined();
		expect(result!.civilTwilightEnd).toBeDefined();
	});

	it('formats dayLength from seconds into human-readable string', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validApiResponse));

		const result = await fetchSunTimes();

		// 42300 seconds = 11h 45m
		expect(result!.dayLength).toBe('11h 45m');
	});

	it('formats times using locale time formatting', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validApiResponse));

		const result = await fetchSunTimes();

		// The formatTime function uses toLocaleTimeString with America/Los_Angeles
		// Sunrise is 2024-03-15T14:30 UTC = 7:30 AM PDT
		expect(result!.sunrise).toMatch(/\d{1,2}:\d{2}\s?[AP]M/);
	});

	it('returns null on HTTP error', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(null, false, 500));

		const result = await fetchSunTimes();

		expect(result).toBeNull();
	});

	it('returns null on network error', async () => {
		mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

		const result = await fetchSunTimes();

		expect(result).toBeNull();
	});

	it('returns null when API status is not OK', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse({ status: 'INVALID_REQUEST', results: {} }));

		const result = await fetchSunTimes();

		expect(result).toBeNull();
	});

	it('accepts custom lat/lon parameters', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validApiResponse));

		await fetchSunTimes(38.0, -122.6);

		expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('lat=38&lng=-122.6'));
	});

	it('uses default Marin coordinates when no arguments provided', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validApiResponse));

		await fetchSunTimes();

		expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('lat=37.9735&lng=-122.5311'));
	});

	it('handles edge case of exactly 0 seconds day length', async () => {
		const polar = {
			status: 'OK',
			results: {
				sunrise: '2024-06-21T00:00:00+00:00',
				sunset: '2024-06-21T00:00:00+00:00',
				solar_noon: '2024-06-21T12:00:00+00:00',
				day_length: 0,
				civil_twilight_begin: '2024-06-21T00:00:00+00:00',
				civil_twilight_end: '2024-06-21T00:00:00+00:00'
			}
		};
		mockFetch.mockResolvedValueOnce(makeResponse(polar));

		const result = await fetchSunTimes();

		expect(result!.dayLength).toBe('0h 0m');
	});
});
