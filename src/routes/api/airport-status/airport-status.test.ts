import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithTimeout } = vi.hoisted(() => ({ fetchWithTimeout: vi.fn() }));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout }));

const { GET } = await import('./+server');

beforeEach(() => fetchWithTimeout.mockReset());

describe('GET /api/airport-status', () => {
	it('the response is edge-cached (s-maxage; max-age alone is not honoured by the Vercel edge)', async () => {
		fetchWithTimeout.mockImplementation(async () => new Response('down', { status: 503 }));
		const res = (await GET({} as never)) as Response;
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe(
			'public, max-age=300, s-maxage=300, stale-while-revalidate=300'
		);
	});
});
