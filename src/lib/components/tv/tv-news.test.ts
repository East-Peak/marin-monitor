import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { NewsSnapshotItem, NewsSnapshotResponse, NewsSnapshotView } from '$lib/news/snapshot';
import type { NewsCategory, NewsItem } from '$lib/types';

vi.mock('$app/environment', () => ({ browser: true, version: 'test' }));
vi.mock('$lib/services/client', () => ({ serviceClient: { request: vi.fn() } }));

const { createTvNewsLoader, TV_NEWS_SOURCES } = await import('./tv-news');
type TvNewsSources = typeof TV_NEWS_SOURCES;
const { news, allNewsItems, localNews, safetyNews } = await import('$lib/stores/news');
const { serviceClient } = await import('$lib/services/client');

const NOW = Date.parse('2026-09-29T18:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const at = (clock: string) => `2026-09-29T${clock}:00.000Z`;

function story(
	id: string,
	categories: NewsCategory[],
	publishedAt: string | null
): NewsSnapshotItem {
	return {
		id: `point-reyes-light:${id}`,
		sourceId: 'point-reyes-light',
		source: 'Point Reyes Light',
		category: categories[0],
		verification: 'local_media',
		title: `Point Reyes story ${id}`,
		link: `https://www.ptreyeslight.com/${id}`,
		canonicalUrl: `https://ptreyeslight.com/${id}`,
		summary: null,
		publishedAt,
		publishedAtRaw: publishedAt ? 'raw' : null,
		publishedAtSource: publishedAt ? 'rss:pubDate' : null,
		publishedAtStatus: publishedAt ? 'valid' : 'missing',
		publishedAtAssumedZone: null,
		eventAt: null,
		eventAtSource: null,
		updatedAt: null,
		fetchedAt: iso(0),
		town: null,
		point: null,
		topics: [],
		categories,
		alsoReportedBy: []
	};
}

type Summary = NewsSnapshotView['sources'][number];
const source = (category: NewsCategory, over: Partial<Summary> = {}): Summary => ({
	id: `src-${category}`,
	name: `Source ${category}`,
	category,
	verification: 'local_media',
	status: 'ok',
	lastAttemptAt: iso(MIN),
	lastSuccessAt: iso(MIN),
	lastError: null,
	consecutiveFailures: 0,
	itemCount: 1,
	...over
});

function ok(
	revision: number,
	items: NewsSnapshotItem[],
	over: Partial<NewsSnapshotView> = {}
): NewsSnapshotResponse {
	return {
		status: 'ok',
		snapshot: {
			schemaVersion: 1,
			revision,
			generatedAt: iso(MIN),
			lastSuccessfulScrapeAt: iso(MIN),
			sources: [source('local')],
			items,
			...over
		}
	};
}

const adapterItem = (id: string, category: NewsCategory, msAgo = 0): NewsItem => ({
	id,
	title: `Adapter ${id}`,
	link: '',
	timestamp: NOW - msAgo,
	source: 'Fix It Marin',
	category,
	verification: 'official'
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const ids = (items: NewsItem[] | undefined) => (items ?? []).map((i) => i.id);

const fakes = (): TvNewsSources => ({
	snapshot: async () => ok(1, []),
	nps: async () => [],
	earthquakes: async () => [],
	transit: async () => [],
	'sheriff-blotter': async () => [],
	'police-logs': async () => [],
	'supplemental-activity': async () => [],
	seeclickfix: async () => []
});

function harness(overrides: Partial<TvNewsSources> = {}, extra: { partDeadlineMs?: number } = {}) {
	const committed = new Map<NewsCategory, NewsItem[]>();
	const keeps = new Map<NewsCategory, (item: NewsItem) => boolean>();
	const quakes: NewsItem[][] = [];
	const applied: number[] = [];
	const owner = new AbortController();
	const reset = vi.fn();
	const commit = vi.fn(
		(category: NewsCategory, items: NewsItem[], keep: (item: NewsItem) => boolean) => {
			committed.set(category, items);
			keeps.set(category, keep);
		}
	);
	const loader = createTvNewsLoader({
		sources: { ...fakes(), ...overrides },
		signal: owner.signal,
		reset,
		commit,
		onEarthquakes: (items) => quakes.push(items),
		onSnapshotApplied: (view) => applied.push(view.revision),
		now: () => NOW,
		...extra
	});
	const commitsFor = (category: NewsCategory) =>
		commit.mock.calls.filter(([c]) => c === category).length;
	return { loader, committed, keeps, quakes, applied, commit, commitsFor, owner, reset };
}

const claims: { release(): void }[] = [];

/** The loader wired to the real news store, as TvWallboard wires it (claim at mount, token on every write). */
function storeLoader(overrides: Partial<TvNewsSources>) {
	const owner = new AbortController();
	let token: symbol | undefined;
	const loader = createTvNewsLoader({
		sources: { ...fakes(), ...overrides },
		signal: owner.signal,
		reset: () => {
			const claim = news.claim();
			claims.push(claim);
			token = claim.token;
		},
		commit: (category, items, keep) => news.setItems(category, items, { keep, owner: token }),
		onEarthquakes: () => {},
		now: () => NOW
	});
	return { loader, owner };
}

beforeEach(() => news.clearAll());
afterEach(() => claims.splice(0).forEach((claim) => claim.release()));

describe('createTvNewsLoader — arrival and placement', () => {
	it('commits 311 and earthquakes the moment they land, while the snapshot is still pending', async () => {
		const snapshot = deferred<NewsSnapshotResponse>();
		const h = harness({
			snapshot: () => snapshot.promise,
			seeclickfix: async () => [adapterItem('seeclickfix-1', '311')],
			earthquakes: async () => [adapterItem('usgs-1', 'safety')]
		});
		const done = h.loader.refresh();
		await tick();
		expect(ids(h.committed.get('311'))).toEqual(['seeclickfix-1']);
		expect(ids(h.committed.get('safety'))).toEqual(['usgs-1']);
		expect(h.quakes.map(ids)).toEqual([['usgs-1']]);
		snapshot.resolve(ok(1, []));
		expect(await done).toEqual([]);
		expect(h.applied).toEqual([1]);
	});

	it('places a category-specific copy of each story in every category it appeared in, merged newest-first, undated last', async () => {
		const h = harness({
			snapshot: async () =>
				ok(1, [story('a', ['local', 'safety'], iso(HOUR)), story('u', ['safety'], null)]),
			'police-logs': async () => [adapterItem('police-1', 'safety', 30 * MIN)],
			nps: async () => [adapterItem('nps-1', 'outdoors')],
			'supplemental-activity': async () => [adapterItem('activity-1', 'civic')]
		});
		expect(await h.loader.refresh()).toEqual([]);
		expect(ids(h.committed.get('local'))).toEqual(['point-reyes-light:a']);
		expect(h.committed.get('local')![0].category).toBe('local');
		expect(ids(h.committed.get('safety'))).toEqual([
			'police-1',
			'point-reyes-light:a',
			'point-reyes-light:u'
		]);
		expect(h.committed.get('safety')!.find((i) => i.id === 'point-reyes-light:a')!.category).toBe(
			'safety'
		);
		expect(ids(h.committed.get('outdoors'))).toEqual(['nps-1']);
		expect(ids(h.committed.get('civic'))).toEqual(['activity-1']);
	});

	it('real store: a multi-category story shows on both screens and counts once with both categories (Codex r1 #2)', async () => {
		const { loader } = storeLoader({
			snapshot: async () =>
				ok(1, [story('a', ['local', 'safety'], iso(HOUR))], {
					sources: [source('local'), source('safety')]
				})
		});
		await loader.refresh();
		expect(ids(get(localNews).items)).toEqual(['point-reyes-light:a']);
		expect(ids(get(safetyNews).items)).toEqual(['point-reyes-light:a']);
		const all = get(allNewsItems).filter((i) => i.id === 'point-reyes-light:a');
		expect(all).toHaveLength(1);
		expect(all[0].categories).toEqual(['local', 'safety']);
	});

	it('never re-judges snapshot stories; adapter items still pass the relevance rule', async () => {
		const ij = {
			...story('ij', ['local'], iso(HOUR)),
			id: 'marin-independent-journal:1',
			sourceId: 'marin-independent-journal',
			source: 'Marin Independent Journal',
			title: 'Council approves budget plan'
		};
		const h = harness({ snapshot: async () => ok(1, [ij]) });
		await h.loader.refresh();
		const keep = h.keeps.get('local')!;
		const [shown] = h.committed.get('local')!;
		expect(keep(shown)).toBe(true);
		expect(keep({ ...shown, id: 'police-9' })).toBe(false);
	});
});

describe('createTvNewsLoader — failures and ownership', () => {
	it('an unavailable or thrown snapshot keeps the stories already shown and is reported', async () => {
		const snapshot = vi
			.fn<(s: AbortSignal) => Promise<NewsSnapshotResponse>>()
			.mockResolvedValueOnce(ok(1, [story('a', ['local'], iso(HOUR))]))
			.mockResolvedValueOnce({ status: 'unavailable', reason: 'missing' })
			.mockRejectedValueOnce(new Error('boom'));
		const h = harness({ snapshot });
		await h.loader.refresh();
		const before = h.commitsFor('local');
		expect(await h.loader.refresh()).toEqual(['news-snapshot: unavailable (missing)']);
		expect(await h.loader.refresh()).toEqual(['news-snapshot: boom']);
		expect(h.commitsFor('local')).toBe(before);
		expect(ids(h.committed.get('local'))).toEqual(['point-reyes-light:a']);
	});

	it('applied-view problems persist and age while reads fail (Codex r1 #12)', async () => {
		let now = NOW;
		const snapshot = vi
			.fn<(s: AbortSignal) => Promise<NewsSnapshotResponse>>()
			.mockResolvedValueOnce(ok(1, [], { generatedAt: iso(0), lastSuccessfulScrapeAt: iso(0) }))
			.mockResolvedValue({ status: 'unknown', reason: 'read-failed' });
		const owner = new AbortController();
		const loader = createTvNewsLoader({
			sources: { ...fakes(), snapshot },
			signal: owner.signal,
			reset: () => {},
			commit: () => {},
			onEarthquakes: () => {},
			now: () => now
		});
		expect(await loader.refresh()).toEqual([]);
		now = NOW + 30 * MIN;
		expect(await loader.refresh()).toEqual(['news-snapshot: unknown (read-failed)']);
		now = NOW + 46 * MIN;
		expect(await loader.refresh()).toEqual([
			'news-snapshot: unknown (read-failed)',
			`news-snapshot: not published since ${iso(0)}`,
			`news-snapshot: no successful fetch since ${iso(0)}`
		]);
	});

	it('status-aware adapter: failure keeps its last items and is reported; a successful empty clears', async () => {
		const seeclickfix = vi
			.fn<() => Promise<NewsItem[]>>()
			.mockResolvedValueOnce([adapterItem('seeclickfix-1', '311')])
			.mockRejectedValueOnce(new Error('HTTP 503'))
			.mockResolvedValueOnce([]);
		const h = harness({ seeclickfix });
		await h.loader.refresh();
		expect(await h.loader.refresh()).toEqual(['seeclickfix: HTTP 503']);
		expect(ids(h.committed.get('311'))).toEqual(['seeclickfix-1']);
		expect(await h.loader.refresh()).toEqual([]);
		expect(ids(h.committed.get('311'))).toEqual([]);
	});

	it('production path: TV_NEWS_SOURCES.earthquakes keeps quake pins through a real USGS failure (Codex r1 #4)', async () => {
		const request = vi.mocked(serviceClient.request);
		const feature = {
			id: 'nc1',
			properties: {
				mag: 2.4,
				place: 'near Novato',
				time: NOW - HOUR,
				url: 'u',
				title: 't',
				type: 'earthquake'
			},
			geometry: { coordinates: [-122.57, 38.1, 5] }
		};
		request
			.mockResolvedValueOnce({ fromCache: false, data: { features: [feature] } } as never)
			.mockRejectedValueOnce(new Error('Network timeout'))
			.mockResolvedValueOnce({ fromCache: false, data: { features: [] } } as never);
		const h = harness({ earthquakes: TV_NEWS_SOURCES.earthquakes });
		await h.loader.refresh();
		expect(ids(h.committed.get('safety'))).toEqual(['usgs-nc1']);
		expect(await h.loader.refresh()).toEqual(['earthquakes: Network timeout']);
		expect(ids(h.committed.get('safety'))).toEqual(['usgs-nc1']);
		expect(h.quakes.map(ids)).toEqual([['usgs-nc1']]);
		expect(await h.loader.refresh()).toEqual([]);
		expect(ids(h.committed.get('safety'))).toEqual([]);
		expect(h.quakes.map(ids)).toEqual([['usgs-nc1'], []]);
	});

	it('production path: TV_NEWS_SOURCES.seeclickfix keeps 311 pins through an HTTP 503', async () => {
		const issue = {
			id: 7,
			status: 'Open',
			summary: 'Illegal Dumping',
			description: 'Couch',
			lat: 37.9735,
			lng: -122.5311,
			address: '1000 Fourth St, San Rafael, CA',
			created_at: iso(HOUR)
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ issues: [issue] }), { status: 200 }))
			.mockResolvedValueOnce(new Response('{}', { status: 503 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ issues: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const h = harness({ seeclickfix: TV_NEWS_SOURCES.seeclickfix });
		await h.loader.refresh();
		expect(ids(h.committed.get('311'))).toEqual(['seeclickfix-7']);
		expect(await h.loader.refresh()).toEqual(['seeclickfix: HTTP 503']);
		expect(ids(h.committed.get('311'))).toEqual(['seeclickfix-7']);
		expect(await h.loader.refresh()).toEqual([]);
		expect(ids(h.committed.get('311'))).toEqual([]);
		vi.unstubAllGlobals();
	});

	it('a part that never settles is reported at its deadline and the next refresh succeeds (Codex r1 #6)', async () => {
		const seeclickfix = vi
			.fn<() => Promise<NewsItem[]>>()
			.mockImplementationOnce(() => new Promise(() => {}))
			.mockResolvedValueOnce([adapterItem('seeclickfix-1', '311')]);
		const h = harness({ seeclickfix }, { partDeadlineMs: 20 });
		expect(await h.loader.refresh()).toEqual(['seeclickfix: timed out after 20 ms']);
		expect(await h.loader.refresh()).toEqual([]);
		expect(ids(h.committed.get('311'))).toEqual(['seeclickfix-1']);
	});

	const dash = (id: string, category: NewsCategory) => ({
		...adapterItem(id, category),
		source: 'Dashboard'
	});

	it('mount takes the whole store: creating the loader resets it once, before any request (Codex r2 #2/#3)', () => {
		news.setItems('cycling', [dash('dash-cycling', 'cycling')], { keep: () => true });
		const h = harness();
		expect(h.reset).toHaveBeenCalledTimes(1);
		expect(h.commit).not.toHaveBeenCalled();
		storeLoader({});
		expect(ids(news.getItems('cycling'))).toEqual([]);
	});

	it('real store: an all-empty successful refresh leaves no inherited cycling story (Codex r2 #2 regression)', async () => {
		news.setItems('cycling', [dash('dash-cycling', 'cycling')], { keep: () => true });
		const { loader } = storeLoader({});
		expect(await loader.refresh()).toEqual([]);
		expect(ids(news.getItems('cycling'))).toEqual([]);
	});

	it('real store: a failed snapshot keeps its own safety story through empty safety adapters (Codex r2 #3 regression)', async () => {
		const snapshot = vi
			.fn<(s: AbortSignal) => Promise<NewsSnapshotResponse>>()
			.mockResolvedValueOnce(
				ok(1, [story('s', ['safety'], iso(HOUR))], { sources: [source('safety')] })
			)
			.mockResolvedValueOnce({ status: 'unknown', reason: 'read-failed' });
		const { loader } = storeLoader({ snapshot }); // transit, police, sheriff, quakes: successful []
		await loader.refresh();
		expect(ids(news.getItems('safety'))).toEqual(['point-reyes-light:s']);
		expect(await loader.refresh()).toEqual(['news-snapshot: unknown (read-failed)']);
		expect(ids(news.getItems('safety'))).toEqual(['point-reyes-light:s']);
	});

	it("real store: Codex r2 #3's exact sequence — inherited safety is discarded at mount by design", async () => {
		news.setItems('safety', [dash('dash-safety', 'safety')], { keep: () => true });
		const { loader } = storeLoader({
			snapshot: async () => ({ status: 'unknown', reason: 'read-failed' })
		});
		// Intended: the TV never shows dashboard-owned data; it starts empty and
		// fills from its own parts (Decision 6).
		expect(ids(news.getItems('safety'))).toEqual([]);
		await loader.refresh();
		expect(ids(news.getItems('safety'))).toEqual([]);
	});

	it('real store: a failing status-aware adapter keeps its 311 pins through a successful snapshot', async () => {
		const seeclickfix = vi
			.fn<() => Promise<NewsItem[]>>()
			// As fetchSeeClickFixIssues builds it: the address resolves a town, the
			// local anchor the store's relevance rule keeps adapter items by.
			.mockResolvedValueOnce([
				{ ...adapterItem('seeclickfix-1', '311'), town: 'San Rafael', townSlug: 'san-rafael' }
			])
			.mockRejectedValueOnce(new Error('HTTP 503'));
		const { loader } = storeLoader({ seeclickfix });
		await loader.refresh();
		expect(await loader.refresh()).toEqual(['seeclickfix: HTTP 503']);
		expect(ids(news.getItems('311'))).toEqual(['seeclickfix-1']);
	});
});

describe('createTvNewsLoader — ordering and lifetime', () => {
	it('snapshot order is (generatedAt, revision): reset, then stale replays rejected (Codex r1 #5)', async () => {
		const snap = (rev: number, clock: string, id: string) =>
			ok(rev, [story(id, ['local'], iso(HOUR))], {
				generatedAt: at(clock),
				lastSuccessfulScrapeAt: at(clock)
			});
		const snapshot = vi
			.fn<(s: AbortSignal) => Promise<NewsSnapshotResponse>>()
			.mockResolvedValueOnce(snap(5, '11:00', 'pre'))
			.mockResolvedValueOnce(snap(1, '12:00', 'reset'))
			.mockResolvedValueOnce(snap(5, '11:00', 'pre')) // pre-reset copy replayed by an edge
			.mockResolvedValueOnce(snap(4, '10:45', 'older'))
			.mockResolvedValueOnce(snap(1, '12:00', 'reset')) // same again
			.mockResolvedValueOnce(snap(2, '12:15', 'next'));
		const h = harness({ snapshot });
		await h.loader.refresh();
		await h.loader.refresh();
		expect(ids(h.committed.get('local'))).toEqual(['point-reyes-light:reset']);
		const applied = h.commitsFor('local');
		await h.loader.refresh();
		await h.loader.refresh();
		await h.loader.refresh();
		expect(h.commitsFor('local')).toBe(applied);
		expect(ids(h.committed.get('local'))).toEqual(['point-reyes-light:reset']);
		await h.loader.refresh();
		expect(ids(h.committed.get('local'))).toEqual(['point-reyes-light:next']);
		expect(h.applied).toEqual([5, 1, 2]);
	});

	it('a disposed loader writes nothing when held responses finally land (Codex r1 #10)', async () => {
		const snapshot = deferred<NewsSnapshotResponse>();
		const quakes = deferred<NewsItem[]>();
		const h = harness({ snapshot: () => snapshot.promise, earthquakes: () => quakes.promise });
		const done = h.loader.refresh();
		await tick();
		h.commit.mockClear();
		h.owner.abort();
		snapshot.resolve(ok(1, [story('late', ['local'], iso(HOUR))]));
		quakes.resolve([adapterItem('usgs-late', 'safety')]);
		expect(await done).toEqual([]);
		expect(h.commit).not.toHaveBeenCalled();
		expect(h.quakes).toEqual([]);
		expect(h.applied).toEqual([]);
		expect(await h.loader.refresh()).toEqual([]);
		expect(h.commit).not.toHaveBeenCalled();
	});

	it('a superseded refresh writes nothing; the newer one wins', async () => {
		const first = deferred<NewsItem[]>();
		const seeclickfix = vi
			.fn<() => Promise<NewsItem[]>>()
			.mockImplementationOnce(() => first.promise)
			.mockResolvedValueOnce([adapterItem('seeclickfix-new', '311')]);
		const h = harness({ seeclickfix });
		const older = h.loader.refresh();
		await h.loader.refresh();
		first.resolve([adapterItem('seeclickfix-old', '311')]);
		expect(await older).toEqual([]);
		expect(ids(h.committed.get('311'))).toEqual(['seeclickfix-new']);
	});
});
