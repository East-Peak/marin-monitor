import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/client', () => ({ serviceClient: { request: vi.fn() } }));
vi.mock('$lib/config/api', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { serviceClient } = await import('$lib/services/client');
const { fetchSheriffCrimeBlotter } = await import('./blotter');

describe('fetchSheriffCrimeBlotter ownership', () => {
	it('passes the owner signal to the service client (Codex PR 6 #1)', async () => {
		vi.mocked(serviceClient.request).mockResolvedValueOnce({ data: [] } as never);
		const owner = new AbortController();
		await fetchSheriffCrimeBlotter(36, 30, { signal: owner.signal });
		expect(vi.mocked(serviceClient.request).mock.calls[0][2]).toMatchObject({
			signal: owner.signal
		});
	});
});
