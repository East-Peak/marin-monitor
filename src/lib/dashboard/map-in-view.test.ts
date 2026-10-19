import { describe, expect, it } from 'vitest';
import type { NewsItem } from '$lib/types';
import {
	inView,
	inViewItems,
	selectionId,
	steadyCenter,
	visibleBounds,
	type InViewItem
} from './map-in-view';

const T0 = Date.UTC(2026, 9, 17, 15);
const news = (over: Partial<NewsItem>): NewsItem => ({
	id: 'n',
	title: 'A story',
	link: 'https://example.com/a',
	timestamp: T0,
	source: 'Marin IJ',
	category: 'local',
	verification: 'local_media',
	...over
});
const item = (over: Partial<InViewItem>): InViewItem => ({
	id: 'news:x',
	layer: 'news',
	title: 't',
	at: T0,
	lon: -122.5,
	lat: 37.95,
	detail: { title: 't', meta: [], paragraphs: [], source: null },
	...over
});
const MARIN = { west: -123, south: 37.8, east: -122.4, north: 38.3 };

describe('selectionId', () => {
	it('namespaces a raw id by its layer', () => {
		expect(selectionId('311', 'seeclickfix-901')).toBe('311:seeclickfix-901');
		expect(selectionId('quake', 'nc1')).toBe('quake:nc1');
	});
});

describe('visibleBounds', () => {
	it('trims the east edge by the panel width (longitude is linear in x)', () => {
		const b = visibleBounds(MARIN, 1200, 360);
		expect(b.west).toBe(-123);
		expect(b.east).toBeCloseTo(-123 + 0.6 * (840 / 1200));
		expect([b.south, b.north]).toEqual([37.8, 38.3]);
	});
	it('a collapsed panel (0 px) or an unsized map keeps the full bounds', () => {
		expect(visibleBounds(MARIN, 1200, 0)).toEqual(MARIN);
		expect(visibleBounds(MARIN, 0, 360)).toEqual(MARIN);
	});
});

describe('steadyCenter', () => {
	// MapLibre's world is 512 px wide at zoom 0, so a pixel spans 360 / (512 · 2^z) degrees.
	const degPerPx = (zoom: number) => 360 / (512 * 2 ** zoom);
	const SR = { lng: -122.531, lat: 37.974 };
	it.each([10, 12.5])('hiding the panel moves the centre east by half its width (z%s)', (zoom) => {
		const c = steadyCenter(SR, zoom, 412, 0);
		expect(c.lng).toBeCloseTo(SR.lng + 206 * degPerPx(zoom), 10);
		expect(c.lat).toBe(SR.lat);
	});
	it.each([10, 12.5])('showing it again undoes the hide exactly (z%s)', (zoom) => {
		const back = steadyCenter(steadyCenter(SR, zoom, 412, 0), zoom, 0, 412);
		expect(back.lng).toBeCloseTo(SR.lng, 12);
		expect(back.lat).toBe(SR.lat);
	});
	it('unchanged padding keeps the centre', () => {
		expect(steadyCenter(SR, 11, 300, 300)).toEqual(SR);
	});
});

describe('inView', () => {
	it('keeps only items inside the bounds', () => {
		const out = inView([item({ id: 'news:in' }), item({ id: 'news:out', lon: -122.3 })], MARIN);
		expect(out.map((i) => i.id)).toEqual(['news:in']);
	});
	it('dedupes by id', () => {
		expect(inView([item({}), item({})], MARIN)).toHaveLength(1);
	});
	it('groups by layer in a fixed order, newest first within each, undated last', () => {
		const out = inView(
			[
				item({ id: 'quake:q', layer: 'quake', at: T0 }),
				item({ id: '311:old', layer: '311', at: T0 - 2 }),
				item({ id: 'news:old', at: T0 - 5 }),
				item({ id: 'news:undated', at: null }),
				item({ id: '311:new', layer: '311', at: T0 }),
				item({ id: 'news:new', at: T0 })
			],
			MARIN
		);
		expect(out.map((i) => i.id)).toEqual([
			'news:new',
			'news:old',
			'news:undated',
			'311:new',
			'311:old',
			'quake:q'
		]);
	});
});

describe('inViewItems', () => {
	const towns = { 'mill-valley': { name: 'Mill Valley', lat: 37.906, lon: -122.545 } };
	it('a town-only story sits at its town circle, never an invented street pin', () => {
		const [s] = inViewItems({
			news: [news({ id: 'a', townSlug: 'mill-valley' })],
			threeOneOne: [],
			earthquakes: [],
			town: null,
			towns
		});
		expect(s).toMatchObject({ id: 'news:a', lon: -122.545, lat: 37.906 });
	});
	it('a street-pinned story keeps its own point; an unplaced story is not listed', () => {
		const out = inViewItems({
			news: [news({ id: 'p', lat: 38, lon: -122.6 }), news({ id: 'nowhere' })],
			threeOneOne: [],
			earthquakes: [],
			town: null,
			towns
		});
		expect(out.map((i) => [i.id, i.lon, i.lat])).toEqual([['news:p', -122.6, 38]]);
	});
	it('311 detail: photo, the excerpt, "Open on Fix It Marin" and the time', () => {
		const [r] = inViewItems({
			news: [],
			threeOneOne: [
				news({
					id: 'seeclickfix-901',
					title: 'Pothole · 1400 Fifth Ave',
					description: 'Deep pothole',
					source: 'Fix It Marin',
					category: 'safety',
					link: 'https://seeclickfix.com/issues/901',
					imageUrl: 'https://img/901.jpg',
					lat: 37.97,
					lon: -122.53
				})
			],
			earthquakes: [],
			town: null,
			towns,
			formatTime: () => '8:00 AM'
		});
		expect(r.id).toBe('311:seeclickfix-901');
		expect(r.detail).toEqual({
			title: 'Pothole · 1400 Fifth Ave',
			meta: ['Fix It Marin', '8:00 AM'],
			image: { src: 'https://img/901.jpg', alt: 'Photo with the Fix It Marin report' },
			paragraphs: ['Deep pothole'],
			source: { label: 'Open on Fix It Marin', href: 'https://seeclickfix.com/issues/901' }
		});
	});
	it("a town filter keeps that town's stories and 311 items; quakes stay", () => {
		const out = inViewItems({
			news: [
				news({ id: 'mv', townSlug: 'mill-valley' }),
				news({ id: 'sr', townSlug: 'san-rafael', lat: 37.97, lon: -122.53 })
			],
			threeOneOne: [],
			earthquakes: [news({ id: 'nc1', lat: 38.15, lon: -122.57, category: 'safety' })],
			town: 'mill-valley',
			towns
		});
		expect(out.map((i) => i.id)).toEqual(['news:mv', 'quake:nc1']);
	});
	it('a story placed by its headline sits at the place, and says where the place came from (NEWSPIN2)', () => {
		const [area, venue] = inViewItems({
			news: [
				news({ id: 'bay', townSlug: 'mill-valley', source: 'Marin IJ' }),
				news({ id: 'light', source: 'KQED' })
			],
			threeOneOne: [],
			earthquakes: [],
			town: null,
			towns,
			formatTime: () => '8:00 AM',
			placed: new Map([
				[
					'bay',
					{
						lat: 38.16,
						lon: -122.88,
						precision: 'area',
						label: 'Tomales Bay',
						provenance: 'matched in the headline'
					}
				],
				[
					'light',
					{
						lat: 37.9956,
						lon: -123.0232,
						precision: 'venue',
						label: 'Point Reyes Lighthouse',
						provenance: 'matched in the headline'
					}
				]
			])
		});
		expect(area).toMatchObject({ id: 'news:bay', lon: -122.88, lat: 38.16 });
		expect(area.detail.meta).toEqual([
			'Marin IJ',
			'8:00 AM',
			'Tomales Bay (area) · matched in the headline'
		]);
		expect(venue).toMatchObject({ id: 'news:light', lon: -123.0232, lat: 37.9956 });
		expect(venue.detail.meta).toEqual([
			'KQED',
			'8:00 AM',
			'Point Reyes Lighthouse · matched in the headline'
		]);
	});
	it('carries a kept note when the owner supplies one', () => {
		const [s] = inViewItems({
			news: [news({ id: 'a', lat: 38, lon: -122.6 })],
			threeOneOne: [],
			earthquakes: [],
			town: null,
			towns,
			notes: new Map([['a', 'Kept from 7:00 AM · read failed']])
		});
		expect(s.note).toBe('Kept from 7:00 AM · read failed');
	});
});

describe('inViewItems: the data layers (MAPX2b)', () => {
	it('lists each drawn point under its layer, with its detail and kept note', () => {
		const out = inViewItems({
			news: [],
			threeOneOne: [],
			earthquakes: [],
			town: null,
			towns: {},
			layers: [
				{
					id: 'gas',
					kept: 'Kept from 7:00 AM · HTTP 503',
					points: [
						{
							id: 'p1',
							lon: -122.53,
							lat: 37.97,
							title: 'Shell',
							at: null,
							props: {},
							detail: { title: 'Shell', meta: [], paragraphs: [], source: null }
						}
					]
				}
			]
		});
		expect(out).toEqual([
			expect.objectContaining({
				id: 'gas:p1',
				layer: 'gas',
				title: 'Shell',
				note: 'Kept from 7:00 AM · HTTP 503'
			})
		]);
	});
});
