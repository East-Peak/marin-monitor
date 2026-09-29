// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- SvelteKit RequestEvent mock; handler uses request only */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RSS_WORDPRESS } from '$lib/news/feed-fixtures';
import { createMemoryBlobApi, type MemoryBlobApi } from '$lib/server/news/memory-blob-api';
import { NEWS_LEASE_KEY, NEWS_SNAPSHOT_KEY } from '$lib/server/news/snapshot-store';

let api: MemoryBlobApi;
const mockEnv: Record<string, string> = {};

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/server/news/vercel-blob-api', () => ({ vercelBlobApi: () => api }));

const { GET } = await import('./+server');
const { NEWS_SOURCES } = await import('$lib/server/news/sources');

const event = (auth?: string) =>
	({
		request: new Request('https://localhost/api/cron/produce-news', {
			headers: auth ? { authorization: auth } : {}
		})
	}) as any;

beforeEach(() => {
	api = createMemoryBlobApi();
	Object.assign(mockEnv, { CRON_SECRET: 'secret', BLOB_READ_WRITE_TOKEN: 'tok' });
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	// Every configured feed answers with the WordPress fixture.
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () =>
				new Response(RSS_WORDPRESS, { headers: { 'content-type': 'application/rss+xml' } })
		)
	);
});

describe('GET /api/cron/produce-news', () => {
	it('rejects a request without the cron secret', async () => {
		expect((await GET(event())).status).toBe(401);
		expect(api.peek(NEWS_SNAPSHOT_KEY)).toBeUndefined();
	});

	it('publishes a snapshot covering every configured source', async () => {
		const res = await GET(event('Bearer secret'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ outcome: 'published', revision: 1, leaseReleased: true });
		const snapshot = JSON.parse(api.peek(NEWS_SNAPSHOT_KEY) as string);
		expect(snapshot.sources.map((s: { id: string }) => s.id)).toEqual(
			NEWS_SOURCES.map((s) => s.id)
		);
		expect(fetch).toHaveBeenCalledTimes(NEWS_SOURCES.length);
	});

	it('answers 202 and does no upstream work while another run holds the lease', async () => {
		await api.write(
			NEWS_LEASE_KEY,
			JSON.stringify({ runId: 'other', expiresAt: Date.now() + 60_000 }),
			{ createOnly: true },
			new AbortController().signal
		);
		const res = await GET(event('Bearer secret'));
		expect(res.status).toBe(202);
		expect(await res.json()).toEqual({ outcome: 'skipped-locked' });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('fails closed with a generic 500 when the blob token is missing', async () => {
		mockEnv.BLOB_READ_WRITE_TOKEN = '';
		const res = await GET(event('Bearer secret'));
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ ok: false, error: 'sync failed' });
	});
});
