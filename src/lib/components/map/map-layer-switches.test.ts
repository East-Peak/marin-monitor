import { describe, expect, it } from 'vitest';
import type { NewsItem, Town } from '$lib/types';
import {
	OWNED_MAP_LAYERS,
	alertPulseFeatures,
	applyAirportSwitch,
	layerItems,
	markRetained,
	optionalReads,
	placeLayersOn,
	syncCounts,
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
