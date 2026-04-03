import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: vi.fn()
}));

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('$lib/geo/proximity', () => ({
	isNearMarin: vi.fn()
}));

import { fetchFireIncidents, type FireIncident } from './calfire';
import { fetchWithTimeout } from './fetch-helpers';
import { isNearMarin } from '$lib/geo/proximity';

const mockFetch = vi.mocked(fetchWithTimeout);
const mockIsNearMarin = vi.mocked(isNearMarin);

function makeResponse(data: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: () => Promise.resolve(data)
	} as Response;
}

function makeCalFireFeature(overrides: Partial<{
	id: string;
	name: string;
	lat: number;
	lon: number;
	acres: number;
	containment: number;
	isActive: string;
}> = {}): object {
	return {
		type: 'Feature',
		properties: {
			UniqueId: overrides.id ?? 'fire-001',
			Name: overrides.name ?? 'Mill Fire',
			Location: 'Near Mill Valley',
			County: 'Marin',
			AcresBurned: overrides.acres ?? 500,
			PercentContained: overrides.containment ?? 25,
			Started: '2024-03-01T00:00:00Z',
			Updated: '2024-03-02T12:00:00Z',
			Url: 'https://www.fire.ca.gov/incidents/mill-fire',
			IsActive: overrides.isActive ?? 'true'
		},
		geometry: {
			type: 'Point',
			coordinates: [overrides.lon ?? -122.55, overrides.lat ?? 37.90]
		}
	};
}

function makeNifcFeature(overrides: Partial<{
	id: string;
	name: string;
	lat: number;
	lon: number;
	acres: number;
}> = {}): object {
	return {
		attributes: {
			IrwinID: overrides.id ?? 'nifc-001',
			IncidentName: overrides.name ?? 'Federal Fire',
			POOCounty: 'Marin',
			DailyAcres: overrides.acres ?? 200,
			IncidentSize: 300,
			PercentContained: 10,
			FireDiscoveryDateTime: 1711900000000,
			ModifiedOnDateTime_dt: 1711950000000,
			POOLatitude: overrides.lat ?? 38.05,
			POOLongitude: overrides.lon ?? -122.60
		}
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	// Default: all fires are near Marin
	mockIsNearMarin.mockReturnValue(true);
});

describe('fetchFireIncidents', () => {
	it('parses CAL FIRE features into FireIncident[]', async () => {
		const feature = makeCalFireFeature();
		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [feature] })) // calfire
			.mockResolvedValueOnce(makeResponse({ features: [] })); // nifc

		const result = await fetchFireIncidents();

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: 'calfire-fire-001',
			name: 'Mill Fire',
			county: 'Marin',
			acres: 500,
			containment: 25,
			lat: 37.90,
			lon: -122.55,
			source: 'CAL FIRE',
			isActive: true
		});
	});

	it('parses NIFC features into FireIncident[]', async () => {
		const feature = makeNifcFeature();
		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [] })) // calfire
			.mockResolvedValueOnce(makeResponse({ features: [feature] })); // nifc

		const result = await fetchFireIncidents();

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: 'nifc-nifc-001',
			name: 'Federal Fire',
			source: 'NIFC',
			isActive: true,
			acres: 200
		});
	});

	it('filters out features not near Marin', async () => {
		const near = makeCalFireFeature({ id: 'near', lat: 37.97, lon: -122.53 });
		const far = makeCalFireFeature({ id: 'far', lat: 35.0, lon: -119.0 });

		mockIsNearMarin
			.mockReturnValueOnce(true)  // near
			.mockReturnValueOnce(false); // far

		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [near, far] }))
			.mockResolvedValueOnce(makeResponse({ features: [] }));

		const result = await fetchFireIncidents();

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('calfire-near');
	});

	it('filters out CalFire features with null geometry', async () => {
		const noGeom = {
			type: 'Feature',
			properties: {
				UniqueId: 'no-geom',
				Name: 'Ghost Fire',
				Location: 'Unknown',
				County: 'Marin',
				AcresBurned: 10,
				PercentContained: 0,
				Started: '2024-01-01',
				Updated: '2024-01-01',
				Url: '',
				IsActive: 'true'
			},
			geometry: null
		};

		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [noGeom] }))
			.mockResolvedValueOnce(makeResponse({ features: [] }));

		const result = await fetchFireIncidents();

		expect(result).toHaveLength(0);
	});

	it('filters out NIFC features with null lat/lon', async () => {
		const noCoords = {
			attributes: {
				IrwinID: 'no-coords',
				IncidentName: 'Invisible Fire',
				POOCounty: 'Marin',
				DailyAcres: 50,
				IncidentSize: null,
				PercentContained: null,
				FireDiscoveryDateTime: null,
				ModifiedOnDateTime_dt: null,
				POOLatitude: null,
				POOLongitude: null
			}
		};

		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [] }))
			.mockResolvedValueOnce(makeResponse({ features: [noCoords] }));

		const result = await fetchFireIncidents();

		expect(result).toHaveLength(0);
	});

	it('deduplicates NIFC fire within 5km of a CAL FIRE incident', async () => {
		// Two fires at nearly the same location
		const calFire = makeCalFireFeature({ id: 'cf-1', lat: 38.0, lon: -122.5 });
		const nifcDuplicate = makeNifcFeature({ id: 'nifc-dup', lat: 38.01, lon: -122.51 });

		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [calFire] }))
			.mockResolvedValueOnce(makeResponse({ features: [nifcDuplicate] }));

		const result = await fetchFireIncidents();

		// Should only have the CAL FIRE entry (NIFC is deduplicated)
		expect(result).toHaveLength(1);
		expect(result[0].source).toBe('CAL FIRE');
	});

	it('keeps NIFC fire that is far from any CAL FIRE incident', async () => {
		const calFire = makeCalFireFeature({ id: 'cf-1', lat: 38.0, lon: -122.5 });
		// 50km+ away
		const nifcFar = makeNifcFeature({ id: 'nifc-far', lat: 38.5, lon: -122.0 });

		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [calFire] }))
			.mockResolvedValueOnce(makeResponse({ features: [nifcFar] }));

		const result = await fetchFireIncidents();

		expect(result).toHaveLength(2);
	});

	it('defaults AcresBurned/PercentContained to 0 when null', async () => {
		const feature = makeCalFireFeature();
		(feature as any).properties.AcresBurned = null;
		(feature as any).properties.PercentContained = null;

		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [feature] }))
			.mockResolvedValueOnce(makeResponse({ features: [] }));

		const result = await fetchFireIncidents();

		expect(result[0].acres).toBe(0);
		expect(result[0].containment).toBe(0);
	});

	it('returns empty array when both APIs fail', async () => {
		mockFetch
			.mockRejectedValueOnce(new Error('CAL FIRE down'))
			.mockRejectedValueOnce(new Error('NIFC down'));

		const result = await fetchFireIncidents();

		expect(result).toEqual([]);
	});

	it('uses fallback URL when CalFire Url is empty', async () => {
		const feature = makeCalFireFeature();
		(feature as any).properties.Url = '';

		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [feature] }))
			.mockResolvedValueOnce(makeResponse({ features: [] }));

		const result = await fetchFireIncidents();

		expect(result[0].url).toBe('https://www.fire.ca.gov/incidents');
	});
});
