import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: vi.fn()
}));

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('$lib/geo/proximity', () => ({
	isNearMarin: vi.fn()
}));

import { fetchFireIncidents } from './calfire';
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

function makeCalFireFeature(
	overrides: Partial<{
		id: string;
		name: string;
		lat: number;
		lon: number;
		acres: number | null;
		containment: number | null;
		url: string;
		isActive: string;
	}> = {}
): object {
	return {
		type: 'Feature',
		properties: {
			UniqueId: overrides.id ?? 'fire-001',
			Name: overrides.name ?? 'Mill Fire',
			Location: 'Near Mill Valley',
			County: 'Marin',
			AcresBurned: overrides.acres !== undefined ? overrides.acres : 500,
			PercentContained: overrides.containment !== undefined ? overrides.containment : 25,
			Started: '2024-03-01T00:00:00Z',
			Updated: '2024-03-02T12:00:00Z',
			Url:
				overrides.url !== undefined ? overrides.url : 'https://www.fire.ca.gov/incidents/mill-fire',
			IsActive: overrides.isActive ?? 'true'
		},
		geometry: {
			type: 'Point',
			coordinates: [overrides.lon ?? -122.55, overrides.lat ?? 37.9]
		}
	};
}

function makeNifcFeature(
	overrides: Partial<{
		id: string;
		name: string;
		lat: number;
		lon: number;
		acres: number;
	}> = {}
): object {
	// Live WFIGS shape (2026): the point is in `geometry`; POOLatitude/POOLongitude
	// and DailyAcres no longer exist.
	return {
		attributes: {
			IrwinID: overrides.id ?? 'nifc-001',
			IncidentName: overrides.name ?? 'Federal Fire',
			POOCounty: 'Marin',
			POOState: 'US-CA',
			IncidentSize: overrides.acres ?? 200,
			DiscoveryAcres: 1,
			PercentContained: 10,
			FireDiscoveryDateTime: 1711900000000,
			ModifiedOnDateTime_dt: 1711950000000
		},
		geometry: { x: overrides.lon ?? -122.6, y: overrides.lat ?? 38.05 }
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
			lat: 37.9,
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
			.mockReturnValueOnce(true) // near
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

	it('filters out NIFC features with no geometry', async () => {
		const feature = { ...makeNifcFeature(), geometry: null };
		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [] }))
			.mockResolvedValueOnce(makeResponse({ features: [feature] }));
		expect(await fetchFireIncidents()).toEqual([]);
	});

	it('queries WFIGS by the current POOState field inside a Marin envelope, in WGS84', async () => {
		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [] }))
			.mockResolvedValueOnce(makeResponse({ features: [] }));
		await fetchFireIncidents();
		const url = new URL(String(mockFetch.mock.calls[1][0]));
		// Current (active) incidents: the YearToDate layer never marks fires out.
		expect(url.pathname).toContain('/WFIGS_Incident_Locations_Current/');
		expect(url.searchParams.get('where')).toBe("POOState='US-CA'");
		expect(url.searchParams.get('geometryType')).toBe('esriGeometryEnvelope');
		expect(url.searchParams.get('inSR')).toBe('4326');
		expect(url.searchParams.get('outSR')).toBe('4326');
		const [xmin, ymin, xmax, ymax] = url.searchParams.get('geometry')!.split(',').map(Number);
		expect(xmin).toBeLessThan(-122.6);
		expect(xmax).toBeGreaterThan(-122.6);
		expect(ymin).toBeLessThan(38.05);
		expect(ymax).toBeGreaterThan(38.05);
	});

	it('treats an ArcGIS error envelope (HTTP 200 + error) as a failure, not as "no fires"', async () => {
		const { logger } = await import('$lib/config/api');
		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [] }))
			.mockResolvedValueOnce(
				makeResponse({ error: { code: 400, message: 'Invalid field: attr_POOState' } })
			);
		expect(await fetchFireIncidents()).toEqual([]);
		expect(logger.warn).toHaveBeenCalledWith('NIFC', expect.stringContaining('attr_POOState'));
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
		const feature = makeCalFireFeature({ acres: null, containment: null });

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
		const feature = makeCalFireFeature({ url: '' });

		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [feature] }))
			.mockResolvedValueOnce(makeResponse({ features: [] }));

		const result = await fetchFireIncidents();

		expect(result[0].url).toBe('https://www.fire.ca.gov/incidents');
	});
});
