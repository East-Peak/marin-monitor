import { describe, expect, it } from 'vitest';
import { mapLegend, showMarinReset, type InView, type MapView } from './v2-map-legend';

const HOME: MapView = { zoom: 8.73, center: { lng: -122.67, lat: 38.07 } };
const ALL_ON = {
	news: true,
	safety: true,
	civic: true,
	activity: true,
	housing: true,
	satire: true,
	'311': true
} as const;
const OK = { news: 'value', '311': 'value', earthquakes: 'value' } as const;
// The live San Rafael look (2026-10-16): one town circle of 10 stories, 44 reports, no quakes.
const SAN_RAFAEL: InView = {
	towns: [
		{ slug: 'san-rafael', total: 10 },
		{ slug: 'ross', total: 0 },
		{ slug: 'san-anselmo', total: 2 }
	],
	fixIt: 44,
	quakes: 0
};
const names: Record<string, string> = { 'san-rafael': 'San Rafael', 'san-anselmo': 'San Anselmo' };
const legend = (over: Partial<Parameters<typeof mapLegend>[0]> = {}) =>
	mapLegend({
		activeLayers: ALL_ON,
		earthquakesShown: true,
		layers: OK,
		town: null,
		townName: (s) => names[s] ?? s,
		inView: SAN_RAFAEL,
		...over
	});

describe('showMarinReset (the way back to all of Marin)', () => {
	it('hidden on the default view with no town', () => {
		expect(showMarinReset(null, HOME, HOME)).toBe(false);
		expect(showMarinReset(null, { ...HOME, zoom: HOME.zoom + 0.1 }, HOME)).toBe(false);
	});
	it('shown once a town is chosen, even before the map moves', () => {
		expect(showMarinReset('fairfax', HOME, HOME)).toBe(true);
		expect(showMarinReset('fairfax', null, null)).toBe(true);
	});
	it('shown when zoomed in or panned away with no town', () => {
		expect(showMarinReset(null, { ...HOME, zoom: 13 }, HOME)).toBe(true);
		expect(showMarinReset(null, { ...HOME, center: { lng: -122.53, lat: 37.97 } }, HOME)).toBe(
			true
		);
	});
	it('hidden before the map has a home view to return to (no town)', () => {
		expect(showMarinReset(null, { ...HOME, zoom: 13 }, null)).toBe(false);
	});
});

describe('mapLegend (what each layer shows at this zoom)', () => {
	it('says stories sit in town circles, 311 and quakes at exact spots, with in-view counts', () => {
		expect(legend()).toEqual([
			{
				key: 'stories',
				label: 'Stories',
				how: 'one circle per town, not street spots',
				count: '12 in view, in 2 town circles'
			},
			{ key: '311', label: 'Fix It Marin', how: 'each report at its spot', count: '44 in view' },
			{
				key: 'earthquakes',
				label: 'Earthquakes',
				how: 'each epicenter',
				count: 'none in view'
			}
		]);
	});
	it('with a town chosen, counts that town’s circle by name', () => {
		expect(legend({ town: 'san-rafael' })[0].count).toBe('10 in the San Rafael circle');
	});
	it('a chosen town whose circle is out of view falls back to the view count', () => {
		expect(legend({ town: 'fairfax' })[0].count).toBe('12 in view, in 2 town circles');
	});
	it('one circle and no stories read in the singular / as none', () => {
		const one: InView = { towns: [{ slug: 'san-rafael', total: 1 }], fixIt: 1, quakes: 1 };
		expect(legend({ inView: one }).map((l) => l.count)).toEqual([
			'1 in view, in 1 town circle',
			'1 in view',
			'1 in view'
		]);
		const none: InView = { towns: [{ slug: 'ross', total: 0 }], fixIt: 0, quakes: 0 };
		expect(legend({ inView: none })[0].count).toBe('none in view');
	});
	it('names only the enabled layers', () => {
		expect(
			legend({ activeLayers: { ...ALL_ON, '311': false }, earthquakesShown: false }).map(
				(l) => l.key
			)
		).toEqual(['stories']);
		const noStories = Object.fromEntries(Object.keys(ALL_ON).map((k) => [k, k === '311']));
		expect(legend({ activeLayers: noStories }).map((l) => l.key)).toEqual(['311', 'earthquakes']);
	});
	it('makes no count claim for a layer that is not read (the status line says why)', () => {
		const counts = legend({
			layers: { news: 'loading', '311': 'unavailable', earthquakes: 'unknown' }
		}).map((l) => l.count);
		expect(counts).toEqual([null, null, null]);
		expect(legend({ inView: null }).map((l) => l.count)).toEqual([null, null, null]);
	});
});
