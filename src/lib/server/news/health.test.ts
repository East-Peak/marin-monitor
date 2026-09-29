// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NOW, RSS_WORDPRESS } from '$lib/news/feed-fixtures';
import type { NewsSnapshot, NewsSourceStatus } from '$lib/news/snapshot';
import { buildSnapshot, ingestFeed, resolveSource } from './ingest';
import { createMemoryBlobApi } from './memory-blob-api';
import { NEWS_SOURCE_MAX_AGE_MS, newsSourceFailures, readNewsHealth } from './health';
import { NEWS_SNAPSHOT_KEY } from './snapshot-store';
import type { NewsSource } from './sources';

const SRC: NewsSource = {
	id: 'prl',
	name: 'Point Reyes Light',
	url: 'https://www.ptreyeslight.com/feed/',
	category: 'local',
	verification: 'local_media',
	priority: 0
};

function validSnapshot(): NewsSnapshot {
	const text = RSS_WORDPRESS;
	const status = resolveSource(
		SRC,
		ingestFeed(SRC, { ok: true, text, finalUrl: SRC.url, bytes: 1 }, NOW),
		undefined,
		NOW,
		1
	);
	return buildSnapshot({ revision: 0, lastSuccessfulScrapeAt: null }, [status], [SRC], NOW);
}

function status(
	name: string,
	lastSuccessAt: string | null,
	lastError: string | null
): NewsSourceStatus {
	return {
		id: name.toLowerCase().replace(/\s+/g, '-'),
		name,
		category: 'local',
		verification: 'local_media',
		status: 'failed',
		lastAttemptAt: new Date(NOW).toISOString(),
		lastSuccessAt,
		lastError,
		consecutiveFailures: 1,
		itemCount: 0,
		items: []
	};
}
const withSources = (sources: NewsSourceStatus[]): NewsSnapshot => ({
	...validSnapshot(),
	sources,
	items: []
});

describe('newsSourceFailures', () => {
	it('ignores sources that succeeded within the max age (one failed run is retention, not an alert)', () => {
		const recent = new Date(NOW - NEWS_SOURCE_MAX_AGE_MS).toISOString();
		expect(newsSourceFailures(withSources([status('Fresh', recent, 'timeout: x')]), NOW)).toEqual(
			[]
		);
	});
	it('reports a source with no success inside the max age, with its last error', () => {
		const old = new Date(NOW - NEWS_SOURCE_MAX_AGE_MS - 1).toISOString();
		expect(
			newsSourceFailures(withSources([status('Stale Feed', old, 'http-status: HTTP 404')]), NOW)
		).toEqual([
			{
				name: 'Stale Feed',
				parent: 'News feeds',
				problem: `no successful fetch since ${old} (last error: http-status: HTTP 404)`,
				disposition: 'Repair or retire the feed in src/lib/config/feeds.ts'
			}
		]);
	});
	it('reports a source that has never fetched successfully', () => {
		const [failure] = newsSourceFailures(
			withSources([status('New Feed', null, 'redirect-not-allowed: x')]),
			NOW
		);
		expect(failure.problem).toBe(
			'never fetched successfully (last error: redirect-not-allowed: x)'
		);
	});
});

describe('readNewsHealth — one validated read', () => {
	const now = new Date(NOW);

	it('observes a valid snapshot by lastSuccessfulScrapeAt and derives feed failures from the same read', async () => {
		const s = withSources([status('Dead Feed', null, 'parse: x')]);
		const h = await readNewsHealth(
			createMemoryBlobApi({ [NEWS_SNAPSHOT_KEY]: JSON.stringify(s) }),
			now
		);
		expect(h.observation).toEqual({
			kind: 'found',
			uploadedAt: null,
			contentTimestamp: s.lastSuccessfulScrapeAt
		});
		expect(h.failures.map((f) => f.name)).toEqual(['Dead Feed']);
	});

	it('reports a missing snapshot as missing (→ unavailable)', async () => {
		expect(await readNewsHealth(createMemoryBlobApi(), now)).toEqual({
			observation: { kind: 'missing' },
			failures: []
		});
	});

	it.each([
		['unsupported schema with a fresh timestamp', { ...validSnapshot(), schemaVersion: 2 }],
		[
			'a source status of "toString" with a fresh timestamp',
			(() => {
				const s = validSnapshot();
				(s.sources[0] as { status: string }).status = 'toString';
				return s;
			})()
		],
		[
			'a malformed item with a fresh timestamp',
			(() => {
				const s = validSnapshot();
				(s.items[0] as { link: string }).link = 'javascript:alert(1)';
				return s;
			})()
		]
	])('never reports %s as fresh (→ unknown)', async (_label, blob) => {
		const h = await readNewsHealth(
			createMemoryBlobApi({ [NEWS_SNAPSHOT_KEY]: JSON.stringify(blob) }),
			now
		);
		expect(h).toEqual({ observation: { kind: 'error' }, failures: [] });
	});

	it('treats a stalled read as unreadable (→ unknown) within its timeout', async () => {
		const api = createMemoryBlobApi({ [NEWS_SNAPSHOT_KEY]: JSON.stringify(validSnapshot()) });
		api.before = () => new Promise(() => {});
		const started = Date.now();
		expect((await readNewsHealth(api, now, 30)).observation).toEqual({ kind: 'error' });
		expect(Date.now() - started).toBeLessThan(200);
	});
});
