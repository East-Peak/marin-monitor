// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/api-keys', () => ({ get511ApiKey: () => 'test-key' }));
/** Fresh per test: the route's memo is module state. */
let GET: (e: { url: URL }) => Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();
const FEED = JSON.stringify({ Header: { Timestamp: 1 }, Entities: [] });
const call = (agency = 'GG') =>
	GET({ url: new URL(`https://x/api/transit?agency=${agency}`) }).catch(
		(e: { status: number }) => new Response(null, { status: e.status })
	);

beforeEach(async () => {
	vi.resetModules();
	({ GET } = (await import('./+server')) as unknown as { GET: typeof GET });
	vi.spyOn(console, 'info').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('GET /api/transit (TRAFFIC1 budget)', () => {
	it("concurrent cold requests for one agency make one 511 read; agencies don't share", async () => {
		fetchMock.mockImplementation(async () => new Response(FEED));
		const [a, b] = await Promise.all([call(), call()]);
		expect([a.status, b.status, await a.text()]).toEqual([200, 200, FEED]);
		await call('SA');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('an alert list is held 15 minutes, here and at the CDN', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(async () => new Response(FEED));
		const first = await call();
		expect(first.headers.get('cache-control')).toBe('public, max-age=120, s-maxage=900');
		vi.advanceTimersByTime(14 * 60_000);
		await call();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(60_000);
		await call();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("511's refusal is passed on and held 15 minutes too: a failure still says failed", async () => {
		vi.useFakeTimers();
		fetchMock.mockResolvedValue(new Response('', { status: 503 }));
		expect((await call()).status).toBe(503);
		vi.advanceTimersByTime(14 * 60_000);
		const again = await call();
		expect([again.status, fetchMock.mock.calls.length]).toEqual([503, 1]);
		vi.advanceTimersByTime(60_000);
		await call();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('a 200 that is not an alert feed is a failure, never 15 minutes of "success"', async () => {
		fetchMock.mockResolvedValue(new Response('<html>maintenance</html>'));
		expect((await call()).status).toBe(502);
	});

	it('a body that stalls fails at the 10 s deadline instead of holding the agency forever', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(
			async (_u, init) =>
				new Response(
					new ReadableStream({
						start(c) {
							init?.signal?.addEventListener('abort', () =>
								c.error(new DOMException('aborted', 'AbortError'))
							);
						}
					})
				)
		);
		const pending = call();
		await vi.advanceTimersByTimeAsync(10_000);
		expect((await pending).status).toBe(502);
	});
});
