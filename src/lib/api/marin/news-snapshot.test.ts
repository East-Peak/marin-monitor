// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOW } from '$lib/news/feed-fixtures';
import { toNewsSnapshotView, type NewsSnapshotView } from '$lib/news/snapshot';
import { publishedSnapshot } from '$lib/server/news/snapshot-fixture';
import {
	fetchNewsSnapshot,
	NEWS_SNAPSHOT_URL,
	RETAINED_DEGRADED_AFTER_MS,
	SNAPSHOT_STALE_AFTER_MS,
	snapshotItemToNewsItem,
	snapshotProblems
} from './news-snapshot';

const view = (): NewsSnapshotView => toNewsSnapshotView(publishedSnapshot());
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const iso = (ms: number) => new Date(ms).toISOString();

afterEach(() => vi.unstubAllGlobals());

describe('fetchNewsSnapshot', () => {
	it('returns a valid snapshot from the endpoint, with a cancellable request', async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
			json({ status: 'ok', snapshot: view() })
		);
		vi.stubGlobal('fetch', fetchMock);
		expect(await fetchNewsSnapshot()).toEqual({ status: 'ok', snapshot: view() });
		expect(fetchMock).toHaveBeenCalledWith(
			NEWS_SNAPSHOT_URL,
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
	});

	it('passes an honest outage through', async () => {
		vi.stubGlobal('fetch', async () => json({ status: 'unavailable', reason: 'missing' }, 503));
		expect(await fetchNewsSnapshot()).toEqual({ status: 'unavailable', reason: 'missing' });
	});

	it('a body that fails the strict reader is unknown (invalid) — never shown', async () => {
		const tampered = view();
		tampered.items[0] = { ...tampered.items[0], publishedAt: '2026-09-28T18:00:00.000Z' };
		vi.stubGlobal('fetch', async () => json({ status: 'ok', snapshot: tampered }));
		expect(await fetchNewsSnapshot()).toEqual({ status: 'unknown', reason: 'invalid' });
	});

	it('a non-JSON error page is unknown (read-failed)', async () => {
		vi.stubGlobal(
			'fetch',
			async () => new Response('<html>504 Gateway Timeout</html>', { status: 504 })
		);
		expect(await fetchNewsSnapshot()).toEqual({ status: 'unknown', reason: 'read-failed' });
	});

	it('a network failure is unknown (read-failed)', async () => {
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('Failed to fetch');
		});
		expect(await fetchNewsSnapshot()).toEqual({ status: 'unknown', reason: 'read-failed' });
	});

	it('headers then a stalled body end at the deadline (Codex r1 #6)', async () => {
		vi.stubGlobal(
			'fetch',
			async () => new Response(new ReadableStream({ start() {} }), { status: 200 })
		);
		const started = Date.now();
		expect(await fetchNewsSnapshot({ timeoutMs: 50 })).toEqual({
			status: 'unknown',
			reason: 'read-failed'
		});
		expect(Date.now() - started).toBeLessThan(1_000);
	});

	it("the owner's abort ends a pending read", async () => {
		vi.stubGlobal(
			'fetch',
			async () => new Response(new ReadableStream({ start() {} }), { status: 200 })
		);
		const owner = new AbortController();
		const pending = fetchNewsSnapshot({ signal: owner.signal });
		owner.abort();
		expect(await pending).toEqual({ status: 'unknown', reason: 'read-failed' });
	});
});

describe('snapshotItemToNewsItem', () => {
	const [dated, withPoint] = view().items;

	it('keeps the publication time, its provenance, the town and the topics', () => {
		const item = snapshotItemToNewsItem(dated);
		expect(item).toMatchObject({
			id: dated.id,
			title: dated.title,
			link: dated.link,
			source: 'Point Reyes Light',
			category: 'local',
			verification: 'local_media',
			timestamp: Date.parse('2026-09-28T19:00:00.000Z'),
			pubDate: 'Mon, 28 Sep 2026 12:00:00 -0700',
			publishedAtSource: 'rss:pubDate',
			publishedAtStatus: 'valid',
			town: 'Mill Valley',
			townSlug: 'mill-valley',
			topics: dated.topics
		});
		expect(item.lat).toBeUndefined();
	});

	it('feed coordinates become an exact pin; nothing is geocoded', () => {
		expect(snapshotItemToNewsItem(withPoint)).toMatchObject({
			lat: 37.859,
			lon: -122.4852,
			locationConfidence: 'exact',
			locationEvidence: 'feed coordinates'
		});
	});

	it('an unknown publication time stays unknown (NaN), never "now"', () => {
		const item = snapshotItemToNewsItem({
			...dated,
			publishedAt: null,
			publishedAtRaw: null,
			publishedAtSource: null,
			publishedAtStatus: 'missing'
		});
		expect(Number.isNaN(item.timestamp)).toBe(true);
		expect(item.publishedAtStatus).toBe('missing');
		expect(item.pubDate).toBeUndefined();
	});
});

describe('snapshotProblems', () => {
	const base = view(); // generatedAt = lastSuccessfulScrapeAt = NOW
	const [prl] = base.sources;

	it('a fresh snapshot with healthy sources has no problems', () => {
		expect(snapshotProblems(base, NOW)).toEqual([]);
	});

	it('publication age: not published for more than 45 min', () => {
		expect(snapshotProblems(base, NOW + SNAPSHOT_STALE_AFTER_MS)).toEqual([]);
		expect(snapshotProblems(base, NOW + SNAPSHOT_STALE_AFTER_MS + 1)).toEqual([
			`news-snapshot: not published since ${base.generatedAt}`,
			`news-snapshot: no successful fetch since ${base.lastSuccessfulScrapeAt}`
		]);
	});

	it('observation age ≠ publication age: runs keep publishing while nothing fetches (Codex r1 #11)', () => {
		const advancing: NewsSnapshotView = {
			...base,
			generatedAt: iso(NOW + 3 * 3_600_000),
			lastSuccessfulScrapeAt: base.lastSuccessfulScrapeAt
		};
		expect(snapshotProblems(advancing, NOW + 3 * 3_600_000)).toEqual([
			`news-snapshot: no successful fetch since ${base.lastSuccessfulScrapeAt}`
		]);
		expect(snapshotProblems({ ...base, lastSuccessfulScrapeAt: null }, NOW)).toEqual([
			'news-snapshot: no successful fetch since ever'
		]);
	});

	it('failed sources count; retained ones count only beyond 2 h since their last success', () => {
		const lastOk = (msAgo: number) => iso(NOW - msAgo);
		const withSources = (retainedAgo: number): NewsSnapshotView => ({
			...base,
			sources: [
				prl,
				{
					...prl,
					id: 'marin-ij',
					name: 'Marin IJ',
					status: 'failed',
					lastSuccessAt: null,
					lastError: 'http-status: HTTP 403',
					consecutiveFailures: 3,
					itemCount: 0
				},
				{
					...prl,
					id: 'kqed',
					name: 'KQED',
					status: 'retained',
					lastSuccessAt: lastOk(retainedAgo),
					lastError: 'timeout',
					consecutiveFailures: 1
				}
			]
		});
		expect(snapshotProblems(withSources(RETAINED_DEGRADED_AFTER_MS), NOW)).toEqual([
			'news:marin-ij: http-status: HTTP 403'
		]);
		expect(snapshotProblems(withSources(RETAINED_DEGRADED_AFTER_MS + 1), NOW)).toEqual([
			'news:marin-ij: http-status: HTTP 403',
			`news:kqed: retained, last fetched ${lastOk(RETAINED_DEGRADED_AFTER_MS + 1)}`
		]);
	});
});
