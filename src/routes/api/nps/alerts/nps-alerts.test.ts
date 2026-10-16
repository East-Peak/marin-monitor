import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchWithTimeout } = vi.hoisted(() => ({ mockFetchWithTimeout: vi.fn() }));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout: mockFetchWithTimeout }));
vi.mock('$lib/server/api-keys', () => ({ getNpsApiKey: () => 'test-key' }));

const { GET } = await import('./+server');
const call = () => GET({} as Parameters<typeof GET>[0]) as Promise<Response>;

beforeEach(() => mockFetchWithTimeout.mockReset());

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
});
