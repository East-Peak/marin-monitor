// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- SvelteKit RequestEvent mock; handler uses request only */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBlobApi, type MemoryBlobApi } from '$lib/server/news/memory-blob-api';
import type { GgAlertsBlob } from '$lib/gg-alerts';

const PAGE = readFileSync(
	join(process.cwd(), 'src/lib/server/__fixtures__/gg-alerts-2026-10-23.html'),
	'utf8'
);
const KEY = 'gg-alerts.json';
let api: MemoryBlobApi;
const mockEnv: Record<string, string> = {};

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/server/news/vercel-blob-api', () => ({ vercelBlobApi: () => api }));

const { GET } = await import('./+server');

const event = (auth = 'Bearer secret') =>
	({
		request: new Request('https://localhost/api/cron/sync-gg-alerts', {
			headers: { authorization: auth }
		})
	}) as any;
const stored = () => JSON.parse(api.peek(KEY) ?? 'null') as GgAlertsBlob | null;
const serve = (body: string, status = 200) =>
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'text/html' } }))
	);

beforeEach(() => {
	api = createMemoryBlobApi();
	Object.assign(mockEnv, { CRON_SECRET: 'secret', BLOB_READ_WRITE_TOKEN: 'tok' });
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-10-23T14:40:00.000Z'));
	serve(PAGE);
});

describe('GET /api/cron/sync-gg-alerts', () => {
	it('rejects a request without the cron secret, and writes nothing', async () => {
		expect((await GET(event('Bearer nope'))).status).toBe(401);
		expect(stored()).toBeNull();
	});

	it('reads the page once, naming marinmonitor.com, and writes the good read with its check time', async () => {
		const res = await GET(event());
		expect(res.status).toBe(200);
		const fetchMock = vi.mocked(fetch);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe('https://www.goldengate.org/alerts/');
		expect(new Headers(init?.headers).get('user-agent')).toMatch(/marinmonitor\.com/);
		expect(stored()).toEqual({
			checkedAt: '2026-10-23T14:40:00.000Z',
			lastSuccessfulScrapeAt: '2026-10-23T14:40:00.000Z',
			alerts: [
				expect.objectContaining({ id: '549' }),
				expect.objectContaining({ id: '534' }),
				expect.objectContaining({ id: '155' })
			],
			lastFailure: null
		});
	});

	it('a failed read keeps the last good read with its own time, and records the failure', async () => {
		await GET(event());
		vi.setSystemTime(new Date('2026-10-23T14:55:00.000Z'));
		serve(PAGE.replace('Bus Alerts by Route', 'Bus Notices'));
		const res = await GET(event());
		expect(res.status).toBe(502);
		expect(stored()).toMatchObject({
			checkedAt: '2026-10-23T14:55:00.000Z',
			lastSuccessfulScrapeAt: '2026-10-23T14:40:00.000Z',
			lastFailure: { at: '2026-10-23T14:55:00.000Z', error: 'no bus section' }
		});
		expect(stored()?.alerts).toHaveLength(3);
	});

	it('an upstream error before any good read stores the failure, never "no alerts"', async () => {
		serve('busy', 503);
		expect((await GET(event())).status).toBe(502);
		expect(stored()).toMatchObject({
			lastSuccessfulScrapeAt: null,
			alerts: null,
			lastFailure: { error: expect.stringMatching(/503/) }
		});
	});

	it('an unreadable previous blob is never overwritten by a failed read', async () => {
		await GET(event());
		const before = api.peek(KEY);
		api.read = async () => {
			throw new Error('blob store down');
		};
		serve('busy', 503);
		expect((await GET(event())).status).toBe(500);
		expect(api.peek(KEY)).toBe(before);
	});

	it('a corrupt previous blob is replaced by a good read, not a run that fails forever', async () => {
		api = createMemoryBlobApi({ [KEY]: '{not json' });
		expect((await GET(event())).status).toBe(200);
		expect(stored()?.alerts).toHaveLength(3);
	});
});
