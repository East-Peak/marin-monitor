// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseNewsSnapshotView } from '$lib/news/snapshot';
import { createMemoryBlobApi } from './memory-blob-api';
import { NEWS_SNAPSHOT_KEY } from './snapshot-store';
import { publishedSnapshot } from './snapshot-fixture';
import {
	readNewsSnapshot,
	SNAPSHOT_BROWSER_CACHE_CONTROL,
	SNAPSHOT_CDN_CACHE_CONTROL,
	SNAPSHOT_ERROR_CACHE_CONTROL,
	snapshotHttp
} from './read-snapshot';

const stored = (text: string) => createMemoryBlobApi({ [NEWS_SNAPSHOT_KEY]: text });

describe('readNewsSnapshot', () => {
	it('serves the public projection of a valid snapshot — no retention items', async () => {
		const snapshot = publishedSnapshot();
		const body = await readNewsSnapshot(stored(JSON.stringify(snapshot)));
		expect(body.status).toBe('ok');
		if (body.status !== 'ok') return;
		expect(body.snapshot.revision).toBe(snapshot.revision);
		expect(body.snapshot.items).toEqual(snapshot.items);
		expect(body.snapshot.sources.map((s) => s.id)).toEqual(['point-reyes-light']);
		expect(body.snapshot.sources.some((s) => 'items' in s)).toBe(false);
		expect(parseNewsSnapshotView(JSON.parse(JSON.stringify(body.snapshot)))).not.toBeNull();
	});

	it('nothing published yet → unavailable (missing)', async () => {
		expect(await readNewsSnapshot(createMemoryBlobApi())).toEqual({
			status: 'unavailable',
			reason: 'missing'
		});
	});

	it('a blob that fails the strict reader is never served → unknown (invalid)', async () => {
		const unsupported = JSON.stringify({ ...publishedSnapshot(), schemaVersion: 2 });
		for (const text of ['not json', unsupported]) {
			expect(await readNewsSnapshot(stored(text))).toEqual({
				status: 'unknown',
				reason: 'invalid'
			});
		}
	});

	it('a snapshot whose public view fails the browser reader is never served → unknown (invalid) (Codex slice review #3)', async () => {
		// The full reader accepts an extra same-source suffixed copy; the view
		// reader does not (more public stories than the source carries). Serving
		// it would cache a 200 every TV then rejects.
		const snapshot = publishedSnapshot();
		const extra = { ...snapshot.items[0], id: `${snapshot.items[0].id}~99` };
		const text = JSON.stringify({ ...snapshot, items: [...snapshot.items, extra] });
		expect(await readNewsSnapshot(stored(text))).toEqual({ status: 'unknown', reason: 'invalid' });
	});

	it('a stalled read ends at the timeout → unknown (read-failed)', async () => {
		const api = stored(JSON.stringify(publishedSnapshot()));
		api.before = () => new Promise(() => {});
		const started = Date.now();
		expect(await readNewsSnapshot(api, 50)).toEqual({ status: 'unknown', reason: 'read-failed' });
		expect(Date.now() - started).toBeLessThan(1_000);
	});

	it('a failing read → unknown (read-failed)', async () => {
		const api = stored(JSON.stringify(publishedSnapshot()));
		api.before = () => {
			throw new Error('blob 500');
		};
		expect(await readNewsSnapshot(api)).toEqual({ status: 'unknown', reason: 'read-failed' });
	});

	it('no Blob token → unknown (not-configured)', async () => {
		expect(await readNewsSnapshot(null)).toEqual({ status: 'unknown', reason: 'not-configured' });
	});
});

describe('snapshotHttp', () => {
	it('200: the browser always revalidates; only Vercel’s CDN holds a copy', () => {
		expect(snapshotHttp({ status: 'ok', snapshot: {} as never })).toEqual({
			status: 200,
			headers: {
				'Cache-Control': 'public, max-age=0, must-revalidate',
				'Vercel-CDN-Cache-Control': 'max-age=60, stale-while-revalidate=240'
			}
		});
		expect(SNAPSHOT_BROWSER_CACHE_CONTROL).toBe('public, max-age=0, must-revalidate');
		expect(SNAPSHOT_CDN_CACHE_CONTROL).toBe('max-age=60, stale-while-revalidate=240');
	});

	it('503 for every failure, never cached anywhere (Vercel does not cache 503 either)', () => {
		for (const failure of [
			{ status: 'unavailable', reason: 'missing' },
			{ status: 'unknown', reason: 'invalid' },
			{ status: 'unknown', reason: 'read-failed' },
			{ status: 'unknown', reason: 'not-configured' }
		] as const) {
			expect(snapshotHttp(failure)).toEqual({
				status: 503,
				headers: { 'Cache-Control': 'no-store' }
			});
		}
		expect(SNAPSHOT_ERROR_CACHE_CONTROL).toBe('no-store');
	});
});
