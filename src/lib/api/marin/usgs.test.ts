import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EarthquakeData } from '$lib/types';

// Mock serviceClient before importing the module
vi.mock('$lib/services/client', () => ({
	serviceClient: {
		request: vi.fn()
	}
}));

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('$lib/config/towns', () => ({
	MARIN_CENTER: { lat: 37.9735, lon: -122.5311 }
}));

import { fetchEarthquakes, earthquakesToNewsItems } from './usgs';
import { serviceClient } from '$lib/services/client';

const mockRequest = vi.mocked(serviceClient.request);

beforeEach(() => {
	vi.clearAllMocks();
});

describe('fetchEarthquakes', () => {
	const validResponse = {
		fromCache: false as const,
		data: {
			features: [
				{
					id: 'nc12345',
					properties: {
						mag: 3.2,
						place: '5km NW of San Rafael, CA',
						time: 1711900000000,
						url: 'https://earthquake.usgs.gov/earthquakes/eventpage/nc12345',
						title: 'M 3.2 - 5km NW of San Rafael, CA',
						type: 'earthquake'
					},
					geometry: { coordinates: [-122.55, 37.99, 8.5] }
				},
				{
					id: 'nc67890',
					properties: {
						mag: 2.1,
						place: '10km E of Bolinas, CA',
						time: 1711800000000,
						url: 'https://earthquake.usgs.gov/earthquakes/eventpage/nc67890',
						title: 'M 2.1 - 10km E of Bolinas, CA',
						type: 'earthquake'
					},
					geometry: { coordinates: [-122.68, 37.91, 12.3] }
				}
			]
		}
	};

	it('parses valid USGS response into EarthquakeData[]', async () => {
		mockRequest.mockResolvedValueOnce(validResponse);

		const result = await fetchEarthquakes();

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			id: 'nc12345',
			magnitude: 3.2,
			place: '5km NW of San Rafael, CA',
			time: 1711900000000,
			lat: 37.99,
			lon: -122.55,
			depth: 8.5,
			url: 'https://earthquake.usgs.gov/earthquakes/eventpage/nc12345'
		});
	});

	it('maps lon/lat/depth from coordinates array correctly (lon=0, lat=1, depth=2)', async () => {
		mockRequest.mockResolvedValueOnce(validResponse);

		const result = await fetchEarthquakes();
		// coordinates are [lon, lat, depth]
		expect(result[1].lon).toBe(-122.68);
		expect(result[1].lat).toBe(37.91);
		expect(result[1].depth).toBe(12.3);
	});

	it('returns empty array on network error', async () => {
		mockRequest.mockRejectedValueOnce(new Error('Network timeout'));

		const result = await fetchEarthquakes();

		expect(result).toEqual([]);
	});

	it('returns empty array when features is empty', async () => {
		mockRequest.mockResolvedValueOnce({ fromCache: false as const, data: { features: [] } });

		const result = await fetchEarthquakes();

		expect(result).toEqual([]);
	});

	it('returns empty array on HTTP error', async () => {
		mockRequest.mockRejectedValueOnce(new Error('HTTP 500'));

		const result = await fetchEarthquakes();

		expect(result).toEqual([]);
	});
});

describe('earthquakesToNewsItems', () => {
	const quakes: EarthquakeData[] = [
		{
			id: 'nc12345',
			magnitude: 4.1,
			place: '3km S of Novato, CA',
			time: 1711900000000,
			lat: 38.08,
			lon: -122.57,
			depth: 6.2,
			url: 'https://earthquake.usgs.gov/earthquakes/eventpage/nc12345'
		},
		{
			id: 'nc22222',
			magnitude: 2.5,
			place: '8km W of Mill Valley, CA',
			time: 1711800000000,
			lat: 37.91,
			lon: -122.6,
			depth: 10.0,
			url: 'https://earthquake.usgs.gov/earthquakes/eventpage/nc22222'
		}
	];

	it('converts earthquake data to NewsItem format', () => {
		const items = earthquakesToNewsItems(quakes);

		expect(items).toHaveLength(2);
		expect(items[0].id).toBe('usgs-nc12345');
		expect(items[0].source).toBe('USGS');
		expect(items[0].category).toBe('safety');
		expect(items[0].verification).toBe('official');
	});

	it('formats title with magnitude and place', () => {
		const items = earthquakesToNewsItems(quakes);

		expect(items[0].title).toBe('M4.1 Earthquake \u2013 3km S of Novato, CA');
	});

	it('formats description with magnitude and depth', () => {
		const items = earthquakesToNewsItems(quakes);

		expect(items[0].description).toBe('Magnitude 4.1 at 6.2km depth');
	});

	it('sets isAlert=true for magnitude >= 3.5', () => {
		const items = earthquakesToNewsItems(quakes);

		expect(items[0].isAlert).toBe(true); // 4.1
		expect(items[1].isAlert).toBe(false); // 2.5
	});

	it('preserves lat/lon on NewsItems', () => {
		const items = earthquakesToNewsItems(quakes);

		expect(items[0].lat).toBe(38.08);
		expect(items[0].lon).toBe(-122.57);
	});

	it('handles empty array', () => {
		const items = earthquakesToNewsItems([]);
		expect(items).toEqual([]);
	});
});
