import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchEvChargingData } from './ev-charging';

// Mock $lib/config/api
vi.mock('$lib/config/api', () => ({
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

describe('fetchEvChargingData', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('returns data from a successful fetch', async () => {
		const mockData = {
			current: {
				timestamp: '2026-03-02T06:00:00Z',
				stationCount: 42,
				dcFastStationCount: 12,
				level2StationCount: 38,
				totalPorts: 180,
				networkBreakdown: { ChargePoint: 20, Tesla: 10, EVgo: 8, Other: 4 },
				connectorBreakdown: { J1772: 80, CCS: 40, NACS: 35, CHAdeMO: 25 },
				stations: []
			},
			history: []
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockData)
		});

		const result = await fetchEvChargingData();
		expect(result.current?.stationCount).toBe(42);
		expect(result.current?.dcFastStationCount).toBe(12);
	});

	it('returns empty data on fetch failure', async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500
		});

		const result = await fetchEvChargingData();
		expect(result.current).toBeNull();
		expect(result.history).toEqual([]);
	});

	it('returns empty data on network error', async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		const result = await fetchEvChargingData();
		expect(result.current).toBeNull();
		expect(result.history).toEqual([]);
	});
});
