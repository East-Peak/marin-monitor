import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: vi.fn()
}));

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { fetchHousingData, type HousingMetric } from './housing';
import { fetchWithTimeout } from './fetch-helpers';

const mockFetch = vi.mocked(fetchWithTimeout);

function makeResponse(data: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: () => Promise.resolve(data)
	} as Response;
}

function makeMonthlyData(count: number): HousingMetric[] {
	return Array.from({ length: count }, (_, i) => ({
		month: `2024-${String(i + 1).padStart(2, '0')}`,
		medianPrice: 1500000 + i * 10000,
		medianPpsf: 800 + i * 5,
		inventory: 200 + i * 10,
		daysOnMarket: 30 - i,
		homesSold: 100 + i * 5
	}));
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('fetchHousingData', () => {
	it('returns parsed housing metrics', async () => {
		const data = makeMonthlyData(12);
		mockFetch.mockResolvedValueOnce(makeResponse(data));

		const result = await fetchHousingData();

		expect(result).toHaveLength(12);
		expect(result[0]).toMatchObject({
			month: '2024-01',
			medianPrice: 1500000,
			medianPpsf: 800,
			inventory: 200,
			daysOnMarket: 30,
			homesSold: 100
		});
	});

	it('slices to last 12 months when data has more', async () => {
		const data = makeMonthlyData(24);
		mockFetch.mockResolvedValueOnce(makeResponse(data));

		const result = await fetchHousingData();

		expect(result).toHaveLength(12);
		// Should be months 13-24 (the last 12)
		expect(result[0].month).toBe('2024-13');
		expect(result[11].month).toBe('2024-24');
	});

	it('returns all data when fewer than 12 months available', async () => {
		const data = makeMonthlyData(6);
		mockFetch.mockResolvedValueOnce(makeResponse(data));

		const result = await fetchHousingData();

		expect(result).toHaveLength(6);
	});

	it('returns empty array on HTTP error', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(null, false, 404));

		const result = await fetchHousingData();

		expect(result).toEqual([]);
	});

	it('returns empty array on network error', async () => {
		mockFetch.mockRejectedValueOnce(new Error('Fetch failed'));

		const result = await fetchHousingData();

		expect(result).toEqual([]);
	});

	it('returns empty array when API returns empty list', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse([]));

		const result = await fetchHousingData();

		expect(result).toEqual([]);
	});

	it('handles null fields in housing metrics', async () => {
		const data: HousingMetric[] = [
			{
				month: '2024-01',
				medianPrice: null,
				medianPpsf: null,
				inventory: null,
				daysOnMarket: null,
				homesSold: null
			}
		];
		mockFetch.mockResolvedValueOnce(makeResponse(data));

		const result = await fetchHousingData();

		expect(result).toHaveLength(1);
		expect(result[0].medianPrice).toBeNull();
		expect(result[0].inventory).toBeNull();
	});

	it('fetches from the correct endpoint', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse([]));

		await fetchHousingData();

		expect(mockFetch).toHaveBeenCalledWith('/api/data/housing');
	});

	it('slice(-12) returns correct window for exactly 12 months', async () => {
		const data = makeMonthlyData(12);
		mockFetch.mockResolvedValueOnce(makeResponse(data));

		const result = await fetchHousingData();

		expect(result).toHaveLength(12);
		expect(result[0].month).toBe('2024-01');
		expect(result[11].month).toBe('2024-12');
	});
});
