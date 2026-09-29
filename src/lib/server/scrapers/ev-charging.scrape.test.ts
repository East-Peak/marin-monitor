import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeout = vi.fn();
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout }));
vi.mock('$lib/server/api-keys', () => ({
	getNrelApiKey: () => 'test-key',
	getOpenChargeMapApiKey: () => ''
}));

const { scrapeEvCharging } = await import('./ev-charging');

function station(id: number, lat = 37.97, lon = -122.53) {
	return {
		id,
		station_name: `Station ${id}`,
		street_address: '1 Main St',
		city: 'San Rafael',
		latitude: lat,
		longitude: lon,
		ev_network: 'ChargePoint Network',
		ev_level2_evse_num: 2,
		ev_dc_fast_num: null,
		ev_connector_types: ['J1772']
	};
}
const tile = (...stations: object[]) =>
	new Response(JSON.stringify({ total_results: stations.length, fuel_stations: stations }), {
		status: 200
	});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('scrapeEvCharging', () => {
	beforeEach(() => fetchWithTimeout.mockReset());

	it('queries the NLR host (developer.nrel.gov was retired and no longer resolves)', async () => {
		fetchWithTimeout.mockImplementation(async () => tile(station(1)));
		await scrapeEvCharging();
		const urls = fetchWithTimeout.mock.calls.map(([url]) => new URL(url as string));
		expect(urls).toHaveLength(4);
		for (const url of urls) {
			expect(url.origin + url.pathname).toBe(
				'https://developer.nlr.gov/api/alt-fuel-stations/v1/nearest.json'
			);
			expect(url.searchParams.get('api_key')).toBe('test-key');
			expect(url.searchParams.get('limit')).toBe('all');
		}
	});

	it('stamps a fresh observation only for a complete scrape', async () => {
		fetchWithTimeout.mockImplementation(async () => tile(station(1), station(2)));
		const snapshot = await scrapeEvCharging();
		expect(snapshot.stationCount).toBe(2);
		expect(snapshot.lastSuccessfulScrapeAt).toBe(snapshot.timestamp);
	});

	it('throws when any tile fails, so partial coverage is never published as fresh', async () => {
		fetchWithTimeout
			.mockResolvedValueOnce(tile(station(1)))
			.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
			.mockImplementation(async () => tile(station(2)));
		await expect(scrapeEvCharging()).rejects.toThrow(/tile/i);
	});

	it('throws when every tile comes back empty', async () => {
		fetchWithTimeout.mockImplementation(async () => tile());
		await expect(scrapeEvCharging()).rejects.toThrow(/0 stations/);
	});

	it.each([
		['has no fuel_stations array', {}],
		['is empty (every Marin tile has stations)', { total_results: 0, fuel_stations: [] }],
		['is truncated (total_results > returned)', { total_results: 201, fuel_stations: [station(9)] }]
	])('throws when one tile %s', async (_, body) => {
		fetchWithTimeout
			.mockImplementationOnce(async () => json(body))
			.mockImplementation(async () => tile(station(1)));
		await expect(scrapeEvCharging()).rejects.toThrow(/tile/i);
	});
});
