import { describe, expect, it } from 'vitest';
import type { NewsSnapshotItem, NewsSnapshotView } from '$lib/news/snapshot';
import type { NewsItem } from '$lib/types';
import type { SourceStatusEntry } from './source-status';
import { fromLoaderPart, fromSnapshotRead, fromSnapshotSource } from './source-adapters';
import { describePresentation } from './source-status';
import { v2FeatureView, v2Inspector, v2MapData } from './v2-map-data';

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
	quakeHad = false
): SourceStatusEntry[] {
	return [
		fromSnapshotRead(read, v),
		...(v?.sources ?? []).map(fromSnapshotSource),
		fromLoaderPart('seeclickfix', fixOutcome, fixHad),
		fromLoaderPart('earthquakes', quakeOutcome, quakeHad)
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
		expect(d.notes.get('a')).toBe('Kept from 7:40 AM · news-snapshot: unknown (read-failed)');
		expect(d.notes.get('seeclickfix-1')).toBe(
			'Kept from an earlier read (time not reported) · HTTP 503'
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
		const d = run({ view: v, fixIt: [], sources: sources(v, ok, ok, true, ok, true) });
		expect(d.established).toBe(true);
		expect(v2Inspector({ mode: 'town', townSlug: 'novato' }, d, name)).toMatchObject({ items: [] });
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
