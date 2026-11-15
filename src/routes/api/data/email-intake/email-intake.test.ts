// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- SvelteKit RequestEvent mock; handler uses nothing */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBlobApi, type MemoryBlobApi } from '$lib/server/news/memory-blob-api';
import { FAKE_INBOUND, fixture } from '$lib/server/email-intake/fixtures';
import { parsePostmark } from '$lib/server/email-intake/postmark';
import { ingestEmail } from '$lib/server/email-intake/store';

let api: MemoryBlobApi;
const mockEnv: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/server/news/vercel-blob-api', () => ({ vercelBlobApi: () => api }));
vi.mock('$lib/server/email-intake/vercel-lister', () => ({ vercelBlobLister: () => api }));

const { GET } = await import('./+server');
const signal = new AbortController().signal;
const ingest = (name: string, over: Record<string, unknown> = {}) =>
	ingestEmail(parsePostmark({ ...fixture(name), ...over })!, {
		api,
		inbound: FAKE_INBOUND,
		now: () => new Date(),
		signal
	});

beforeEach(() => {
	api = createMemoryBlobApi();
	mockEnv.BLOB_READ_WRITE_TOKEN = 'tok';
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-11-14T12:00:00.000Z'));
});

describe('GET /api/data/email-intake', () => {
	it('serves the window, CDN-cached briefly; held items never', async () => {
		await ingest('transit-route-580');
		await ingest('transit-route-580', {
			Subject: 'Valkyries Parade Service Notice',
			Headers: fixture('transit-route-580').Headers.map((h: { Name: string; Value: string }) =>
				h.Name === 'Message-ID' ? { ...h, Value: '<held@x>' } : h
			)
		});
		const res = await GET({} as any);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toMatch(/s-maxage=60/);
		const body = await res.json();
		expect(body.items.map((i: { rule: string }) => i.rule)).toEqual(['gg-transit-alert']);
		expect(JSON.stringify(body)).not.toContain('Valkyries');
	});

	it('a failed read is a 503, never an empty list', async () => {
		api.before = (op) => {
			if (op === 'list') throw new Error('blob down');
		};
		const res = await GET({} as any);
		expect(res.status).toBe(503);
		expect(await res.text()).not.toContain('blob down');
	});

	it('no token is a 503', async () => {
		mockEnv.BLOB_READ_WRITE_TOKEN = undefined;
		expect((await GET({} as any)).status).toBe(503);
	});
});
