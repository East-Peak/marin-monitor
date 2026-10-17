import { describe, expect, it } from 'vitest';
import type { DatasetFetch } from './source-adapters';
import type { TrafficCorridorsData } from '$lib/api/marin/traffic-corridors';
import type { CorridorEvent } from '$lib/traffic/corridors';
import type { GasPriceData } from '$lib/types/gas';
import {
	DATA_LAYERS,
	defaultDataLayers,
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
	values: { traffic: null, fire: null, gas: null, ev: null, coffee: null }
};

describe('defaultDataLayers', () => {
	it('traffic, fire and gas start on; EV and coffee start off', () => {
		expect(defaultDataLayers()).toEqual({
			traffic: true,
			fire: true,
			gas: true,
			ev: false,
			coffee: false
		});
	});
});

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

	it.each(DATA_LAYERS.map((l) => l.id))(
		'%s: a failed read is "unavailable", draws nothing and claims no count',
		(id) => {
			const view = v2DataLayers({ ...base, outcomes: failed(id === 'fire' ? 'fires' : id) })[id];
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
