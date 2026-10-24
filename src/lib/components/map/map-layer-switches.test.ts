import { describe, expect, it } from 'vitest';
import type { NewsItem, Town } from '$lib/types';
import {
	applyOwnedPlaces,
	OWNED_MAP_LAYERS,
	alertPulseFeatures,
	applyAirportSwitch,
	layerItems,
	markRetained,
	optionalReads,
	placeLayersOn,
	storeNews,
	syncCounts,
	townCounted,
	trafficVisibility,
	type OwnedLayerData
} from './map-layer-switches';
import { retainedDim } from './map-layers';

const town: Town = {
	name: 'San Rafael',
	slug: 'san-rafael',
	lat: 37.97,
	lon: -122.53,
	incorporated: true,
	region: 'San Rafael'
};
const item = (id: string, over: Partial<NewsItem> = {}): NewsItem => ({
	id,
	title: id,
	link: '',
	timestamp: 0,
	source: 's',
	category: 'local',
	verification: 'local_media',
	...over
});
const flagged = item('x', {
	title: 'To report a parking violation (red zone, fire lane), call the police',
	category: 'civic',
	townSlug: 'san-rafael',
	isAlert: true
});
const owned = (over: Partial<OwnedLayerData> = {}): OwnedLayerData => ({
	revision: 1,
	news: [],
	threeOneOne: [],
	retained: { news: new Set(), threeOneOne: false, earthquakes: false },
	...over
});
const pt = (id: string): GeoJSON.Feature => ({
	type: 'Feature',
	id,
	properties: { id },
	geometry: { type: 'Point', coordinates: [0, 0] }
});

describe('map layer switches (legacy defaults on; v2 switches them off)', () => {
	it('alert pulses: legacy keeps the keyword pulse; switched off there is none', () => {
		expect(alertPulseFeatures(true, [flagged], null, { 'san-rafael': town })).toHaveLength(1);
		expect(alertPulseFeatures(false, [flagged], null, { 'san-rafael': town })).toEqual([]);
	});
	it('optional reads and traffic visibility follow the switches', () => {
		expect(optionalReads({ airports: false, trafficEvents: false })).toEqual({
			traffic: false,
			airports: false
		});
		expect(trafficVisibility(false, true, true)).toEqual({ congestion: 'none', events: 'none' });
		expect(trafficVisibility(true, true, false)).toEqual({ congestion: 'visible', events: 'none' });
	});
});

describe('airports switched off draw nothing (Codex 9a2 #1)', () => {
	const fakeMap = () => {
		const calls: string[] = [];
		const layers = new Set(['airports-layer', 'airports-hit-layer', 'airports-label']);
		return {
			calls,
			getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
			getSource: (id: string) =>
				id === 'airports'
					? { setData: (d: GeoJSON.FeatureCollection) => calls.push(`data:${d.features.length}`) }
					: undefined,
			setLayoutProperty: (id: string, prop: string, value: string) =>
				calls.push(`${id}.${prop}=${value}`)
		};
	};
	it('off: the seeded pins are cleared and all three airport layers hidden', () => {
		const map = fakeMap();
		applyAirportSwitch(map, false);
		expect(map.calls).toEqual([
			'data:0',
			'airports-layer.visibility=none',
			'airports-hit-layer.visibility=none',
			'airports-label.visibility=none'
		]);
	});
	it('on (legacy): untouched', () => {
		const map = fakeMap();
		applyAirportSwitch(map, true);
		expect(map.calls).toEqual([]);
	});
});

describe('owner-supplied layer data (Codex r3 #1)', () => {
	it('an owner’s (even empty) data wins over an inherited store; without one, legacy reads the store', () => {
		const inherited = [item('legacy-left-this')];
		expect(
			layerItems(
				owned(),
				(d) => d.news,
				() => inherited
			)
		).toEqual([]);
		expect(
			layerItems(
				undefined,
				(d) => d.news,
				() => inherited
			)
		).toEqual(inherited);
	});
	it('an owner-driven map draws no place layers, and offers no toggle for them', () => {
		expect(placeLayersOn(owned())).toBe(false);
		expect(placeLayersOn(undefined)).toBe(true);
		for (const l of ['gas', 'ev-charging', 'coffee', 'fitness'] as const)
			expect(OWNED_MAP_LAYERS).not.toContain(l);
		expect(OWNED_MAP_LAYERS).toEqual(expect.arrayContaining(['news', 'safety', 'civic', '311']));
	});
	it('retained features carry the flag; others stay unflagged (legacy paint unchanged)', () => {
		const [a, b] = markRetained([pt('a'), pt('b')], (f) => f.id === 'a');
		expect(a.properties).toMatchObject({ id: 'a', retained: true });
		expect(b.properties).toEqual({ id: 'b' });
	});
	it('the layer dims only flagged features: legacy features have no flag', () => {
		expect(retainedDim(0.9)).toEqual(['case', ['==', ['get', 'retained'], true], 0.4, 0.9]);
	});
	it('sync counts report each source and its retained subset (the e2e hook)', () => {
		const news = markRetained([pt('a'), pt('b')], (f) => f.id === 'b');
		expect(syncCounts({ 'news-pins': news, 'alert-pulses': [] })).toEqual({
			'news-pins': 2,
			'news-pins:retained': 1,
			'alert-pulses': 0,
			'alert-pulses:retained': 0
		});
	});
});

describe('owned data layers (MAPX2b)', () => {
	const point = (id: string): GeoJSON.Feature => ({
		type: 'Feature',
		properties: { itemId: id },
		geometry: { type: 'Point', coordinates: [-122.5, 37.9] }
	});
	function fakeMap() {
		const data: Record<string, unknown> = {};
		const vis: Record<string, string> = {};
		const layers = [
			{ id: 'traffic-events-layer', source: 'traffic-events' },
			{ id: 'traffic-events-hit-layer', source: 'traffic-events' },
			{ id: 'gas-stations-layer', source: 'gas-stations' },
			{ id: 'gas-stations-label', source: 'gas-stations' },
			{ id: 'fire-incidents-layer', source: 'fire-incidents' },
			{ id: 'ev-charging-stations-layer', source: 'ev-charging-stations' },
			{ id: 'coffee-shops-layer', source: 'coffee-shops' },
			{ id: 'fitness-studios-label', source: 'fitness-studios' },
			{ id: 'airports-hit-layer', source: 'airports' }
		];
		return {
			data,
			vis,
			getStyle: () => ({ layers }),
			getSource: (id: string) => ({ setData: (d: unknown) => (data[id] = d) }),
			setLayoutProperty: (id: string, _p: 'visibility', v: string) => (vis[id] = v)
		};
	}
	it('draws each layer from the owner, never a shared store, and shows its layers', () => {
		const map = fakeMap();
		const counts = applyOwnedPlaces(map, {
			traffic: [point('a'), point('b')],
			fire: [],
			gas: [point('g')],
			ev: [],
			coffee: [],
			fitness: [point('y')],
			airport: [point('SFO'), point('OAK')],
			cams: [point('alert-tam-east')],
			camWedges: [point('alert-tam-east')],
			shows: [point('venue:macs')],
			blotter: [],
			stories: [point('bay')]
		});
		expect(counts).toEqual({
			'traffic-events': 2,
			'fire-incidents': 0,
			'gas-stations': 1,
			'ev-charging-stations': 0,
			'coffee-shops': 0,
			'fitness-studios': 1,
			airports: 2,
			cameras: 1,
			'camera-wedges': 1,
			'show-venues': 1,
			'blotter-towns': 0,
			'story-places': 1
		});
		expect(map.vis['fitness-studios-label']).toBe('visible');
		expect(map.vis['airports-hit-layer']).toBe('visible');
		expect((map.data['traffic-events'] as GeoJSON.FeatureCollection).features).toHaveLength(2);
		expect(map.vis['gas-stations-label']).toBe('visible');
		expect(map.vis['traffic-events-hit-layer']).toBe('visible');
	});
});

describe('stories placed by their headline leave the town counts (NEWSPIN2)', () => {
	const item = (id: string): NewsItem => ({
		id,
		title: id,
		link: '',
		timestamp: 0,
		source: 'Marin IJ',
		category: 'local',
		verification: 'local_media',
		townSlug: 'tomales'
	});
	it('v2: a placed story is not counted on its town; the rest are', () => {
		const owned = { placed: new Set(['bay']) } as unknown as OwnedLayerData;
		expect(townCounted([item('bay'), item('town')], owned).map((i) => i.id)).toEqual(['town']);
	});
	it('legacy and /tv (no owner) count every story, as before', () => {
		expect(townCounted([item('bay'), item('town')], undefined).map((i) => i.id)).toEqual([
			'bay',
			'town'
		]);
	});
});

describe("the TV's store stories, within the map's window (MAPFRESH1)", () => {
	const NOW = Date.parse('2026-10-23T20:00:00Z');
	const DAY = 86_400_000;
	const stories = [
		item('fresh', { timestamp: NOW - DAY }),
		item('burn', { timestamp: NOW - 30 * DAY }),
		item('undated', { timestamp: Number.NaN })
	];
	it('a window keeps only stories whose own time is inside it', () => {
		expect(storeNews(stories, 7 * DAY, NOW).map((i) => i.id)).toEqual(['fresh']);
	});
	it('no window: every story, as legacy has it', () => {
		expect(storeNews(stories, undefined, NOW)).toBe(stories);
	});
});
