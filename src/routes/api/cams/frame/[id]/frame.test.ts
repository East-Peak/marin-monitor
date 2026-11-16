import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

const { GET } = await import('./+server');
const get = (id: string) => GET({ params: { id } } as never) as Promise<Response>;

const jpeg = (headers: Record<string, string> = {}) =>
	new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
		status: 200,
		headers: { 'content-type': 'image/jpeg', ...headers }
	});

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('GET /api/cams/frame/[id] (LCP1)', () => {
	it("reads the camera's thumbnail from its source", async () => {
		fetchMock.mockResolvedValueOnce(jpeg());
		await get('alert-tam-east');
		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://cameras.alertcalifornia.org/public-camera-data/Axis-TamEast/latest-thumb.jpg'
		);
	});

	it("returns the source's bytes and its own age, cached briefly", async () => {
		const lm = 'Mon, 16 Nov 2026 00:10:00 GMT';
		fetchMock.mockResolvedValueOnce(jpeg({ 'last-modified': lm }));
		const res = await get('alert-tam-east');
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
		expect(res.headers.get('last-modified')).toBe(lm);
		expect(res.headers.get('cache-control')).toBe(
			'public, max-age=30, s-maxage=30, stale-while-revalidate=30'
		);
		expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
	});

	it('claims no age the source did not give', async () => {
		fetchMock.mockResolvedValueOnce(jpeg());
		expect((await get('alert-tam-east')).headers.get('last-modified')).toBeNull();
	});

	it('is no proxy: a camera without a server frame is 404, unfetched', async () => {
		for (const id of ['nope', 'caltrans-spencer', 'abc7-tam']) {
			expect((await get(id)).status).toBe(404);
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('a source that does not answer with a picture is 503 (camera offline), never cached', async () => {
		const answers = [
			() => Promise.resolve(new Response('gone', { status: 404 })),
			() => Promise.reject(new TypeError('fetch failed')),
			() =>
				Promise.resolve(
					new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })
				)
		];
		for (const answer of answers) {
			fetchMock.mockImplementationOnce(answer);
			const res = await get('alert-tam-east');
			expect(res.status).toBe(503);
			expect(res.headers.get('cache-control')).toBe('no-store');
		}
	});

	it('a source that stalls is 503 at the deadline', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementationOnce(
			(_u: string, init: RequestInit) =>
				new Promise((_r, reject) =>
					init.signal!.addEventListener('abort', () => reject(new DOMException('', 'AbortError')))
				)
		);
		const pending = get('alert-tam-east');
		await vi.advanceTimersByTimeAsync(5_000);
		expect((await pending).status).toBe(503);
	});

	it('headers on time, then a stalled body: 503 at the same deadline', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementationOnce(async (_u: string, init: RequestInit) => {
			const body = new ReadableStream({
				start(c) {
					init.signal!.addEventListener('abort', () => c.error(new DOMException('', 'AbortError')));
				}
			});
			return new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg' } });
		});
		const pending = get('alert-tam-east');
		await vi.advanceTimersByTimeAsync(5_000);
		expect((await pending).status).toBe(503);
	});

	it('a refused answer (HTML on a slow body) is let go at once, not left running (Codex LCP1 diff #4)', async () => {
		let signal: AbortSignal | undefined;
		fetchMock.mockImplementationOnce(async (_u: string, init: RequestInit) => {
			signal = init.signal!;
			const body = new ReadableStream({ start() {} });
			return new Response(body, { status: 502, headers: { 'content-type': 'text/html' } });
		});
		expect((await get('alert-tam-east')).status).toBe(503);
		expect(signal?.aborted).toBe(true);
	});
});
