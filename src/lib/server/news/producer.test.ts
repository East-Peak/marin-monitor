// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NOW, RSS_WORDPRESS, rssWithItems } from '$lib/news/feed-fixtures';
import { parseNewsSnapshot, type NewsSnapshot } from '$lib/news/snapshot';
import type { BoundedFetchResult } from './bounded-fetch';
import { createMemoryBlobApi, type MemoryBlobApi } from './memory-blob-api';
import { runNewsProducer, type ProducerDeps } from './producer';
import { createSnapshotStore, NEWS_LEASE_KEY, NEWS_SNAPSHOT_KEY } from './snapshot-store';
import type { NewsSource } from './sources';

const HOUR = 3_600_000;

function source(id: string, priority: number): NewsSource {
	return {
		id,
		name: 'Point Reyes Light', // strict-local, so fixture items pass relevance
		url: `https://feeds.example/${id}`,
		category: 'local',
		verification: 'local_media',
		priority
	};
}
const A = source('a', 0);
const B = source('b', 1);

const ok = (text: string): BoundedFetchResult => ({
	ok: true,
	text,
	finalUrl: 'x',
	bytes: text.length
});
const down: BoundedFetchResult = { ok: false, reason: 'http-status', detail: 'HTTP 503' };
/** One story, carried by whichever feeds serve it. */
const STORY = `<rss><channel><item><title>Point Reyes oyster farm reopens</title><link>https://www.ptreyeslight.com/2026/09/28/oysters</link><pubDate>Mon, 28 Sep 2026 10:00:00 -0700</pubDate></item></channel></rss>`;
const EMPTY = `<rss><channel></channel></rss>`;

function deps(
	api: MemoryBlobApi,
	feeds: Record<string, BoundedFetchResult>,
	over: Partial<ProducerDeps> = {}
): ProducerDeps {
	const now = over.now ?? (() => NOW);
	return {
		sources: [A, B],
		store: createSnapshotStore(api),
		fetchFeed: async (url) => feeds[url] ?? down,
		now,
		deadlineAt: now() + 50_000,
		runId: 'run-1',
		...over
	};
}

const published = (api: MemoryBlobApi): NewsSnapshot => {
	const s = parseNewsSnapshot(JSON.parse(api.peek(NEWS_SNAPSHOT_KEY) ?? 'null'));
	if (!s) throw new Error('no valid snapshot published');
	return s;
};
const statusOf = (s: NewsSnapshot, id: string) => s.sources.find((x) => x.id === id);

describe('runNewsProducer — publication', () => {
	it('publishes revision 1 from an empty store with per-source status', async () => {
		const api = createMemoryBlobApi();
		const r = await runNewsProducer(
			deps(api, { [A.url]: ok(RSS_WORDPRESS), [B.url]: ok(rssWithItems(2)) })
		);
		expect(r).toMatchObject({ outcome: 'published', revision: 1, leaseReleased: true });
		const s = published(api);
		expect(s.sources.map((x) => [x.id, x.status])).toEqual([
			['a', 'ok'],
			['b', 'ok']
		]);
		expect(s.lastSuccessfulScrapeAt).toBe(new Date(NOW).toISOString());
		expect(api.peek(NEWS_LEASE_KEY)).toBeUndefined();
	});

	it('one feed failing does not block the others', async () => {
		const api = createMemoryBlobApi();
		await runNewsProducer(deps(api, { [A.url]: ok(RSS_WORDPRESS) }));
		const s = published(api);
		expect(statusOf(s, 'b')).toMatchObject({
			status: 'failed',
			lastError: 'http-status: HTTP 503'
		});
		expect(s.items.every((i) => i.sourceId === 'a')).toBe(true);
		expect(s.items.length).toBeGreaterThan(0);
	});

	it('an oversized feed fails (or retains) only its own source; the others still publish', async () => {
		// A 1.5 MB title: a valid feed under the fetch cap, but twice that once
		// it sits in both snapshot views — over the store's ceiling.
		const HUGE = STORY.replace(
			'Point Reyes oyster farm reopens',
			`Point Reyes ${'x'.repeat(1_550_000)}`
		);
		const api = createMemoryBlobApi();
		const first = await runNewsProducer(
			deps(api, { [A.url]: ok(RSS_WORDPRESS), [B.url]: ok(HUGE) })
		);
		expect(first).toMatchObject({ outcome: 'published', revision: 1 });
		expect(statusOf(published(api), 'b')).toMatchObject({ status: 'failed', itemCount: 0 });
		expect(statusOf(published(api), 'b')?.lastError).toMatch(/^too-large: /);
		expect(statusOf(published(api), 'a')).toMatchObject({ status: 'ok' });

		await runNewsProducer(
			deps(api, { [A.url]: ok(RSS_WORDPRESS), [B.url]: ok(STORY) }, { runId: 'run-2' })
		);
		await runNewsProducer(
			deps(api, { [A.url]: ok(RSS_WORDPRESS), [B.url]: ok(HUGE) }, { runId: 'run-3' })
		);
		const s = published(api);
		expect(s.revision).toBe(3);
		expect(statusOf(s, 'b')).toMatchObject({ status: 'retained', itemCount: 1 });
		expect(s.items.map((i) => i.title)).toContain('Point Reyes oyster farm reopens');
	});

	it('publishes a story carried by two feeds once, with both categories and sources', async () => {
		const api = createMemoryBlobApi();
		const crime = { ...B, category: 'safety' as const };
		await runNewsProducer(
			deps(api, { [A.url]: ok(STORY), [B.url]: ok(STORY) }, { sources: [A, crime] })
		);
		const s = published(api);
		expect(s.items).toHaveLength(1);
		expect(s.items[0]).toMatchObject({
			sourceId: 'a',
			categories: ['local', 'safety'],
			alsoReportedBy: ['b']
		});
	});

	it('advances lastSuccessfulScrapeAt with a real, advancing clock', async () => {
		const api = createMemoryBlobApi();
		let t = NOW;
		await runNewsProducer(
			deps(
				api,
				{ [A.url]: ok(RSS_WORDPRESS) },
				{ now: () => (t += 1_000), deadlineAt: NOW + 50_000 }
			)
		);
		const s = published(api);
		expect(s.lastSuccessfulScrapeAt).toBe(s.generatedAt);
		expect(Date.parse(statusOf(s, 'a')?.lastSuccessAt as string)).toBeLessThan(
			Date.parse(s.generatedAt)
		);
	});
});

describe('runNewsProducer — retention of a story shared by two sources (A wins dedupe)', () => {
	async function start() {
		const api = createMemoryBlobApi();
		await runNewsProducer(deps(api, { [A.url]: ok(STORY), [B.url]: ok(STORY) }));
		expect(published(api).items).toHaveLength(1);
		return api;
	}
	const later = (n: number) => ({ now: () => NOW + n * HOUR, runId: `run-${n + 1}` });
	const storyTitles = (s: NewsSnapshot) => s.items.map((i) => i.title);

	it('duplicate → failure: B fails while A still carries it — B keeps its own copy', async () => {
		const api = await start();
		await runNewsProducer(deps(api, { [A.url]: ok(STORY) }, later(1)));
		const s = published(api);
		expect(statusOf(s, 'b')).toMatchObject({
			status: 'retained',
			itemCount: 1,
			consecutiveFailures: 1
		});
		expect(storyTitles(s)).toEqual(['Point Reyes oyster farm reopens']);
		expect(s.items[0].alsoReportedBy).toEqual(['b']);
	});

	it('winner-empty: A drops the story and B fails — the story survives from B', async () => {
		const api = await start();
		await runNewsProducer(deps(api, { [A.url]: ok(EMPTY) }, later(1)));
		const s = published(api);
		expect(statusOf(s, 'a')).toMatchObject({ status: 'empty' });
		expect(statusOf(s, 'b')).toMatchObject({ status: 'retained' });
		expect(s.items.map((i) => i.sourceId)).toEqual(['b']);
	});

	it('both fail — both are retained and the story stays', async () => {
		const api = await start();
		await runNewsProducer(deps(api, {}, later(1)));
		const s = published(api);
		expect([statusOf(s, 'a')?.status, statusOf(s, 'b')?.status]).toEqual(['retained', 'retained']);
		expect(storyTitles(s)).toEqual(['Point Reyes oyster farm reopens']);
		expect(s.lastSuccessfulScrapeAt).toBe(new Date(NOW).toISOString());
	});

	it('recovery: B succeeds again — ok, failures reset, still one story', async () => {
		const api = await start();
		await runNewsProducer(deps(api, { [A.url]: ok(STORY) }, later(1)));
		await runNewsProducer(deps(api, { [A.url]: ok(STORY), [B.url]: ok(STORY) }, later(2)));
		const s = published(api);
		expect(statusOf(s, 'b')).toMatchObject({
			status: 'ok',
			consecutiveFailures: 0,
			lastError: null
		});
		expect(s.items).toHaveLength(1);
	});

	it('retention expires: after 48h without success B contributes nothing', async () => {
		const api = await start();
		await runNewsProducer(deps(api, { [A.url]: ok(EMPTY) }, later(49)));
		const s = published(api);
		expect(statusOf(s, 'b')).toMatchObject({ status: 'failed', itemCount: 0 });
		expect(s.items).toEqual([]);
	});
});

describe('runNewsProducer — overlap and invalid state', () => {
	it('an overlapping invocation skips without fetching (lease held)', async () => {
		const api = createMemoryBlobApi();
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const fetchFeed = vi.fn(async () => {
			await gate;
			return ok(rssWithItems(1));
		});
		const first = runNewsProducer(deps(api, {}, { fetchFeed, runId: 'first' }));
		await vi.waitFor(() => expect(fetchFeed).toHaveBeenCalled());
		const secondFetch = vi.fn();
		expect(
			await runNewsProducer(deps(api, {}, { fetchFeed: secondFetch, runId: 'second' }))
		).toEqual({
			outcome: 'skipped-locked'
		});
		expect(secondFetch).not.toHaveBeenCalled();
		release();
		expect(await first).toMatchObject({ outcome: 'published', revision: 1 });
	});

	it('a run whose base revision moved is superseded and does not overwrite newer data', async () => {
		const api = createMemoryBlobApi();
		await runNewsProducer(deps(api, { [A.url]: ok(RSS_WORDPRESS) }));
		const fetchFeed = async (url: string) => {
			if (url === A.url) {
				const found = await api.read(NEWS_SNAPSHOT_KEY, new AbortController().signal);
				const newer = { ...published(api), revision: 2 };
				await api.write(
					NEWS_SNAPSHOT_KEY,
					JSON.stringify(newer),
					{ ifMatch: found!.etag },
					new AbortController().signal
				);
			}
			return ok(rssWithItems(1));
		};
		const r = await runNewsProducer(
			deps(api, {}, { fetchFeed, runId: 'late', now: () => NOW + HOUR })
		);
		expect(r).toEqual({ outcome: 'superseded', revision: 2, leaseReleased: true });
		expect(published(api).revision).toBe(2);
	});

	it('is not blocked by a lease left behind by a run killed at maxDuration', async () => {
		const api = createMemoryBlobApi({
			[NEWS_LEASE_KEY]: JSON.stringify({ runId: 'killed', expiresAt: NOW - 1 })
		});
		expect(await runNewsProducer(deps(api, { [A.url]: ok(RSS_WORDPRESS) }))).toMatchObject({
			outcome: 'published'
		});
	});

	it('replaces a malformed previous snapshot without retaining from it, keeping numbering monotonic', async () => {
		const api = createMemoryBlobApi();
		await runNewsProducer(deps(api, { [A.url]: ok(STORY), [B.url]: ok(STORY) }));
		const corrupt = JSON.parse(api.peek(NEWS_SNAPSHOT_KEY) as string);
		corrupt.revision = 41;
		corrupt.sources[1].items[0].link = 'javascript:alert(1)';
		const tampered = createMemoryBlobApi({ [NEWS_SNAPSHOT_KEY]: JSON.stringify(corrupt) });
		await runNewsProducer(deps(tampered, { [A.url]: ok(STORY) }, { now: () => NOW + HOUR }));
		const s = published(tampered);
		expect(s.revision).toBe(42);
		expect(statusOf(s, 'b')).toMatchObject({ status: 'failed', items: [] }); // nothing retained from invalid state
		expect(JSON.stringify(s)).not.toContain('javascript:');
	});
});

describe('runNewsProducer — one invocation deadline covers storage too', () => {
	const LIMITS = { blobOpMs: 200, publishReserveMs: 120, releaseReserveMs: 40 };
	const clock = () => Date.now();

	it('gives up on a delayed snapshot read and still releases the lease, inside the deadline', async () => {
		const api = createMemoryBlobApi();
		api.before = (op, key) =>
			op === 'read' && key === NEWS_SNAPSHOT_KEY
				? new Promise((r) => setTimeout(r, 1_000))
				: undefined;
		const started = Date.now();
		await expect(
			runNewsProducer(deps(api, {}, { now: clock, deadlineAt: started + 300, limits: LIMITS }))
		).rejects.toThrow();
		expect(Date.now() - started).toBeLessThan(300);
		expect(api.peek(NEWS_LEASE_KEY)).toBeUndefined();
	});

	it('abandons a stalled publish before the deadline and releases the lease', async () => {
		const api = createMemoryBlobApi();
		api.before = (op, key) =>
			op === 'write' && key === NEWS_SNAPSHOT_KEY ? new Promise(() => {}) : undefined;
		const started = Date.now();
		await expect(
			runNewsProducer(
				deps(
					api,
					{ [A.url]: ok(RSS_WORDPRESS) },
					{ now: clock, deadlineAt: started + 300, limits: LIMITS }
				)
			)
		).rejects.toThrow();
		expect(Date.now() - started).toBeLessThan(300);
		expect(api.peek(NEWS_SNAPSHOT_KEY)).toBeUndefined();
		expect(api.peek(NEWS_LEASE_KEY)).toBeUndefined();
	});

	it('stops fetching when only the publish reserve is left, and still publishes', async () => {
		const api = createMemoryBlobApi();
		const fetchFeed = vi.fn(
			(_url: string, signal: AbortSignal) =>
				new Promise<BoundedFetchResult>((resolve) =>
					signal.addEventListener('abort', () =>
						resolve({ ok: false, reason: 'timeout', detail: 'run budget exhausted' })
					)
				)
		);
		const started = Date.now();
		const r = await runNewsProducer(
			deps(
				api,
				{},
				{ fetchFeed, now: clock, deadlineAt: started + 300, limits: { ...LIMITS, concurrency: 1 } }
			)
		);
		expect(r.outcome).toBe('published');
		expect(Date.now() - started).toBeLessThan(300);
		expect(fetchFeed).toHaveBeenCalledTimes(1);
		expect(published(api).sources.map((s) => s.lastError)).toEqual([
			'timeout: run budget exhausted',
			'timeout: run budget exhausted'
		]);
	});

	it('survives a transient storage error on retry of the next run (no wedged lease)', async () => {
		const api = createMemoryBlobApi();
		let failOnce = true;
		api.before = (op, key) => {
			if (op === 'write' && key === NEWS_SNAPSHOT_KEY && failOnce) {
				failOnce = false;
				throw new Error('blob store 503');
			}
		};
		await expect(runNewsProducer(deps(api, { [A.url]: ok(RSS_WORDPRESS) }))).rejects.toThrow('503');
		expect(
			await runNewsProducer(deps(api, { [A.url]: ok(RSS_WORDPRESS) }, { runId: 'retry' }))
		).toMatchObject({
			outcome: 'published',
			revision: 1
		});
	});

	it('reports a failed lease release without failing a published run', async () => {
		const api = createMemoryBlobApi();
		api.before = (op) => {
			if (op === 'remove') throw new Error('blob store down');
		};
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await runNewsProducer(deps(api, { [A.url]: ok(RSS_WORDPRESS) }))).toMatchObject({
			outcome: 'published',
			leaseReleased: false
		});
	});
});
