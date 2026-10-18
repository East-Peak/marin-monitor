import { describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn<(url: string) => Promise<Response>>();
vi.mock('./fetch-helpers', () => ({
	fetchAndRead: (url: string, _options: RequestInit, read: (r: Response) => Promise<unknown>) =>
		mockFetch(url).then(read)
}));
vi.mock('$lib/config/api', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { fetchActivityReadWithStatus } = await import('./activity');

const items = [{ id: 'shows:x', title: 'A show' }];
const respond = (headers: Record<string, string>) =>
	new Response(JSON.stringify(items), { status: 200, headers });

describe('fetchActivityReadWithStatus (NEWSPIN1)', () => {
	it('keeps the payload’s own sync time with its items', async () => {
		mockFetch.mockResolvedValueOnce(respond({ 'X-Synced-At': '2026-10-18T18:00:05.000Z' }));
		expect(await fetchActivityReadWithStatus()).toEqual({
			ok: true,
			dataSource: 'live',
			data: { items, syncedAt: '2026-10-18T18:00:05.000Z' }
		});
	});

	it('says no time when the payload reports none (the static fallback)', async () => {
		mockFetch.mockResolvedValueOnce(respond({ 'X-Data-Source': 'static-fallback' }));
		expect(await fetchActivityReadWithStatus()).toEqual({
			ok: true,
			dataSource: 'static-fallback',
			data: { items, syncedAt: null }
		});
	});

	it('fails as a failure, never an empty calendar', async () => {
		mockFetch.mockResolvedValueOnce(new Response('{}', { status: 503 }));
		expect(await fetchActivityReadWithStatus()).toMatchObject({ ok: false, error: 'HTTP 503' });
	});
});
