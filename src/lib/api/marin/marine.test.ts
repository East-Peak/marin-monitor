import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: vi.fn()
}));

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { fetchMarineSnapshot, fetchMarineOutlook, fetchMarineHourly } from './marine';
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
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('fetchMarineSnapshot', () => {
	it('returns a snapshot with wave data for the closest hour', async () => {
		// Use a fixed time and provide times that exactly match
		const nowMs = new Date('2024-03-15T12:00:00Z').getTime();
		vi.setSystemTime(nowMs);

		// Provide 3 hourly times, middle one matching "now" exactly
		const times = [
			'2024-03-15T11:00:00Z',
			'2024-03-15T12:00:00Z',
			'2024-03-15T13:00:00Z'
		];

		mockFetch.mockResolvedValueOnce(
			makeResponse({
				hourly: {
					time: times,
					wave_height: [1.0, 1.5, 2.0],
					swell_wave_height: [0.8, 1.2, 1.6],
					swell_wave_period: [10, 12, 14],
					swell_wave_direction: [270, 280, 290]
				}
			})
		);

		const result = await fetchMarineSnapshot();

		expect(result).not.toBeNull();
		// Should pick index 1 (closest to now)
		expect(result!.waveHeight).toBe(1.5);
		expect(result!.swellHeight).toBe(1.2);
		expect(result!.swellPeriod).toBe(12);
		expect(result!.swellDirection).toBe(280);
	});

	it('computes next12hMaxSwell from hours after current index', async () => {
		const nowMs = new Date('2024-03-15T00:00:00Z').getTime();
		vi.setSystemTime(nowMs);

		// 14 hours of data, starting at midnight UTC
		const times = Array.from({ length: 14 }, (_, i) => {
			const d = new Date(nowMs + i * 3600000);
			return d.toISOString(); // full ISO with Z
		});
		const swellHeights = [1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6];

		mockFetch.mockResolvedValueOnce(
			makeResponse({
				hourly: {
					time: times,
					wave_height: times.map(() => 1),
					swell_wave_height: swellHeights,
					swell_wave_period: times.map(() => 10),
					swell_wave_direction: times.map(() => 270)
				}
			})
		);

		const result = await fetchMarineSnapshot();

		// Index 0 is closest to now. Next 12h = indices 0..11.
		// Max swell in indices 0..11 = max(1,2,3,4,5,4,3,2,1,2,3,4) = 5
		expect(result!.next12hMaxSwell).toBe(5);
	});

	it('computes next12hPeakDirection from highest swell in 12h window', async () => {
		const nowMs = new Date('2024-03-15T00:00:00Z').getTime();
		vi.setSystemTime(nowMs);

		const times = Array.from({ length: 6 }, (_, i) =>
			new Date(nowMs + i * 3600000).toISOString()
		);

		mockFetch.mockResolvedValueOnce(
			makeResponse({
				hourly: {
					time: times,
					wave_height: [1, 1, 1, 1, 1, 1],
					swell_wave_height: [1, 3, 2, 5, 1, 1],
					swell_wave_period: [10, 10, 10, 10, 10, 10],
					swell_wave_direction: [270, 280, 290, 300, 310, 320]
				}
			})
		);

		const result = await fetchMarineSnapshot();

		// Highest swell is at index 3 (height 5), direction at index 3 is 300
		expect(result!.next12hPeakDirection).toBe(300);
	});

	it('returns null when hourly times array is empty', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({ hourly: { time: [] } })
		);

		const result = await fetchMarineSnapshot();

		expect(result).toBeNull();
	});

	it('returns null on HTTP error', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(null, false, 500));

		const result = await fetchMarineSnapshot();

		expect(result).toBeNull();
	});

	it('returns null on network error', async () => {
		mockFetch.mockRejectedValueOnce(new Error('Network error'));

		const result = await fetchMarineSnapshot();

		expect(result).toBeNull();
	});

	it('handles missing optional fields with null', async () => {
		const nowMs = new Date('2024-03-15T00:00:00Z').getTime();
		vi.setSystemTime(nowMs);

		mockFetch.mockResolvedValueOnce(
			makeResponse({
				hourly: {
					time: [new Date(nowMs).toISOString()]
					// No wave_height, swell_wave_height etc.
				}
			})
		);

		const result = await fetchMarineSnapshot();

		expect(result).not.toBeNull();
		expect(result!.waveHeight).toBeNull();
		expect(result!.swellHeight).toBeNull();
		expect(result!.swellPeriod).toBeNull();
		expect(result!.swellDirection).toBeNull();
	});

	it('returns null for next12hMaxSwell when no swell data exists', async () => {
		const nowMs = new Date('2024-03-15T00:00:00Z').getTime();
		vi.setSystemTime(nowMs);

		mockFetch.mockResolvedValueOnce(
			makeResponse({
				hourly: {
					time: [new Date(nowMs).toISOString()],
					wave_height: [1.5]
					// no swell_wave_height
				}
			})
		);

		const result = await fetchMarineSnapshot();

		expect(result!.next12hMaxSwell).toBeNull();
	});
});

describe('fetchMarineOutlook', () => {
	it('parses daily forecast data', async () => {
		const dailyData = {
			daily: {
				time: ['2024-03-15', '2024-03-16', '2024-03-17'],
				wave_height_max: [2.5, 3.0, 1.8],
				swell_wave_height_max: [2.0, 2.5, 1.5],
				swell_wave_period_max: [12, 14, 10],
				swell_wave_direction_dominant: [270, 285, 260]
			}
		};

		mockFetch.mockResolvedValueOnce(makeResponse(dailyData));

		const result = await fetchMarineOutlook(3);

		expect(result).toHaveLength(3);
		expect(result[0]).toEqual({
			date: '2024-03-15',
			waveHeightMax: 2.5,
			swellHeightMax: 2.0,
			swellPeriodMax: 12,
			swellDirectionDominant: 270
		});
	});

	it('returns empty array on error', async () => {
		mockFetch.mockRejectedValueOnce(new Error('API down'));

		const result = await fetchMarineOutlook();

		expect(result).toEqual([]);
	});

	it('handles missing daily fields with null', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({
				daily: {
					time: ['2024-03-15']
					// No other fields
				}
			})
		);

		const result = await fetchMarineOutlook(1);

		expect(result).toHaveLength(1);
		expect(result[0].waveHeightMax).toBeNull();
		expect(result[0].swellHeightMax).toBeNull();
	});

	it('returns empty array on HTTP error', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(null, false, 503));

		const result = await fetchMarineOutlook();

		expect(result).toEqual([]);
	});
});

describe('fetchMarineHourly', () => {
	it('returns the requested number of hourly points starting from now', async () => {
		const nowMs = new Date('2024-03-15T06:00:00Z').getTime();
		vi.setSystemTime(nowMs);

		const times = Array.from({ length: 48 }, (_, i) =>
			new Date(new Date('2024-03-15T00:00:00Z').getTime() + i * 3600000).toISOString()
		);
		const vals = times.map((_, i) => 1.0 + i * 0.1);

		mockFetch.mockResolvedValueOnce(
			makeResponse({
				hourly: {
					time: times,
					wave_height: vals,
					swell_wave_height: vals,
					swell_wave_period: vals,
					swell_wave_direction: vals
				}
			})
		);

		const result = await fetchMarineHourly(6);

		expect(result).toHaveLength(6);
		// First result should be at hour 6 (index 6)
		expect(result[0].waveHeight).toBeCloseTo(1.0 + 6 * 0.1);
	});

	it('returns empty array on error', async () => {
		mockFetch.mockRejectedValueOnce(new Error('Timeout'));

		const result = await fetchMarineHourly();

		expect(result).toEqual([]);
	});

	it('returns empty array when times are empty', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({ hourly: { time: [] } })
		);

		const result = await fetchMarineHourly();

		expect(result).toEqual([]);
	});
});
