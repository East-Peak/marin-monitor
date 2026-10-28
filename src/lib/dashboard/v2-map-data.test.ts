import { describe, expect, it } from 'vitest';
import type { NewsSnapshotItem, NewsSnapshotView } from '$lib/news/snapshot';
import type { NewsItem } from '$lib/types';
import type { SourceStatusEntry } from './source-status';
import { fromLoaderPart, fromSnapshotRead, fromSnapshotSource } from './source-adapters';
import { describePresentation } from './source-status';
import { storiesNote, townLevel, v2FeatureView, v2Inspector, v2MapData } from './v2-map-data';

const NOW = Date.parse('2026-10-01T15:00:00Z'); // 8:00 AM PDT
const H = 3_600_000;
const ALL_ON = {
	news: true,
	safety: true,
	civic: true,
	activity: true,
	housing: true,
	'311': true,
	satire: true
};
const MV = { name: 'Mill Valley', slug: 'mill-valley', source: 'title-match' as const };
const pinStory = (id: string, over: Partial<NewsSnapshotItem> = {}): NewsSnapshotItem =>
	({
		id,
		sourceId: 'point-reyes-light',
		source: 'Point Reyes Light',
		category: 'local',
		verification: 'local_media',
		title: id,
		link: `https://news.example/${id}`,
		canonicalUrl: `https://news.example/${id}`,
		summary: null,
		publishedAt: new Date(NOW - H).toISOString(),
		publishedAtRaw: null,
		publishedAtSource: 'rss:pubDate',
		publishedAtStatus: 'valid',
		publishedAtAssumedZone: null,
		eventAt: null,
		eventAtSource: null,
		updatedAt: null,
		fetchedAt: new Date(NOW).toISOString(),
		town: MV,
		point: { lat: 37.906, lon: -122.545, source: 'feed' },
		topics: [],
		categories: ['local'],
		alsoReportedBy: [],
		...over
	}) as NewsSnapshotItem;
const view = (
	items: NewsSnapshotItem[],
	scrape = NOW,
	status: 'ok' | 'empty' | 'retained' | 'failed' = 'ok'
): NewsSnapshotView => ({
	schemaVersion: 1,
	revision: 1,
	generatedAt: new Date(NOW).toISOString(),
	lastSuccessfulScrapeAt: new Date(scrape).toISOString(),
	sources: [
		{
			id: 'point-reyes-light',
			name: 'Point Reyes Light',
			category: 'local',
			verification: 'local_media',
			status,
			lastAttemptAt: new Date(NOW).toISOString(),
			lastSuccessAt: new Date(scrape).toISOString(),
			lastError: status === 'ok' || status === 'empty' ? null : 'http-status: HTTP 503',
			consecutiveFailures: status === 'ok' || status === 'empty' ? 0 : 1,
			itemCount: items.length
		}
	],
	items
});
const fix = (id: string, townSlug = 'san-rafael'): NewsItem => ({
	id,
	title: id,
	link: '',
	timestamp: NOW - H,
	source: 'Fix It Marin',
	category: '311',
	verification: 'community',
	townSlug,
	lat: 37.97,
	lon: -122.53
});
const quake: NewsItem = {
	id: 'nc1',
	title: 'M3.1 - 5 km N of Novato',
	link: '',
	timestamp: NOW - H,
	source: 'USGS',
	category: 'safety',
	verification: 'official',
	lat: 38.15,
	lon: -122.57
};
const okAt = (t: number | null) => ({ ok: true as const, at: NOW, observedAt: t });
const ok = okAt(null);
const fail = (error: string) => ({ ok: false as const, error, at: NOW });
function sources(
	v: NewsSnapshotView | null,
	read: Parameters<typeof fromSnapshotRead>[0],
	fixOutcome?: typeof ok | ReturnType<typeof fail>,
	fixHad = false,
	quakeOutcome?: typeof ok | ReturnType<typeof fail>,
	quakeHad = false,
	/** The last good read's payload time, for a failure after a success. */
	obs: { fix?: number | null; quake?: number | null } = {}
): SourceStatusEntry[] {
	return [
		fromSnapshotRead(read, v),
		...(v?.sources ?? []).map(fromSnapshotSource),
		fromLoaderPart('seeclickfix', fixOutcome, fixHad, obs.fix ?? null),
		fromLoaderPart('earthquakes', quakeOutcome, quakeHad, obs.quake ?? null)
	];
}
const run = (over: Partial<Parameters<typeof v2MapData>[0]>) =>
	v2MapData({
		view: null,
		fixIt: null,
		earthquakes: [],
		sources: [],
		activeLayers: ALL_ON,
		town: null,
		now: NOW,
		...over
	});

describe('the v2 map draws only what this owner established (Codex r3 #1)', () => {
	it('before anything settles: nothing drawn, every layer loading, coverage loading', () => {
		const d = run({ sources: sources(null, undefined), earthquakes: [quake] });
		expect(d.layerData.news).toEqual([]);
		expect(d.layerData.threeOneOne).toEqual([]);
		expect(d.earthquakes).toEqual([]); // a quake list without a settled part is not shown
		expect(d.layers).toEqual({ news: 'loading', '311': 'loading', earthquakes: 'loading' });
		expect(d.coverage.state).toBe('loading');
		expect(d.loading).toEqual(['part:snapshot', 'part:seeclickfix', 'part:earthquakes']);
	});

	it('failed first reads: no pins, whatever an input carries; coverage unavailable, naming them', () => {
		const d = run({
			sources: sources(null, fail('read-failed'), fail('HTTP 503'), false, fail('HTTP 500'), false),
			fixIt: null,
			earthquakes: []
		});
		expect(d.layerData.news).toEqual([]);
		expect(d.layerData.threeOneOne).toEqual([]);
		expect(d.layers).toEqual({
			news: 'unavailable',
			'311': 'unavailable',
			earthquakes: 'unavailable'
		});
		expect(d.coverage.state).toBe('unavailable');
		expect(d.loading).toEqual([]);
		// The layer panel's as-of (MAPX2b): no time for a read that failed.
		expect(d.asOf).toEqual({ news: null, '311': null, earthquakes: null });
	});

	it('a value read carries its own as-of time for the layer panel (MAPX2b)', () => {
		const v = view([pinStory('a')], NOW - 20 * 60_000);
		const d = run({ view: v, sources: sources(v, { ok: true, view: v } as never) });
		expect(d.asOf.news).toBe(NOW - 20 * 60_000);
	});
});

describe('success → failure: kept features are marked with their own time (Codex r3 #1)', () => {
	it('a kept snapshot marks every news pin; a kept 311 part marks 311; the inspector says so', () => {
		const v = view([pinStory('a'), pinStory('b')], NOW - 20 * 60_000); // scraped 7:40 AM
		const d = run({
			view: v,
			fixIt: [fix('seeclickfix-1')],
			earthquakes: [quake],
			sources: sources(
				v,
				fail('news-snapshot: unknown (read-failed)'),
				fail('HTTP 503'),
				true,
				ok,
				true
			)
		});
		expect(d.layerData.news.map((i) => i.id)).toEqual(['a', 'b']);
		expect([...d.layerData.retained.news]).toEqual(['a', 'b']);
		expect(d.layerData.retained.threeOneOne).toBe(true);
		expect(d.layerData.retained.earthquakes).toBe(false);
		expect(d.notes.get('a')).toBe("Kept from 7:40 AM · we couldn't check this source");
		expect(d.notes.get('seeclickfix-1')).toBe(
			'Kept from an earlier read (time not reported) · the source returned an error'
		);
		expect(d.notes.has('nc1')).toBe(false);
		expect(d.coverage.state).toBe('partial');
	});
});

describe('coverage comes from the enabled, town-filtered layer inputs (Codex r3 #4)', () => {
	it('a town with no matching news or 311 reads no-match, not "nothing new"', () => {
		const v = view([pinStory('a')]);
		const d = run({
			view: v,
			fixIt: [fix('seeclickfix-1')],
			sources: sources(v, ok, ok, true, ok, true),
			town: 'novato'
		});
		expect(d.coverage.state).toBe('no-match');
	});
	it('a switched-off layer neither counts nor names its source', () => {
		const v = view([pinStory('a')]);
		const d = run({
			view: v,
			sources: sources(v, ok, fail('HTTP 503'), false, ok, true),
			activeLayers: { ...ALL_ON, '311': false }
		});
		expect(d.coverage.failing.map((e) => e.name)).not.toContain('Fix It Marin (311)');
	});
	it('items that cannot be drawn (no point, no town) are not counted as shown', () => {
		const v = view([pinStory('a', { town: null, point: null })]);
		const d = run({ view: v, sources: sources(v, ok, ok, true, ok, true) });
		expect(d.coverage.state).not.toBe('ok');
	});
});

describe('map emptiness needs fresh coverage of every enabled layer (Codex r4 #1)', () => {
	const says = (d: ReturnType<typeof v2MapData>) => describePresentation(d.coverage, NOW) ?? '';
	it('all failed behind a fresh snapshot read: unavailable, never "Nothing new"', () => {
		const v = view([], NOW, 'failed');
		const d = run({
			view: v,
			fixIt: [],
			sources: sources(v, ok, fail('HTTP 503'), false, fail('HTTP 500'), false)
		});
		expect(d.empty).toBeNull();
		expect(d.coverage.state).toBe('unavailable');
		expect(says(d)).not.toContain('Nothing');
	});
	it('retained-empty: a kept, empty feed is stale ("as of"), never "Nothing new"', () => {
		const v = view([], NOW - 3 * H, 'retained');
		const d = run({
			view: v,
			fixIt: [],
			sources: sources(v, ok, ok, true, ok, true),
			activeLayers: { ...ALL_ON, '311': false }
		});
		expect(d.empty).toBeNull();
		expect(d.coverage.state).not.toBe('empty');
		expect(says(d)).not.toContain('Nothing');
	});
	it('mixed success, nothing to draw: one layer failed → not empty, the failure named', () => {
		const v = view([], NOW, 'empty');
		const d = run({
			view: v,
			fixIt: null,
			sources: sources(v, ok, fail('HTTP 503'), false, ok, true)
		});
		expect(d.empty).toBeNull();
		expect(d.coverage.state).not.toBe('empty');
		expect(says(d)).toContain('Fix It Marin (311)');
	});
	it('every layer succeeded with nothing to draw, but 311 and quakes report no data age: still not "Nothing new"', () => {
		const v = view([], NOW, 'empty');
		const d = run({ view: v, fixIt: [], sources: sources(v, ok, ok, true, ok, true) });
		expect(d.empty).toBeNull(); // emptyWording needs an observation time; these parts never report one
		expect(d.coverage.state).toBe('unknown');
	});
});

describe('a town no-match goes through the same gate (the map twin of Codex 9a #1)', () => {
	it('after a failed snapshot refresh the map never says "Nothing for this town"', () => {
		const v = view([pinStory('a')], NOW - 20 * 60_000);
		const d = run({
			view: v,
			fixIt: [],
			sources: sources(v, fail('news-snapshot: unknown (read-failed)'), ok, true, ok, true),
			town: 'novato'
		});
		expect(d.empty).toBeNull();
		expect(d.coverage.state).not.toBe('no-match');
		expect(describePresentation(d.coverage, NOW) ?? '').not.toContain('Nothing');
	});
});

describe('the inspector and tooltip see only what the map vouches for (Codex 9b #1–#4)', () => {
	const name = (slug: string) => slug;
	it('a switched-off layer’s items are not inspectable (Codex 9b #3)', () => {
		const v = view([pinStory('a'), pinStory('s', { category: 'safety', categories: ['safety'] })]);
		const d = run({
			view: v,
			fixIt: [fix('seeclickfix-1')],
			sources: sources(v, ok, ok, true, ok, true),
			activeLayers: { ...ALL_ON, safety: false, '311': false }
		});
		expect(d.inspectable.map((i) => i.id)).toEqual(['a']);
	});
	it('after failed first reads a town click opens no "0 stories" inspector (Codex 9b #2)', () => {
		const d = run({
			sources: sources(null, fail('read-failed'), fail('HTTP 503'), false, fail('HTTP 500'), false)
		});
		expect(d.established).toBe(false);
		expect(v2Inspector({ mode: 'town', townSlug: 'novato' }, d, name)).toBeNull();
	});
	it('with every enabled layer established, an empty town is a real zero', () => {
		const v = view([pinStory('a')]);
		const d = run({
			view: v,
			fixIt: [],
			sources: sources(v, ok, okAt(NOW - 3 * H), true, okAt(NOW - 60_000), true)
		});
		expect(d.established).toBe(true);
		expect(v2Inspector({ mode: 'town', townSlug: 'novato' }, d, name)).toMatchObject({ items: [] });
	});
	it('an untimed (unknown-age) layer never establishes a zero (negative control)', () => {
		const v = view([pinStory('a')]);
		const d = run({
			view: v,
			fixIt: [],
			sources: sources(v, ok, ok, true, okAt(NOW - 60_000), true)
		});
		expect(d.established).toBe(false);
		expect(v2Inspector({ mode: 'town', townSlug: 'novato' }, d, name)).toBeNull();
	});
	it('a future-dated payload time never establishes a zero', () => {
		const v = view([pinStory('a')]);
		const d = run({
			view: v,
			fixIt: [],
			sources: sources(v, ok, okAt(NOW + 10 * 60_000), true, okAt(NOW - 60_000), true)
		});
		expect(d.established).toBe(false);
	});
	it('an open feature’s note follows the current data; a feature no longer drawn closes (Codex 9b #4)', () => {
		const v = view([]);
		const kept = run({
			view: v,
			fixIt: [fix('seeclickfix-1')],
			sources: sources(v, ok, fail('HTTP 503'), true, ok, true)
		});
		const fresh = run({
			view: v,
			fixIt: [fix('seeclickfix-1')],
			sources: sources(v, ok, ok, true, ok, true)
		});
		const gone = run({ view: v, fixIt: [], sources: sources(v, ok, ok, true, ok, true) });
		const f = { kind: '311-report' as const, title: 'Pothole', itemId: 'seeclickfix-1' };
		expect(v2FeatureView(f, kept)?.note).toMatch(/^Kept from/);
		expect(v2FeatureView(f, fresh)).toEqual(f);
		expect(v2FeatureView(f, gone)).toBeNull();
		expect(v2FeatureView({ kind: 'airport' as const, title: 'SFO' }, gone)).toEqual({
			kind: 'airport',
			title: 'SFO'
		});
	});
});

describe('v2FeatureView on the phone (MAPX2c): a data layer pin opens while it is drawn', () => {
	const d = run({ view: view([]), fixIt: [], sources: sources(view([]), ok, ok, true, ok, true) });
	const gas = { kind: 'gas-station' as const, title: 'Shell', itemId: 'p1' };
	const sfo = {
		kind: 'airport' as const,
		title: 'SFO — San Francisco Intl',
		subtitle: 'SFO no delays',
		source: 'FAA',
		itemId: 'SFO'
	};
	const detail = (title: string, meta: string[], paragraphs: string[]) => ({
		title,
		meta,
		paragraphs,
		source: null
	});
	it('opens when its layer draws it, and closes when it no longer does', () => {
		const drawn = new Map([['gas:p1', detail('Shell', ['Google Places', 'Regular $5.299'], [])]]);
		expect(v2FeatureView(gas, d, drawn)).toMatchObject({ kind: 'gas-station', title: 'Shell' });
		expect(v2FeatureView(gas, d, new Map())).toBeNull();
	});
	it('says what the layer says now, not what it said when tapped (Codex MAPX2c #1)', () => {
		const now = new Map([
			[
				'airport:SFO',
				detail('SFO · San Francisco Intl', ['FAA', '4:52 PM'], ['SFO ground delay, avg 45 min'])
			]
		]);
		const shown = v2FeatureView(sfo, d, now)!;
		expect(shown).toMatchObject({
			kind: 'airport',
			itemId: 'SFO',
			title: 'SFO · San Francisco Intl',
			subtitle: 'FAA · 4:52 PM',
			description: 'SFO ground delay, avg 45 min'
		});
		expect(JSON.stringify(shown)).not.toMatch(/no delays/);
	});
	it('a story at its headline’s place opens on a tablet with its place, and its kept note (NEWSPIN2)', () => {
		const kept = { ...d, notes: new Map([['bay', 'Kept from 7:40 AM · read failed']]) };
		const placedNow = new Map([
			[
				'news:bay',
				detail(
					'Kayak capsizes in Tomales Bay',
					['Marin IJ', '8:00 AM', 'Tomales Bay (area) · matched in the headline'],
					[]
				)
			]
		]);
		const story = { kind: 'story-place' as const, title: '', itemId: 'bay' };
		expect(v2FeatureView(story, kept, placedNow)).toMatchObject({
			kind: 'story-place',
			title: 'Kayak capsizes in Tomales Bay',
			subtitle: 'Marin IJ · 8:00 AM · Tomales Bay (area) · matched in the headline',
			note: 'Kept from 7:40 AM · read failed'
		});
		// No longer placed (or drawn): it closes.
		expect(v2FeatureView(story, kept, new Map())).toBeNull();
	});
});

describe('no-match with only failed (not kept) layers stays no-match (batch 2 contract)', () => {
	it('fresh news for the town, 311 and quakes down: "nothing for this town" with the failures named', () => {
		const v = view([pinStory('a')]);
		const d = run({
			view: v,
			sources: sources(v, ok, fail('HTTP 503'), false, fail('HTTP 500'), false),
			town: 'novato'
		});
		expect(d.coverage.state).toBe('no-match');
		expect(d.coverage.failing.map((e) => e.name)).toEqual(
			expect.arrayContaining(['Fix It Marin (311)'])
		);
	});
});

describe('kept news still blocks a town no-match when the town filter empties it (Codex 9c #1)', () => {
	it('retained Mill Valley news, Novato selected, 311 and quakes down: never "nothing for this town"', () => {
		const v = view([pinStory('a')], NOW - 3 * H, 'retained');
		const d = run({
			view: v,
			sources: sources(v, ok, fail('HTTP 503'), false, fail('HTTP 500'), false),
			town: 'novato'
		});
		expect(d.coverage.state).not.toBe('no-match');
		expect(describePresentation(d.coverage, NOW) ?? '').not.toContain('Nothing');
	});
});

describe('311 and quakes carry their payload time (map coverage label)', () => {
	it('everything loaded with times: coverage ok, no status line', () => {
		const v = view([pinStory('a')]);
		const d = run({
			view: v,
			fixIt: [fix('seeclickfix-1')],
			earthquakes: [quake],
			sources: sources(v, okAt(null), okAt(NOW - 3 * H), true, okAt(NOW - 60_000), true)
		});
		expect(d.coverage.state).toBe('ok');
		expect(describePresentation(d.coverage, NOW)).toBeNull();
	});
	it('a kept 311 layer says from when', () => {
		const v = view([]);
		const d = run({
			view: v,
			fixIt: [fix('seeclickfix-1')],
			sources: sources(v, ok, fail('HTTP 503'), true, okAt(NOW - 60_000), true, {
				fix: NOW - 3 * H
			})
		});
		expect(d.notes.get('seeclickfix-1')).toBe('Kept from 5:00 AM · the source returned an error');
	});
	it('every layer fresh within its own max age and empty: "Nothing on the map", never "Status unknown"', () => {
		const v = view([], NOW, 'empty');
		const d = run({
			view: v,
			fixIt: [],
			earthquakes: [],
			sources: sources(v, ok, okAt(NOW - 3 * H), true, okAt(NOW - 60_000), true)
		});
		expect(d.empty).toBe('Nothing on the map right now');
		expect(d.coverage.state).toBe('empty');
	});
	it('provenance: timed ok reads carry their payload time; an untimed read is unknown; no entry is loading', () => {
		const v = view([pinStory('a')]);
		const timed = run({
			view: v,
			fixIt: [],
			sources: sources(v, ok, okAt(NOW - 3 * H), true, okAt(NOW - 60_000), true)
		});
		expect(timed.provenance).toEqual({
			'311': { state: 'ok', observedAt: NOW - 3 * H },
			earthquakes: { state: 'ok', observedAt: NOW - 60_000 }
		});
		const untimed = run({ view: v, fixIt: [], sources: sources(v, ok, ok, true, ok, true) });
		expect(untimed.provenance['311']).toEqual({ state: 'unknown', observedAt: null });
		expect(run({}).provenance.earthquakes).toEqual({ state: 'loading', observedAt: null });
	});
});

describe('stories placed by their headline (NEWSPIN2)', () => {
	const bay = pinStory('bay', {
		title: 'Woman from Los Angeles dies after kayak capsizes in Tomales Bay',
		town: { name: 'Tomales', slug: 'tomales', source: 'title-match' },
		point: null
	});
	const lighthouse = pinStory('light', {
		title: 'Whale watchers crowd the Point Reyes Lighthouse',
		town: null,
		point: null
	});
	const townOnly = pinStory('town', { title: 'Mill Valley forum on fire alerts', point: null });
	const fed = pinStory('fed', { title: 'Tomales Bay oyster farms reopen', town: null });
	const read = (items: NewsSnapshotItem[]) => {
		const v = view(items);
		return run({ view: v, sources: sources(v, { ok: true, view: v } as never) });
	};

	it('places a story at its headline’s place; the feed’s point and a town stay as they were', () => {
		const d = read([bay, lighthouse, townOnly, fed]);
		expect([...d.placed.keys()]).toEqual(['bay', 'light']);
		expect(d.placed.get('bay')).toMatchObject({ precision: 'area', label: 'Tomales Bay' });
		// Placed stories aren't counted on a town's dot; nothing sets a point on the item.
		expect([...(d.layerData.placed ?? [])]).toEqual(['bay', 'light']);
		expect(d.layerData.news.find((i) => i.id === 'bay')).not.toHaveProperty('lat');
	});

	it('draws an area as a labelled halo and a venue as a dot, at the place', () => {
		const d = read([bay, lighthouse, townOnly, fed]);
		expect(d.storyPlaces).toEqual([
			{
				type: 'Feature',
				id: 'bay',
				geometry: { type: 'Point', coordinates: [-122.88, 38.16] },
				properties: expect.objectContaining({
					itemId: 'bay',
					precision: 'area',
					label: 'Tomales Bay (area)'
				})
			},
			{
				type: 'Feature',
				id: 'light',
				geometry: { type: 'Point', coordinates: [-123.0232, 37.9956] },
				properties: expect.objectContaining({
					itemId: 'light',
					precision: 'venue',
					label: 'Point Reyes Lighthouse'
				})
			}
		]);
	});

	it('a placed story without a town is drawable and inspectable', () => {
		const d = read([lighthouse]);
		expect(d.inspectable.map((i) => i.id)).toEqual(['light']);
	});

	it('follows the layer switches and the town filter', () => {
		const v = view([bay, lighthouse]);
		const s = sources(v, { ok: true, view: v } as never);
		expect(
			run({ view: v, sources: s, activeLayers: { ...ALL_ON, news: false } }).storyPlaces
		).toEqual([]);
		expect(run({ view: v, sources: s, town: 'tomales' }).storyPlaces.map((f) => f.id)).toEqual([
			'bay'
		]);
	});

	it('a kept snapshot marks its placed stories too', () => {
		const v = view([bay], NOW - 20 * 60_000);
		const d = run({ view: v, sources: sources(v, fail('news-snapshot: unknown (read-failed)')) });
		expect(d.storyPlaces[0].properties).toMatchObject({ retained: true });
	});

	it('a town’s tooltip lists only the stories counted on it (Codex NEWSPIN2 #4)', () => {
		const d = read([bay, townOnly]);
		expect(townLevel(d).map((i) => i.id)).toEqual(['town']);
	});

	it('the Stories note counts the placed stories in view; the rest stay town counts', () => {
		const d = read([bay, lighthouse, townOnly, fed]);
		expect(storiesNote(['news:bay', 'news:light', 'news:town', 'news:fed', '311:x'], d)).toBe(
			'2 placed by their headline · 1 counted on its town · 1 at its feed’s point'
		);
		expect(storiesNote(['news:town'], d)).toBe('1 counted on its town');
		expect(storiesNote([], d)).toBeNull();
	});
});

describe('the map shows stories from the last 7 days (MAPFRESH1)', () => {
	const D = 24 * H;
	const aged = (id: string, ageMs: number, over: Partial<NewsSnapshotItem> = {}) =>
		pinStory(id, { publishedAt: new Date(NOW - ageMs).toISOString(), ...over });
	const at = (v: NewsSnapshotView, now: number) =>
		run({ view: v, sources: sources(v, ok, ok, true, ok, true), now });

	it('a 30-day-old story is in no map output: news, placed, inspectable, pins or town counts', () => {
		const v = view([
			aged('fresh', H),
			aged('placed', H, { title: 'Crews on Angel Island', point: null }),
			aged('burn', 30 * D, { title: 'Prescribed burn on Angel Island', point: null }),
			aged('old-pin', 30 * D),
			aged('old-town', 30 * D, { point: null })
		]);
		const d = at(v, NOW);
		expect(d.layerData.news.map((i) => i.id)).toEqual(['fresh', 'placed']);
		expect([...(d.layerData.placed ?? [])]).toEqual(['placed']);
		expect([...d.placed.keys()]).toEqual(['placed']);
		expect(d.inspectable.map((i) => i.id)).toEqual(['fresh', 'placed']);
		expect(d.storyPlaces.map((f) => f.id)).toEqual(['placed']);
		expect(townLevel(d).map((i) => i.id)).toEqual(['fresh']);
	});

	it('the window is exactly 7 days: in at the edge, out a millisecond past it', () => {
		const v = view([aged('edge', 7 * D), aged('past', 7 * D + 1)]);
		expect(at(v, NOW).layerData.news.map((i) => i.id)).toEqual(['edge']);
	});

	it('a story ages out on the clock alone: the same snapshot, a later now', () => {
		const v = view([aged('a', 7 * D - 60_000)]);
		expect(at(v, NOW).inspectable.map((i) => i.id)).toEqual(['a']);
		const later = at(v, NOW + 2 * 60_000);
		expect(later.inspectable).toEqual([]);
		expect([...later.aged]).toEqual(['a']);
	});

	it('an undated or far-future story is not eligible: an age is never guessed', () => {
		const v = view([
			aged('undated', 0, { publishedAt: null, publishedAtStatus: 'missing' }),
			aged('future', -2 * D)
		]);
		expect(at(v, NOW).layerData.news).toEqual([]);
	});
});
