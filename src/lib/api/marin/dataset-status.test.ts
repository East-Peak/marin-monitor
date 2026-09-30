import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedOp } from './bounded-op';
import { fetchCoffeeIndexDataWithStatus } from './coffee';
import { fetchEvChargingDataWithStatus } from './ev-charging';

afterEach(() => vi.unstubAllGlobals());

/** Typed like fetch, so `mock.calls[0][0]` type-checks (Codex r1 #1). */
const fetchMock = (respond: () => Response) =>
	vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => respond());

/** Headers have arrived; the JSON body is still pending until the request's signal aborts. */
function pendingBody(signal: AbortSignal): Response {
	return {
		ok: true,
		status: 200,
		headers: new Headers(),
		json: () =>
			new Promise((_, reject) =>
				signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
			)
	} as unknown as Response;
}

describe('status-aware dataset fetchers (map essentials)', () => {
	it.each([
		['coffee', fetchCoffeeIndexDataWithStatus, '/api/data/coffee'],
		['ev', fetchEvChargingDataWithStatus, '/api/data/ev-charging']
	] as const)(
		'%s reports a failure instead of silently returning the fallback',
		async (_n, fetcher, url) => {
			const fetchSpy = fetchMock(() => new Response('nope', { status: 503 }));
			vi.stubGlobal('fetch', fetchSpy);
			const result = await fetcher();
			expect(fetchSpy.mock.calls[0][0]).toBe(url);
			expect(result).toEqual({
				ok: false,
				error: 'HTTP 503',
				fallback: { current: null, history: [] }
			});
		}
	);
	it('aborting the owner while the body is still arriving aborts the actual request (Codex r2 #4)', async () => {
		let requestSignal!: AbortSignal;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				requestSignal = init!.signal!;
				return pendingBody(requestSignal);
			})
		);
		const owner = new AbortController();
		const pending = fetchEvChargingDataWithStatus({ signal: owner.signal });
		await vi.waitFor(() => expect(requestSignal).toBeDefined());
		owner.abort();
		expect(requestSignal.aborted).toBe(true);
		expect(await pending).toMatchObject({ ok: false });
	});
	it('under boundedOp, the deadline aborts the actual request while its body stalls', async () => {
		let requestSignal!: AbortSignal;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				requestSignal = init!.signal!;
				return pendingBody(requestSignal);
			})
		);
		await expect(
			boundedOp(
				'dataset ev',
				(s) =>
					fetchEvChargingDataWithStatus({ signal: s }).then((r) => {
						if (!r.ok) throw new Error(r.error);
						return r;
					}),
				{ timeoutMs: 30 }
			)
		).rejects.toThrow();
		expect(requestSignal.aborted).toBe(true);
	});
	it('a fallback served by the server is labelled, not called live', async () => {
		vi.stubGlobal(
			'fetch',
			fetchMock(
				() =>
					new Response('{"current":null,"history":[]}', {
						headers: { 'X-Data-Source': 'static-fallback' }
					})
			)
		);
		expect(await fetchCoffeeIndexDataWithStatus()).toMatchObject({
			ok: true,
			dataSource: 'static-fallback'
		});
	});
});
