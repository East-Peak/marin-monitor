import { describe, expect, it } from 'vitest';
import type { DatasetFetch } from './source-adapters';
import type { TrafficCorridorsData } from '$lib/api/marin/traffic-corridors';
import type { CorridorEvent } from '$lib/traffic/corridors';
import type { GasPriceData } from '$lib/types/gas';
import type { AirportStatus, AirportStatusData } from '$lib/types/airport';
import {
	DATA_LAYERS,
	defaultDataLayers,
	camWedgeFeatures,
	layerFeatures,
	v2DataLayers,
	type DataLayerId
} from './v2-map-layers';

const NOW = Date.parse('2026-10-17T15:00:00Z');
const ok = (id: string): Record<string, DatasetFetch> => ({
	[id]: { kind: 'live', observedAt: NOW - 60_000 }
});
const failed = (id: string): Record<string, DatasetFetch> => ({
	[id]: { kind: 'failed', error: 'HTTP 503', retained: false, observedAt: null }
});
const event = (over: Partial<CorridorEvent>): CorridorEvent => ({
	id: '511.org/1',
	marin: true,
	corridor: null,
	trip: null,
	closed: false,
	lanes: null,
	certain: true,
	kind: 'Traffic Collision',
	road: 'US-101',
	where: 'Northbound at Lucky Dr',
	severity: 'Minor',
	reportedAt: '2026-10-17T14:30:00.000Z',
	at: [-122.51, 37.93],
	...over
});
const TRAFFIC: TrafficCorridorsData = {
	checkedAt: '2026-10-17T14:59:00.000Z',
	upstreamCount: 5,
	unreadable: 0,
	events: [
		event({ id: 'a' }),
		event({ id: 'b', severity: null }),
		event({ id: 'c', at: null }),
		event({ id: 'oak', marin: false, corridor: 'to-oak', at: [-122.3, 37.9] })
	]
} as TrafficCorridorsData;
const GAS: GasPriceData = {
	current: {
		stations: [
			{
				placeId: 'p1',
				name: 'Shell',
				address: '1 Main St, San Rafael',
				lat: 37.97,
				lon: -122.53,
				fuelPrices: [{ type: 'REGULAR_UNLEADED', price: 5.299 }]
			}
		],
		lastSuccessfulScrapeAt: '2026-10-17T14:00:00Z'
	},
	history: []
} as unknown as GasPriceData;
const allOn = Object.fromEntries(DATA_LAYERS.map((l) => [l.id, true])) as Record<
	DataLayerId,
	boolean
>;
const base = {
	on: allOn,
	now: NOW,
	town: null,
	values: {
		traffic: null,
		fire: null,
		gas: null,
		ev: null,
		coffee: null,
		fitness: null,
		airport: null,
		cams: null
	}
};
const airport = (code: string, over: Partial<AirportStatus> = {}): AirportStatus => ({
	code,
	icao: `K${code}`,
	name: code,
	status: 'on-time',
	delays: [],
	weather: null,
	forecastNotes: [],
	tsa: null,
	...over
});
const AIRPORTS: AirportStatusData = {
	lastUpdated: new Date(NOW - 60_000).toISOString(),
	airports: [airport('SFO'), airport('OAK')]
};

describe('v2DataLayers', () => {
	it('traffic: Marin events only, every severity kept, located ones drawn; the rest counted', () => {
		const { traffic } = v2DataLayers({
			...base,
			outcomes: ok('traffic'),
			values: { ...base.values, traffic: TRAFFIC }
		});
		expect(traffic.state).toBe('value');
		expect(traffic.points.map((p) => [p.id, p.props.severity])).toEqual([
			['a', 'MINOR'],
			['b', 'UNKNOWN']
		]);
		expect(traffic.note).toBe('1 event without a location');
	});

	it('an ok read draws its points, with the source and as-of time', () => {
		const { gas } = v2DataLayers({
			...base,
			outcomes: ok('gas'),
			values: { ...base.values, gas: GAS }
		});
		expect(gas).toMatchObject({ state: 'value', asOf: NOW - 60_000, source: 'Google Places' });
		expect(gas.points).toHaveLength(1);
		expect(gas.points[0].detail.meta).toContain('Regular $5.299');
		// Drawn through the shared gas layer: its label property, plus the selection id.
		expect(layerFeatures(gas)[0]).toMatchObject({
			geometry: { type: 'Point', coordinates: [-122.53, 37.97] },
			properties: { name: 'Shell', price: '$5.299', itemId: 'p1' }
		});
	});

	// The cams layer is judged by its heading read, not a dataset outcome (its own tests below).
	it.each(DATA_LAYERS.map((l) => l.id).filter((id) => id !== 'cams'))(
		'%s: a failed read is "unavailable", draws nothing and claims no count',
		(id) => {
			const dataset = DATA_LAYERS.find((l) => l.id === id)!.dataset;
			const view = v2DataLayers({
				...base,
				outcomes: failed(dataset),
				// A failed read with a value still in hand: nothing of it is drawn.
				values: { ...base.values, airport: AIRPORTS }
			})[id];
			expect(view.state).toBe('unavailable');
			expect(view.points).toEqual([]);
			expect(view.count).toBeNull();
		}
	);

	it('traffic with records 511 could not read: says so, and claims no count (Codex MAPX2 #3)', () => {
		const { traffic } = v2DataLayers({
			...base,
			outcomes: ok('traffic'),
			values: { ...base.values, traffic: { ...TRAFFIC, unreadable: 2 } }
		});
		expect(traffic.note).toBe('1 event without a location · 2 records 511 could not read');
		expect(traffic.count).toBeNull();
		expect(traffic.points).toHaveLength(2);
	});

	it('fire, EV and coffee: an ok read draws each item through its shared layer', () => {
		const { fire, ev, coffee } = v2DataLayers({
			...base,
			outcomes: { ...ok('fires'), ...ok('ev'), ...ok('coffee') },
			values: {
				...base.values,
				fire: {
					checkedAt: NOW,
					fires: [
						{
							id: 'f1',
							name: 'Ridge',
							location: 'Nicasio',
							county: 'Marin',
							acres: null,
							containment: 40,
							lat: 38.06,
							lon: -122.7,
							startDate: NOW,
							updatedDate: NOW,
							url: 'https://fire.ca.gov/f1',
							source: 'CAL FIRE',
							isActive: true
						}
					]
				},
				ev: {
					current: {
						stations: [
							{
								stationId: 'e1',
								name: 'Northgate',
								address: '5800 Northgate Dr',
								lat: 38.0,
								lon: -122.54,
								network: 'ChargePoint',
								connectors: [],
								level2Count: 4,
								dcFastCount: 0,
								totalPorts: 4,
								chargingLevels: ['Level2']
							}
						]
					},
					history: []
				} as never,
				coffee: {
					current: {
						shops: [
							{
								id: 'c1',
								name: 'Equator',
								address: '1 Main',
								town: 'Mill Valley',
								lat: 37.9,
								lon: -122.54,
								source: 'manual',
								prices: {}
							}
						]
					},
					history: []
				} as never
			}
		});
		expect(fire.points[0].detail.meta).toEqual([
			'CAL FIRE',
			'Acreage not reported',
			'40% contained'
		]);
		expect(layerFeatures(ev)[0].properties).toMatchObject({ name: 'Northgate', itemId: 'e1' });
		expect(layerFeatures(coffee)[0].properties).toMatchObject({ name: 'Equator', itemId: 'c1' });
		expect([fire.count, ev.count, coffee.count]).toEqual([1, 1, 1]);
	});

	it('a layer switched off draws nothing, whatever its read', () => {
		const { gas } = v2DataLayers({
			...base,
			on: { ...allOn, gas: false },
			outcomes: ok('gas'),
			values: { ...base.values, gas: GAS }
		});
		expect(gas.points).toEqual([]);
		expect(gas.on).toBe(false);
	});

	it('a value kept after a failure is drawn and says so', () => {
		const { gas } = v2DataLayers({
			...base,
			outcomes: {
				gas: { kind: 'failed', error: 'HTTP 503', retained: true, observedAt: NOW - 60_000 }
			},
			values: { ...base.values, gas: GAS }
		});
		expect(gas.points).toHaveLength(1);
		expect(gas.kept).toMatch(/^Kept from /);
	});
});

describe('fitness (MAPX2c)', () => {
	const FITNESS = {
		current: {
			timestamp: '2026-10-01T00:00:00Z',
			lastSuccessfulScrapeAt: '2026-10-01T00:00:00Z',
			studioCount: 1,
			medianPrice: 30,
			avgPrice: 30,
			minPrice: 30,
			maxPrice: 30,
			medianByType: { yoga: 30 },
			studios: [
				{
					id: 'yoga-1',
					name: 'Sun Yoga',
					town: 'Mill Valley',
					type: 'yoga' as const,
					dropInPrice: 30,
					lat: 37.906,
					lon: -122.545
				}
			]
		},
		history: []
	};

	it('an ok read draws each studio through the shared fitness layer, with its drop-in price', () => {
		const { fitness } = v2DataLayers({
			...base,
			outcomes: ok('fitness'),
			values: { ...base.values, fitness: FITNESS }
		});
		expect(fitness).toMatchObject({
			state: 'value',
			source: 'Fitness Drop-in Index',
			asOf: NOW - 60_000,
			count: 1
		});
		expect(fitness.points[0]).toMatchObject({ id: 'yoga-1', title: 'Sun Yoga' });
		expect(fitness.points[0].detail.meta).toEqual(['Fitness Drop-in Index', 'Yoga', 'Drop-in $30']);
		expect(fitness.points[0].detail.paragraphs).toEqual(['Mill Valley']);
		expect(layerFeatures(fitness)[0].properties).toMatchObject({
			name: 'Sun Yoga',
			price: '$30',
			typeName: 'Yoga',
			color: '#a78bfa',
			itemId: 'yoga-1'
		});
	});
});

describe("airports (MAPX2c): Getting Around's reads, in its card's words", () => {
	const read = (data: AirportStatusData, outcome: DatasetFetch = ok('airport').airport) =>
		v2DataLayers({
			...base,
			outcomes: { airport: outcome },
			values: { ...base.values, airport: data }
		}).airport;

	it('a fresh ok read: SFO and OAK pins, each saying "no delays" as the card does', () => {
		const v = read(AIRPORTS);
		expect(v).toMatchObject({
			state: 'value',
			source: 'FAA',
			asOf: NOW - 60_000,
			kept: null,
			count: 2
		});
		expect(v.points.map((p) => [p.id, p.title, p.detail.paragraphs])).toEqual([
			['SFO', 'SFO · San Francisco Intl', ['SFO no delays']],
			['OAK', 'OAK · Oakland Intl', ['OAK no delays']]
		]);
		expect(layerFeatures(v)[0].properties).toMatchObject({
			code: 'SFO',
			statusLabel: 'SFO no delays',
			color: '#22c55e',
			itemId: 'SFO'
		});
	});

	it('a delay keeps the FAA figures, coloured by the FAA status', () => {
		const v = read({
			...AIRPORTS,
			airports: [
				airport('SFO', { status: 'delays', delays: [{ type: 'arrival-delay', avgMinutes: 45 }] }),
				airport('OAK')
			]
		});
		expect(v.points.map((p) => p.detail.paragraphs[0])).toEqual([
			'SFO arrival delays, avg 45 min',
			'OAK no delays reported'
		]);
		expect(layerFeatures(v)[0].properties).toMatchObject({ color: '#f59e0b' });
	});

	it('an airport the FAA could not read is drawn grey and says so, never "no delays"', () => {
		const v = read({
			...AIRPORTS,
			airports: [airport('SFO', { status: 'unknown' }), airport('OAK')]
		});
		expect(v.points.map((p) => p.detail.paragraphs[0])).toEqual([
			'SFO FAA status unavailable',
			'OAK no delays reported'
		]);
		expect(layerFeatures(v)[0].properties).toMatchObject({ color: '#6b7280' });
	});

	it("an out-of-date read: no pins, no count, and the card's words in the row", () => {
		const v = read(AIRPORTS, { kind: 'live', observedAt: NOW - 31 * 60_000 });
		expect(v).toMatchObject({ points: [], count: null, note: 'Airport status out of date' });
		expect(v.state).not.toBe('value');
	});

	it('a value kept after a failed refresh: the card\'s caveat, never "no delays"; no count', () => {
		const v = read(AIRPORTS, {
			kind: 'failed',
			error: 'HTTP 503',
			retained: true,
			observedAt: NOW - 60_000
		});
		for (const p of v.points) expect(p.detail.paragraphs[0]).not.toMatch(/no delays/);
		expect(v.count).toBeNull();
	});

	it('stays drawn with a town chosen: an airport is in no Marin town', () => {
		const v = v2DataLayers({
			...base,
			town: 'mill-valley',
			outcomes: ok('airport'),
			values: { ...base.values, airport: AIRPORTS }
		}).airport;
		expect(v.points).toHaveLength(2);
	});
});

describe('defaults (Stuart, 2026-10-17: "flooding the zone is kind of fun")', () => {
	it('every data layer starts on; only a saved choice turns one off', () => {
		expect(Object.values(defaultDataLayers()).every(Boolean)).toBe(true);
	});
});

describe('cams layer (MAPX4)', () => {
	const heading = (id: string, over: Record<string, unknown> = {}) => ({
		id,
		az: 162.64,
		fov: 65.1,
		patrolling: false,
		frameAt: NOW - 60_000,
		...over
	});
	const run = (cams: unknown) =>
		v2DataLayers({ ...base, outcomes: {}, values: { ...base.values, cams } as never }).cams;
	const okRead = (...list: ReturnType<typeof heading>[]) => ({
		state: 'ok',
		read: { headingAt: NOW - 20_000, cams: list }
	});

	it('pins every ALERTCalifornia camera at our own position, as of the heading read', () => {
		const v = run(okRead(heading('alert-tam-east')));
		expect(v.state).toBe('value');
		expect(v.asOf).toBe(NOW - 20_000);
		expect(v.points.filter((p) => p.id.startsWith('alert-'))).toHaveLength(17);
		const tam = v.points.find((p) => p.id === 'alert-tam-east')!;
		expect([tam.lon, tam.lat]).toEqual([-122.58854, 37.92724]);
		expect(v.count).toBe(21);
	});

	it('pins the four Caltrans cameras where D4 places them (MAPX4b)', () => {
		const v = run(okRead());
		const spencer = v.points.find((p) => p.id === 'caltrans-spencer')!;
		expect([spencer.lon, spencer.lat]).toEqual([-122.48975, 37.85081]);
		expect(v.points.filter((p) => p.id.startsWith('caltrans-'))).toHaveLength(4);
		expect(spencer.detail).toMatchObject({
			title: '101 at Spencer Ave',
			meta: ['Caltrans', 'Facing N · approximate (road direction)'],
			image: { src: expect.stringContaining('tve73us101spenceravenue.jpg'), refreshS: 15 }
		});
	});

	it('a Caltrans wedge is a fixed 60° on its road direction, drawn whatever the heading read', () => {
		for (const cams of [okRead(), { state: 'unavailable', read: null }, null]) {
			const wedges = camWedgeFeatures(run(cams), NOW).filter((w) =>
				String(w.properties?.itemId).startsWith('caltrans-')
			);
			expect(wedges.map((w) => [w.properties?.itemId, w.properties?.style])).toEqual([
				['caltrans-spencer', 'approximate'],
				['caltrans-sr1', 'approximate'],
				['caltrans-580', 'approximate'],
				['caltrans-ignacio', 'approximate']
			]);
		}
	});

	it("the detail is the latest frame, refreshed every 15 s, with the camera's own credit", () => {
		const tam = run(okRead(heading('alert-tam-east'))).points.find(
			(p) => p.id === 'alert-tam-east'
		)!;
		expect(tam.detail.image).toEqual({
			src: 'https://cameras.alertcalifornia.org/public-camera-data/Axis-TamEast/latest-frame.jpg',
			alt: 'Latest frame from Mt. Tam East',
			refreshS: 15
		});
		expect(tam.detail.meta[0]).toBe('ALERTCalifornia | UC San Diego');
		expect(tam.detail.meta).toContain('Last reported heading: SSE (163°) · 7:59 AM');
	});

	it('wedges: solid when fresh and still, dashed while sweeping, none when stale', () => {
		const v = run(
			okRead(
				heading('alert-tam-east'),
				heading('alert-tam-west', { patrolling: true }),
				heading('alert-bolinas', { frameAt: NOW - 6 * 60_000 })
			)
		);
		const wedges = camWedgeFeatures(v, NOW);
		expect(
			wedges
				.filter((w) => String(w.properties?.itemId).startsWith('alert-'))
				.map((w) => [w.properties?.itemId, w.properties?.style])
		).toEqual([
			['alert-tam-east', 'solid'],
			['alert-tam-west', 'sweeping']
		]);
		expect(wedges[0].geometry.type).toBe('Polygon');
	});

	it("a stale frame: no wedge, and the camera's detail says why (CAMQUIET1)", () => {
		const v = run(
			okRead(heading('alert-tam-east'), heading('alert-vision', { frameAt: NOW - 11 * 60_000 }))
		);
		const ids = camWedgeFeatures(v, NOW).map((w) => w.properties?.itemId);
		expect(ids).toContain('alert-tam-east');
		expect(ids).not.toContain('alert-vision');
		const vision = v.points.find((p) => p.id === 'alert-vision')!;
		expect(vision.detail.status).toBe('No direction drawn: last frame 11 min ago');
		expect(v.points.find((p) => p.id === 'alert-tam-east')!.detail.status).toBeUndefined();
		// Heard nothing from the feed about it: unavailable, said the same way.
		expect(v.points.find((p) => p.id === 'alert-bolinas')!.detail.status).toBe(
			'No direction drawn: heading unavailable'
		);
	});

	it('the legend says the wedge is direction, not reach', () => {
		expect(run(okRead(heading('alert-tam-east'))).note).toBe(
			'Wedge: direction of view, not how far it sees · Caltrans wedges are approximate (road direction)'
		);
	});

	it('a failed heading read: unavailable, no wedges, the cameras still open', () => {
		const v = run({ state: 'unavailable', read: null });
		expect(v.state).toBe('unavailable');
		expect(v.points).toHaveLength(21);
		expect(v.count).toBeNull();
		expect(v.note).toBe('ALERTCalifornia directions unavailable; the cameras still open');
		expect(
			camWedgeFeatures(v, NOW).filter((w) => String(w.properties?.itemId).startsWith('alert-'))
		).toEqual([]);
		expect(v.points[0].detail.meta).toContain('Heading unavailable');
	});

	it('not read yet: loading; switched off: nothing drawn', () => {
		expect(run(null).state).toBe('loading');
		const off = v2DataLayers({
			...base,
			outcomes: {},
			on: { ...allOn, cams: false },
			values: { ...base.values, cams: okRead(heading('alert-tam-east')) } as never
		}).cams;
		expect(off.points).toEqual([]);
		expect(camWedgeFeatures(off, NOW)).toEqual([]);
	});
});
