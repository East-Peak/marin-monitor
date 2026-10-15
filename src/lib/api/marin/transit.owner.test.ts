import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/config/api', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const { fetchTransitAlerts } = await import('./transit');

afterEach(() => vi.unstubAllGlobals());

describe('fetchTransitAlerts: the body is read under the owner (Codex r3 #3)', () => {
	it('headers arrive, the body stalls, the owner aborts: the request itself is cancelled and no further agency starts', async () => {
		let seen: AbortSignal | undefined;
		let headers!: () => void;
		const delivered = new Promise<void>((r) => (headers = r));
		const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
			seen = init?.signal ?? undefined;
			const body = new ReadableStream({
				start(c) {
					seen?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')));
				}
			});
			headers();
			return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
		});
		vi.stubGlobal('fetch', fetchMock);
		const owner = new AbortController();
		const pending = fetchTransitAlerts({ signal: owner.signal });
		await delivered;
		await new Promise((r) => setTimeout(r, 0)); // the body read is under way
		owner.abort();
		const result = await pending;
		expect(seen?.aborted).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.agencies).toEqual([
			{
				id: 'GG',
				name: 'Golden Gate Transit',
				alerts: null,
				observedAt: null,
				error: expect.stringContaining('Golden Gate Transit')
			}
		]);
	});
});
