import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { ServiceClient } from './client';

const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
	mockFetch.mockReset();
	vi.stubGlobal('fetch', mockFetch);
	vi.useFakeTimers();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('ServiceClient owner signal (dashboard spec §13.6; Codex PR1 C1)', () => {
	it('starts no request once the owner signal has aborted', async () => {
		const owner = new AbortController();
		owner.abort();
		const client = new ServiceClient();

		await expect(
			client.request('NWS', '/owner-aborted', { useCache: false, signal: owner.signal })
		).rejects.toThrow();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('starts no retry after the owner aborts during a failed attempt', async () => {
		const owner = new AbortController();
		mockFetch.mockImplementation(async () => {
			owner.abort(); // the dashboard unmounts while the attempt is in flight
			throw new TypeError('network down');
		});
		const client = new ServiceClient();

		const pending = client.request('NWS', '/owner-retry', {
			useCache: false,
			retries: 2,
			signal: owner.signal
		});
		const settled = pending.catch((e: unknown) => e);
		await vi.advanceTimersByTimeAsync(30_000);

		expect(await settled).toBeInstanceOf(Error);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('without a signal a failed attempt still retries', async () => {
		mockFetch.mockRejectedValue(new TypeError('network down'));
		const client = new ServiceClient();

		const settled = client
			.request('NWS', '/no-owner', { useCache: false, retries: 1 })
			.catch((e: unknown) => e);
		await vi.advanceTimersByTimeAsync(30_000);

		expect(await settled).toBeInstanceOf(Error);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	// ---------- Shared deduplicated requests (post-push review of PR 1, item 1) ----------

	it("one caller's owner abort never leaks to another caller waiting on the same request", async () => {
		const owner = new AbortController();
		mockFetch
			.mockImplementationOnce(async () => {
				owner.abort(); // legacy is destroyed while the shared attempt is in flight
				throw new TypeError('network down');
			})
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ ok: 'retried' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);
		const client = new ServiceClient();

		const legacy = client
			.request('NWS', '/shared-key', { useCache: false, retries: 1, signal: owner.signal })
			.catch((e: unknown) => e);
		const tv = client.request('NWS', '/shared-key', { useCache: false, retries: 1 });
		await vi.advanceTimersByTimeAsync(30_000);

		expect((await tv).data).toEqual({ ok: 'retried' }); // the unowned waiter still got its retry
		expect(await legacy).toBeInstanceOf(Error);
		expect(mockFetch).toHaveBeenCalledTimes(2); // one shared attempt + one retry, not one per caller
	});

	it('when every owner has aborted, retries stop but the breaker still records the upstream failure', async () => {
		const owner = new AbortController();
		mockFetch.mockImplementation(async () => {
			owner.abort();
			throw new TypeError('network down');
		});
		const client = new ServiceClient();

		const settled = client
			.request('NWS', '/owner-failure', { useCache: false, retries: 2, signal: owner.signal })
			.catch((e: unknown) => e);
		await vi.advanceTimersByTimeAsync(30_000);

		expect(await settled).toBeInstanceOf(Error);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const breakers = Object.values(client.getHealthStatus().circuitBreakers);
		expect(breakers.map((b) => b.failures)).toContain(1);
	});

	it('a caller that joined before the owner aborted still gets its retry when the shared attempt fails', async () => {
		const owner = new AbortController();
		let failFirst!: (e: Error) => void;
		mockFetch
			.mockImplementationOnce(() => new Promise<Response>((_r, reject) => (failFirst = reject)))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ ok: 'retried' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);
		const client = new ServiceClient();

		const legacy = client
			.request('NWS', '/joined-first', { useCache: false, retries: 1, signal: owner.signal })
			.catch((e: unknown) => e);
		const tv = client.request('NWS', '/joined-first', { useCache: false, retries: 1 });
		owner.abort(); // navigation away from legacy
		failFirst(new TypeError('network down'));
		await vi.advanceTimersByTimeAsync(30_000);

		expect((await tv).data).toEqual({ ok: 'retried' });
		expect(await legacy).toBeInstanceOf(Error);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});
});
