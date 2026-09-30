// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBlobApi, type MemoryBlobApi } from '$lib/server/news/memory-blob-api';
import { NEWS_SNAPSHOT_KEY } from '$lib/server/news/snapshot-store';
import { publishedSnapshot } from '$lib/server/news/snapshot-fixture';

let api: MemoryBlobApi;
const mockEnv: Record<string, string | undefined> = {};
const vercelBlobApi = vi.fn((_token: string) => api);

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/server/news/vercel-blob-api', () => ({ vercelBlobApi }));

const { GET } = await import('./+server');
const call = () => GET({} as Parameters<typeof GET>[0]);

beforeEach(() => {
	api = createMemoryBlobApi();
	vercelBlobApi.mockClear();
	mockEnv.BLOB_READ_WRITE_TOKEN = 'tok';
});

describe('GET /api/news/snapshot', () => {
	it('200: the validated view, JSON, browser revalidates, Vercel CDN caches', async () => {
		api = createMemoryBlobApi({ [NEWS_SNAPSHOT_KEY]: JSON.stringify(publishedSnapshot()) });
		const res = await call();
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('application/json');
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
		expect(res.headers.get('Vercel-CDN-Cache-Control')).toBe(
			'max-age=60, stale-while-revalidate=240'
		);
		const body = await res.json();
		expect(body.status).toBe('ok');
		expect(body.snapshot.revision).toBe(1);
		expect(vercelBlobApi).toHaveBeenCalledWith('tok');
	});

	it('503 unavailable when nothing is published, uncached', async () => {
		const res = await call();
		expect(res.status).toBe(503);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
		expect(res.headers.get('Vercel-CDN-Cache-Control')).toBeNull();
		expect(await res.json()).toEqual({ status: 'unavailable', reason: 'missing' });
	});

	it('503 unknown (not-configured) without a token, and never builds a Blob client', async () => {
		mockEnv.BLOB_READ_WRITE_TOKEN = undefined;
		const res = await call();
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ status: 'unknown', reason: 'not-configured' });
		expect(vercelBlobApi).not.toHaveBeenCalled();
	});
});
