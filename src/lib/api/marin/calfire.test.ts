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

import { fetchFireIncidents, readFireIncidentsOrThrow } from './calfire';
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
		// The envelope must contain the whole isNearMarin circle (80 km around
		// 37.9735, -122.5311): ~0.72° of latitude and ~0.94° of longitude.
		const [xmin, ymin, xmax, ymax] = url.searchParams.get('geometry')!.split(',').map(Number);
		expect(ymin).toBeLessThanOrEqual(37.9735 - 80 / 111);
		expect(ymax).toBeGreaterThanOrEqual(37.9735 + 80 / 111);
		expect(xmin).toBeLessThanOrEqual(-122.5311 - 80 / 85);
		expect(xmax).toBeGreaterThanOrEqual(-122.5311 + 80 / 85);
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

		// A day after the fixture's start: a sizeless listing that young is still drawn (MAPFRESH1).
		vi.useFakeTimers({ now: Date.parse('2024-03-02T00:00:00Z') });
		try {
			const result = await fetchFireIncidents();
			expect(result[0].acres).toBe(0);
			expect(result[0].containment).toBe(0);
		} finally {
			vi.useRealTimers();
		}
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

describe('readFireIncidentsOrThrow (v2 Outdoors: a failure is never "none near")', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockIsNearMarin.mockReturnValue(true);
	});

	it('throws when either upstream fails, instead of an empty list', async () => {
		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [] }))
			.mockResolvedValueOnce(makeResponse({}, false, 503));
		await expect(readFireIncidentsOrThrow({ now: () => 1_000 })).rejects.toThrow(/503/);

		mockFetch
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(makeResponse({ features: [] }));
		await expect(readFireIncidentsOrThrow({ now: () => 1_000 })).rejects.toThrow(/offline/);
	});

	it('a 200 body without a features array is a failure, not an empty read (Codex desk2 #1)', async () => {
		mockFetch
			.mockResolvedValueOnce(makeResponse({}))
			.mockResolvedValueOnce(makeResponse({ features: [] }));
		await expect(readFireIncidentsOrThrow({ now: () => 1_000 })).rejects.toThrow(/features/);
		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [] }))
			.mockResolvedValueOnce(makeResponse({}));
		await expect(readFireIncidentsOrThrow({ now: () => 1_000 })).rejects.toThrow(/features/);
	});

	it('keeps unknown acreage and containment as null for v2 (legacy keeps its 0) (Codex desk2 #2)', async () => {
		mockFetch
			.mockResolvedValueOnce(
				makeResponse({ features: [makeCalFireFeature({ acres: null, containment: null })] })
			)
			.mockResolvedValueOnce(makeResponse({ features: [] }));
		const [f] = (await readFireIncidentsOrThrow({ now: () => 1_000 })).fires;
		expect([f.acres, f.containment]).toEqual([null, null]);
	});

	it('an ArcGIS error body is a failure too', async () => {
		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [] }))
			.mockResolvedValueOnce(makeResponse({ error: { message: 'bad field' } }));
		await expect(readFireIncidentsOrThrow({ now: () => 1_000 })).rejects.toThrow(/bad field/);
	});

	it('both upstreams answered: the near fires, stamped with the read time, and the owner signal', async () => {
		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: [makeCalFireFeature({ name: 'Dunn' })] }))
			.mockResolvedValueOnce(makeResponse({ features: [] }));
		const owner = new AbortController();
		const read = await readFireIncidentsOrThrow({ signal: owner.signal, now: () => 1_000 });
		expect(read.fires.map((f) => f.name)).toEqual(['Dunn']);
		expect(read.checkedAt).toBe(1_000);
		expect(mockFetch.mock.calls.every(([, init]) => init?.signal === owner.signal)).toBe(true);
	});
});

describe('fire eligibility, per source, before the dedupe (MAPFRESH1)', () => {
	const DAY = 86_400_000;
	const NOW = Date.parse('2026-10-23T20:00:00Z');
	/** WFIGS's live BUNKER listing (2026-10-23): Marin, discovered Jun 14, no size, no containment. */
	const nifc = (attrs: Record<string, unknown> = {}, at = { x: -122.6, y: 38.05 }) => ({
		attributes: {
			IrwinID: 'bunker',
			IncidentName: 'BUNKER',
			POOCounty: 'Marin',
			POOState: 'US-CA',
			IncidentSize: null,
			DiscoveryAcres: null,
			PercentContained: null,
			FireDiscoveryDateTime: Date.parse('2026-06-14T19:00:00Z'),
			ModifiedOnDateTime_dt: Date.parse('2026-10-21T12:00:00Z'),
			FireOutDateTime: null,
			ContainmentDateTime: null,
			ControlDateTime: null,
			...attrs
		},
		geometry: at
	});
	const read = async (calfire: object[], wfigs: object[]) => {
		mockFetch
			.mockResolvedValueOnce(makeResponse({ features: calfire }))
			.mockResolvedValueOnce(makeResponse({ features: wfigs }));
		return readFireIncidentsOrThrow({ now: () => NOW });
	};

	it('asks WFIGS for its terminal dates and discovery acres', async () => {
		await read([], []);
		const url = new URL(String(mockFetch.mock.calls[1][0]));
		const fields = url.searchParams.get('outFields')!.split(',');
		for (const f of ['FireOutDateTime', 'ContainmentDateTime', 'ControlDateTime', 'DiscoveryAcres'])
			expect(fields).toContain(f);
	});

	it('the BUNKER-shaped listing is not drawn: hidden, and said as such', async () => {
		const r = await read([], [nifc()]);
		expect(r.fires).toEqual([]);
		expect(r.hidden).toEqual([
			{
				id: 'nifc-bunker',
				name: 'BUNKER',
				source: 'NIFC',
				discoveredAt: Date.parse('2026-06-14T19:00:00Z')
			}
		]);
	});

	it('the 14-day edge: a sizeless listing 14 days old is drawn, a millisecond older is hidden', async () => {
		const edge = await read([], [nifc({ FireDiscoveryDateTime: NOW - 14 * DAY })]);
		expect(edge.fires.map((f) => f.name)).toEqual(['BUNKER']);
		const past = await read([], [nifc({ FireDiscoveryDateTime: NOW - 14 * DAY - 1 })]);
		expect(past.fires).toEqual([]);
		expect(past.hidden).toHaveLength(1);
	});

	it('a reported 0 is a size: IncidentSize 0 or DiscoveryAcres 0 keeps an old listing drawn', async () => {
		expect((await read([], [nifc({ IncidentSize: 0 })])).fires).toHaveLength(1);
		expect((await read([], [nifc({ DiscoveryAcres: 0 })])).fires).toHaveLength(1);
		expect((await read([], [nifc({ PercentContained: 0 })])).fires).toHaveLength(1);
	});

	it('FireOutDateTime set: the fire is out, not drawn and not hidden', async () => {
		const r = await read([], [nifc({ FireOutDateTime: NOW - DAY, IncidentSize: 40 })]);
		expect(r.fires).toEqual([]);
		expect(r.hidden).toEqual([]);
	});

	it('contained or controlled is not out: drawn, with the word and its date', async () => {
		const contained = await read(
			[],
			[nifc({ ContainmentDateTime: NOW - 2 * DAY, IncidentSize: 40 })]
		);
		expect(contained.fires[0].settled).toEqual({ label: 'contained', at: NOW - 2 * DAY });
		const controlled = await read(
			[],
			[nifc({ ContainmentDateTime: NOW - 3 * DAY, ControlDateTime: NOW - DAY })]
		);
		expect(controlled.fires[0].settled).toEqual({ label: 'controlled', at: NOW - DAY });
		expect(controlled.hidden).toEqual([]);
	});

	it('a missing discovery date stays unknown: never "now", and the listing is drawn', async () => {
		const r = await read([], [nifc({ FireDiscoveryDateTime: null, ModifiedOnDateTime_dt: null })]);
		expect(r.fires).toHaveLength(1);
		expect(r.fires[0].startDate).toBeNull();
		expect(r.fires[0].updatedDate).toBeNull();
	});

	it('CAL FIRE isActive false is not drawn', async () => {
		const r = await read([makeCalFireFeature({ isActive: 'false' })], []);
		expect(r.fires).toEqual([]);
	});

	it('an excluded CAL FIRE record never suppresses the NIFC fire beside it', async () => {
		const r = await read(
			[makeCalFireFeature({ isActive: 'false', lat: 38.05, lon: -122.6 })],
			[nifc({ IncidentSize: 120, FireDiscoveryDateTime: NOW - DAY })]
		);
		expect(r.fires.map((f) => f.id)).toEqual(['nifc-bunker']);
	});

	it('the legacy reader (the TV) draws only eligible fires too', async () => {
		vi.useFakeTimers({ now: NOW });
		try {
			mockFetch
				.mockResolvedValueOnce(
					makeResponse({ features: [makeCalFireFeature({ isActive: 'false' })] })
				)
				.mockResolvedValueOnce(makeResponse({ features: [nifc()] }));
			expect(await fetchFireIncidents()).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});
});
