import { describe, expect, it } from 'vitest';
import type { NewsItem } from '$lib/types';
import { TOWN_BY_SLUG } from '$lib/config/towns';
import type { DatasetFetch } from './source-adapters';
import type { BlotterView } from './v2-blotter';
import { DATA_LAYERS, layerFeatures, v2DataLayers, type DataLayerId } from './v2-map-layers';
import { inView, inViewItems } from './map-in-view';

// 3 PM PDT, Sunday Oct 18.
const NOW = Date.parse('2026-10-18T15:00:00-07:00');
const SYNCED = Date.parse('2026-10-18T12:00:05-07:00');
const H = 3_600_000;
const allOn = Object.fromEntries(DATA_LAYERS.map((l) => [l.id, true])) as Record<
	DataLayerId,
	boolean
>;
const NO_BLOTTER: BlotterView = {
	state: 'loading',
	asOf: null,
	kept: null,
	reports: [],
	count: null,
	hidden: null,
	capped: false
};
const values = (over: Record<string, unknown> = {}) => ({
	traffic: null,
	fire: null,
	gas: null,
	ev: null,
	coffee: null,
	fitness: null,
	airport: null,
	cams: null,
	activity: null,
	blotter: NO_BLOTTER,
	...over
});
const live: Record<string, DatasetFetch> = { activity: { kind: 'live', observedAt: SYNCED } };

let n = 0;
const show = (over: Partial<NewsItem>): NewsItem => ({
	id: `shows:${++n}`,
	title: `Show ${n}`,
	link: `https://venue.example/${n}`,
	timestamp: Date.parse('2026-10-20T19:00:00-07:00'),
	source: 'Osher Marin JCC',
	category: 'shows',
	verification: 'community',
	startSource: 'startDate',
	venueId: 'marin-jcc',
	locationText: 'Osher Marin JCC · 200 North San Pedro Road',
	...over
});
const ADRIAN = show({ id: 'shows:adrian', title: 'Adrian West Band' });
const YOGA = show({
	id: 'shows:yoga',
	title: 'Shabbat Yoga',
	timestamp: Date.parse('2026-10-19T13:30:00-07:00'),
	locationText: 'JCC 2nd Floor Yoga Studio · 200 N. San Pedro Rd.'
});
const RODEF = show({
	id: 'shows:rodef',
	title: 'Re-Visioning Zionism',
	locationText: 'Rodef Sholom Sanctuary · 170 North San Pedro Road'
});
const CAIN = show({
	id: 'shows:cain',
	title: 'THE CHRIS CAIN BAND',
	source: 'Rancho Nicasio',
	venueId: 'rancho-nicasio',
	timestamp: Date.parse('2026-10-23T00:00:00Z'),
	startSource: 'calendar',
	startDay: '2026-10-23',
	locationText: undefined
});
const HUB = show({
	id: 'shows:hub',
	title: 'Sausalito Seahorse calendar',
	timestamp: NOW + H,
	startSource: undefined,
	venueId: undefined,
	locationText: undefined
});
const ITEMS = [ADRIAN, YOGA, RODEF, CAIN, HUB];

const layers = (over: Partial<Parameters<typeof v2DataLayers>[0]> = {}) =>
	v2DataLayers({
		on: allOn,
		outcomes: live,
		values: values({ activity: ITEMS }),
		town: null,
		now: NOW,
		...over
	});

describe('Shows · next 10 days (NEWSPIN1)', () => {
	it('a venue dot per confirmed venue; its shows are rows under it, never dots of their own', () => {
		const v = layers().shows;
		expect(v).toMatchObject({
			state: 'value',
			asOf: SYNCED,
			kept: null,
			source: 'venue calendars'
		});
		expect(v.points.map((p) => p.id)).toEqual([
			'venue:marin-jcc',
			'event:shows:yoga',
			'event:shows:adrian',
			'venue:rancho-nicasio',
			'event:shows:cain'
		]);
		expect(layerFeatures(v).map((f) => f.id)).toEqual(['venue:marin-jcc', 'venue:rancho-nicasio']);
		expect(layerFeatures(v)[0]).toMatchObject({
			geometry: { type: 'Point', coordinates: [-122.5231, 37.9994] },
			properties: { itemId: 'venue:marin-jcc', name: 'Osher Marin JCC', count: 2 }
		});
		expect(v.count).toBe(3);
		expect(v.note).toBe('3 shows mapped · 1 upcoming show not mapped (no confirmed venue)');
	});

	it('says where the place came from, and when the show is', () => {
		const [venue, yoga] = layers().shows.points;
		expect(venue.detail.meta).toEqual(['Osher Marin JCC · venue list', '2 shows · next 10 days']);
		expect(yoga.detail).toMatchObject({
			title: 'Shabbat Yoga',
			meta: ['Osher Marin JCC · venue list', 'Mon, Oct 19, 1:30 PM']
		});
		const cain = layers().shows.points.find((p) => p.id === 'event:shows:cain')!;
		expect(cain.detail.meta).toEqual(['Rancho Nicasio · venue list', 'Fri, Oct 23']);
	});

	it('lists a venue’s shows grouped under it in the in-view list, counting only shows', () => {
		const v = layers().shows;
		const rows = inView(
			inViewItems({
				news: [],
				threeOneOne: [],
				earthquakes: [],
				town: null,
				towns: {},
				layers: [v]
			}),
			{ west: -123.2, south: 37.8, east: -122.3, north: 38.3 }
		);
		expect(rows.map((r) => r.id)).toEqual([
			'shows:venue:marin-jcc',
			'shows:event:shows:yoga',
			'shows:event:shows:adrian',
			'shows:venue:rancho-nicasio',
			'shows:event:shows:cain'
		]);
		expect(rows.filter((r) => !r.heading).length).toBe(3);
	});

	it('re-applies the window on every render: a past show leaves the layer', () => {
		const later = layers({ now: Date.parse('2026-10-21T09:00:00-07:00') }).shows;
		expect(later.points.map((p) => p.id)).toEqual(['venue:rancho-nicasio', 'event:shows:cain']);
	});

	it('a first read that failed: unavailable, nothing drawn, no count', () => {
		const v = layers({
			outcomes: {
				activity: { kind: 'failed', error: 'HTTP 503', retained: false, observedAt: null }
			},
			values: values({ activity: null })
		}).shows;
		expect(v).toMatchObject({ state: 'unavailable', points: [], count: null, note: null });
	});

	it('a read kept after a failure is drawn and says so, from its own sync time', () => {
		const v = layers({
			outcomes: {
				activity: { kind: 'failed', error: 'HTTP 503', retained: true, observedAt: SYNCED }
			}
		}).shows;
		expect(v.state).toBe('value');
		expect(v.kept).toBe('Kept from 12:00 PM · the source returned an error');
		expect(v.points.length).toBe(5);
	});

	it('a payload with no time (the static fallback) reads "time not reported"', () => {
		const v = layers({
			outcomes: { activity: { kind: 'fallback', dataSource: 'static-fallback', observedAt: null } }
		}).shows;
		expect(v.asOf).toBeNull();
	});

	it('a chosen town keeps only its venues', () => {
		const v = layers({ town: 'nicasio' }).shows;
		expect(v.points.map((p) => p.id)).toEqual(['venue:rancho-nicasio', 'event:shows:cain']);
	});
});

const report = (
	id: string,
	townSlug: string,
	at: number,
	title = 'Theft · 5XX The Alameda'
): NewsItem => ({
	id,
	title,
	link: 'https://data.marincounty.gov/Public-Safety/Marin-County-Sheriff-Reported-Crime/ahxi-5nsc',
	timestamp: at,
	source: 'Marin Sheriff Blotter',
	category: 'safety',
	verification: 'official',
	town: TOWN_BY_SLUG[townSlug]?.name,
	townSlug,
	locationConfidence: 'town',
	locationEvidence: title.split(' · ')[1]
});
const fresh = (reports: NewsItem[], over: Partial<BlotterView> = {}): BlotterView => ({
	state: 'value',
	asOf: NOW - 60_000,
	kept: null,
	reports,
	count: reports.length,
	hidden: 1,
	capped: false,
	...over
});
const blotter = (view: BlotterView, town: string | null = null) =>
	v2DataLayers({ on: allOn, outcomes: {}, values: values({ blotter: view }), town, now: NOW })
		.blotter;

describe('Sheriff blotter · last 36 h (NEWSPIN1)', () => {
	const A = report('blotter-SO1', 'san-anselmo', NOW - 2 * H);
	const B = report(
		'blotter-SO2',
		'san-anselmo',
		NOW - 5 * H,
		'Shoplifting · 7XX Sir Francis Drake Blvd'
	);
	const C = report('blotter-SO3', 'kentfield', NOW - 3 * H, 'Vehicle burglary · 2XX Bon Air Rd');

	it('a count on each town’s dot, at the town, with the masked address only as text', () => {
		const v = blotter(fresh([A, B, C]));
		const features = layerFeatures(v);
		expect(features.map((f) => f.id)).toEqual(['town:san-anselmo', 'town:kentfield']);
		const sa = TOWN_BY_SLUG['san-anselmo'];
		expect(features[0]).toMatchObject({
			geometry: { coordinates: [sa.lon, sa.lat] },
			properties: { itemId: 'town:san-anselmo', count: 2 }
		});
		const [town, first] = v.points;
		expect(town.title).toBe('San Anselmo · 2 sheriff reports, last 36 h');
		expect(first).toMatchObject({ id: 'blotter-SO1', lon: sa.lon, lat: sa.lat, listOnly: true });
		expect(first.detail.title).toBe('Theft · 5XX The Alameda');
		expect(v.count).toBe(3);
		expect(v.note).toBe('3 reports · 1 not shown (not a property or public-place report)');
	});

	it('says "latest 30" when the read hit the county’s row cap', () => {
		expect(blotter(fresh([A], { capped: true })).note).toBe(
			'1 report · 1 not shown (not a property or public-place report) · latest 30'
		);
	});

	it('a fresh empty read says 0; a kept one never vouches for a number it can’t see', () => {
		expect(blotter(fresh([], { hidden: 0 }))).toMatchObject({
			count: 0,
			note: '0 reports · 0 not shown (not a property or public-place report)'
		});
		const kept = blotter(
			fresh([A], { kept: 'Kept from 2:59 PM · HTTP 503', count: 1, hidden: null })
		);
		expect(kept.kept).toBe('Kept from 2:59 PM · HTTP 503');
		expect(kept.note).toBe('1 report');
		expect(blotter(fresh([], { kept: 'Kept …', count: null, hidden: null })).count).toBeNull();
	});

	it('unavailable: nothing drawn and no count', () => {
		expect(blotter({ ...NO_BLOTTER, state: 'unavailable' })).toMatchObject({
			state: 'unavailable',
			points: [],
			count: null
		});
	});

	it('a report whose town we don’t draw is counted, never placed', () => {
		const v = blotter(fresh([A, report('blotter-SO9', 'nowhere', NOW - H)]));
		expect(v.points.map((p) => p.id)).toEqual(['town:san-anselmo', 'blotter-SO1']);
		expect(v.note).toBe(
			'2 reports · 1 not shown (not a property or public-place report) · 1 without a Marin town'
		);
	});

	it('a chosen town keeps only its own reports', () => {
		expect(blotter(fresh([A, C]), 'kentfield').points.map((p) => p.id)).toEqual([
			'town:kentfield',
			'blotter-SO3'
		]);
	});
});

describe('Codex NEWSPIN1 review', () => {
	it('#3 a venue is in its reviewed town, not the nearest centroid’s (the JCC is San Rafael)', () => {
		const v = layers({ town: 'san-rafael' }).shows;
		expect(v.points.map((p) => p.id)).toContain('venue:marin-jcc');
	});

	it('#2 a kept blotter read never says 0 for a town it has nothing in', () => {
		const A = report('blotter-SO1', 'san-anselmo', NOW - 2 * H);
		const kept = fresh([A], { kept: 'Kept from 2:59 PM · HTTP 503', hidden: null });
		expect(blotter(kept, 'kentfield').count).toBeNull();
		expect(blotter(kept, 'san-anselmo').count).toBe(1);
	});
});
