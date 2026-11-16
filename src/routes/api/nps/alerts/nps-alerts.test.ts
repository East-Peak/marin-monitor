import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchWithTimeout } = vi.hoisted(() => ({ mockFetchWithTimeout: vi.fn() }));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout: mockFetchWithTimeout }));
vi.mock('$lib/server/api-keys', () => ({ getNpsApiKey: () => 'test-key' }));

const { GET } = await import('./+server');
const call = () => GET({} as Parameters<typeof GET>[0]) as Promise<Response>;

let clock = Date.now();
// Each test starts past any cooldown a previous 429 set in the module.
beforeEach(() => {
	mockFetchWithTimeout.mockReset();
	vi.useFakeTimers();
	clock += 3_600_000;
	vi.setSystemTime(clock);
});
afterEach(() => vi.useRealTimers());

describe('/api/nps/alerts', () => {
	it('an upstream rate limit is a failure the client can see, never a 200 with no alerts (Codex desk4 #4)', async () => {
		mockFetchWithTimeout.mockResolvedValue(new Response('slow down', { status: 429 }));
		const res = await call();
		expect(res.ok).toBe(false);
		expect(res.status).toBe(429);
	});

	it('a successful upstream read returns its alerts', async () => {
		mockFetchWithTimeout.mockResolvedValue(
			new Response(JSON.stringify({ data: [{ id: 'a1' }] }), { status: 200 })
		);
		const res = await call();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([{ id: 'a1' }]);
	});

	it('a successful read is edge-cached (s-maxage; max-age alone is not honoured by the Vercel edge)', async () => {
		mockFetchWithTimeout.mockResolvedValue(
			new Response(JSON.stringify({ data: [] }), { status: 200 })
		);
		const res = await call();
		expect(res.headers.get('cache-control')).toBe(
			'public, max-age=300, s-maxage=900, stale-while-revalidate=3600'
		);
	});

	it('a rate limit is held briefly at the edge so a limited hour is not amplified, and stays a 429', async () => {
		mockFetchWithTimeout.mockResolvedValue(new Response('slow down', { status: 429 }));
		const res = await call();
		expect(res.status).toBe(429);
		expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300');
	});

	it('the edge never stores a 429, so the route backs off NPS itself for the cooldown, still answering 429', async () => {
		mockFetchWithTimeout.mockResolvedValue(new Response('slow down', { status: 429 }));
		await call();
		const again = await call();
		expect(again.status).toBe(429);
		expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(5 * 60_000 + 1);
		mockFetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({ data: [] })));
		expect((await call()).status).toBe(200);
		expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);
	});

	it('other upstream failures are not cached', async () => {
		mockFetchWithTimeout.mockResolvedValue(new Response('boom', { status: 500 }));
		const res = await call();
		expect(res.status).toBe(500);
		expect(res.headers.get('cache-control')).toBe('no-store');
	});
});
