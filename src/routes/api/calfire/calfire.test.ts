import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithTimeout } = vi.hoisted(() => ({ fetchWithTimeout: vi.fn() }));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout }));

const { GET } = await import('./+server');
const get = () => GET({} as never) as Promise<Response>;

beforeEach(() => fetchWithTimeout.mockReset());

describe('GET /api/calfire', () => {
	it('a successful read is edge-cached (s-maxage)', async () => {
		fetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({ features: [] })));
		const res = await get();
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe(
			'public, max-age=120, s-maxage=300, stale-while-revalidate=300'
		);
	});

	it('upstream failures are not cached', async () => {
		fetchWithTimeout.mockResolvedValueOnce(new Response('x', { status: 503 }));
		expect((await get()).headers.get('cache-control')).toBe('no-store');
		fetchWithTimeout.mockRejectedValueOnce(new Error('down'));
		const res = await get();
		expect(res.status).toBe(502);
		expect(res.headers.get('cache-control')).toBe('no-store');
	});
});
