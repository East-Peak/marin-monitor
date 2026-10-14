import { beforeEach, describe, expect, it, vi } from 'vitest';

const { put, fetchWithTimeout } = vi.hoisted(() => ({
	put: vi.fn(),
	fetchWithTimeout: vi.fn()
}));
vi.mock('@vercel/blob', () => ({ put }));
vi.mock('$env/dynamic/private', () => ({ env: { BLOB_READ_WRITE_TOKEN: 'test-token' } }));
vi.mock('$lib/server/cron-auth', () => ({ verifyCronAuth: () => null }));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout }));

const { GET } = await import('./+server');
const call = () =>
	GET({ request: new Request('https://marinmonitor.com/api/cron/sync-311') } as never);

describe('GET /api/cron/sync-311 never stamps a fresh time on a non-answer (map coverage label)', () => {
	beforeEach(() => {
		put.mockReset();
		fetchWithTimeout.mockReset();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	it.each([[{}], [{ error: 'rate limited' }], [{ issues: null }], [{ issues: 'x' }]])(
		'a 200 body without an issues array (%j) fails loudly and keeps the last-good blob (and its lastUpdated)',
		async (body) => {
			fetchWithTimeout.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
			const res = await call();
			expect(res.status).toBe(500);
			expect(put).not.toHaveBeenCalled();
		}
	);

	it.each([[[{}]], [['x']], [[null]], [[{ id: '1' }]]])(
		'an issues array with a row that is not an issue (%j) fails loudly and keeps the last-good blob (Codex code review r1 #1)',
		async (issues) => {
			fetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({ issues }), { status: 200 }));
			const res = await call();
			expect(res.status).toBe(500);
			expect(put).not.toHaveBeenCalled();
		}
	);

	it('a genuine empty week (issues: []) is a real success and is written', async () => {
		fetchWithTimeout.mockResolvedValue(
			new Response(JSON.stringify({ issues: [] }), { status: 200 })
		);
		const res = await call();
		expect(res.status).toBe(200);
		expect(put).toHaveBeenCalledTimes(1);
	});
});
