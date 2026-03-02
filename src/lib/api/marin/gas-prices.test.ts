import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGasPriceData } from './gas-prices';

// Mock $lib/config/api
vi.mock('$lib/config/api', () => ({
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

describe('fetchGasPriceData', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns data from a successful fetch', async () => {
		const mockData = {
			current: {
				timestamp: '2026-03-02T00:00:00Z',
				stationCount: 25,
				avgRegular: 4.599,
				avgMidgrade: 4.899,
				avgPremium: 5.199,
				avgDiesel: 5.099,
				minRegular: 4.199,
				maxRegular: 5.099,
				stations: []
			},
			history: []
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockData)
		});

		const result = await fetchGasPriceData();
		expect(result.current?.stationCount).toBe(25);
		expect(result.current?.avgRegular).toBe(4.599);
	});

	it('returns empty data on fetch failure', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500
		});

		const result = await fetchGasPriceData();
		expect(result.current).toBeNull();
		expect(result.history).toEqual([]);
	});

	it('returns empty data on network error', async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		const result = await fetchGasPriceData();
		expect(result.current).toBeNull();
		expect(result.history).toEqual([]);
	});
});
