// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Upstream from './upstream-511';

/** Fresh per test: the key-wide refusal window is module state. */
let get511: typeof Upstream.get511;
let log511Read: typeof Upstream.log511Read;
let memo511: typeof Upstream.memo511;
let readPage: typeof Upstream.readPage;

const fetchMock = vi.fn<typeof fetch>();
const signal = () => new AbortController().signal;
const PATH = '/traffic/events?format=json';
const ok = (events: unknown[] = []) =>
	new Response(JSON.stringify({ events, pagination: { offset: 0 } }), {
		headers: { 'RateLimit-Remaining': '41' }
	});

beforeEach(async () => {
	vi.resetModules();
	({ get511, log511Read, memo511, readPage } = await import('./upstream-511'));
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	vi.spyOn(console, 'info').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('readPage', () => {
	it('a failed page keeps 511 status and Retry-After, so a 429 is told from a 5xx', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '1800' } })
		);
		const read = await readPage(PATH, 'k', signal(), 'r');
		expect(read).toMatchObject({ ok: false, status: 429, retryAfter: '1800' });
	});

	it('a network error is a failure with no status', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));
		expect(await readPage(PATH, 'k', signal(), 'r')).toMatchObject({
			ok: false,
			status: null,
			retryAfter: null
		});
	});

	it('a 200 that does not parse keeps its status: a bad body, not a refusal', async () => {
		fetchMock.mockResolvedValueOnce(new Response('<html>'));
		expect(await readPage(PATH, 'k', signal(), 'r')).toMatchObject({
			ok: false,
			status: 200
		});
	});

	it('a good page reads its events and the remaining hourly budget', async () => {
		fetchMock.mockResolvedValueOnce(ok([{ id: 'a' }]));
		expect(await readPage(PATH, 'k', signal(), 'r')).toEqual({
			ok: true,
			status: 200,
			remaining: '41',
			events: [{ id: 'a' }],
			next: null
		});
	});
});

describe('readPage retries (TRAFFIC1)', () => {
	it('never retries a 429: another read only spends more of the hour', async () => {
		fetchMock.mockResolvedValue(new Response('', { status: 429 }));
		expect(await readPage(PATH, 'k', signal(), 'r')).toMatchObject({ ok: false, status: 429 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('a 5xx gets one retry, and the retry can succeed', async () => {
		fetchMock.mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(ok());
		expect(await readPage(PATH, 'k', signal(), 'r')).toMatchObject({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('a network error gets one retry; a second failure is the answer', async () => {
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));
		expect(await readPage(PATH, 'k', signal(), 'r')).toMatchObject({ ok: false, status: null });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('no retry once the deadline has passed, and none for a bad 200 body', async () => {
		const deadline = new AbortController();
		fetchMock.mockImplementationOnce(async () => {
			deadline.abort();
			throw new DOMException('aborted', 'AbortError');
		});
		await readPage(PATH, 'k', deadline.signal, 'r');
		fetchMock.mockResolvedValueOnce(new Response('<html>'));
		await readPage(PATH, 'k', signal(), 'r');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('logs each attempt under its route', async () => {
		const warn = vi.mocked(console.warn);
		fetchMock.mockResolvedValueOnce(new Response('', { status: 502 })).mockResolvedValueOnce(ok());
		await readPage(PATH, 'k', signal(), 'traffic/corridors');
		expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
			expect.objectContaining({ route: 'traffic/corridors', status: 502 })
		]);
		expect(vi.mocked(console.info)).toHaveBeenCalledTimes(1);
	});
});

describe('get511: the body inside the deadline, and the key-wide refusal (TRAFFIC1 Codex)', () => {
	const stalledBody = (signal: AbortSignal) =>
		new Response(
			new ReadableStream({
				start(c) {
					signal.addEventListener('abort', () =>
						c.error(new DOMException('aborted', 'AbortError'))
					);
				}
			})
		);

	it('a body that stalls fails when the deadline passes, instead of hanging', async () => {
		const deadline = new AbortController();
		fetchMock.mockImplementationOnce(async (_u, init) => stalledBody(init!.signal!));
		const pending = get511('/transit/servicealerts?agency=GG', 'k', deadline.signal, 'transit');
		deadline.abort();
		expect(await pending).toMatchObject({ status: 200, body: null });
	});

	it('with retry, a body cut off mid-read is retried like a network error', async () => {
		let n = 0;
		fetchMock.mockImplementation(async () => {
			if (n++ > 0) return ok();
			const c = new AbortController();
			const r = stalledBody(c.signal);
			c.abort();
			return r;
		});
		expect(await readPage(PATH, 'k', signal(), 'r')).toMatchObject({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('after a 429, no route asks 511 until its Retry-After has passed', async () => {
		vi.useFakeTimers();
		fetchMock.mockResolvedValueOnce(
			new Response('', { status: 429, headers: { 'Retry-After': '120' } })
		);
		await get511(PATH, 'k', signal(), 'traffic/corridors');
		expect(await get511('/transit/servicealerts', 'k', signal(), 'transit')).toMatchObject({
			status: 429,
			retryAfter: '120',
			body: null
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(120_000);
		fetchMock.mockResolvedValueOnce(ok());
		expect(await get511(PATH, 'k', signal(), 'traffic/corridors')).toMatchObject({ status: 200 });
	});

	it('the transit and events reads take no retry: a 5xx is the answer', async () => {
		fetchMock.mockResolvedValue(new Response('', { status: 503 }));
		expect(await get511('/transit/servicealerts', 'k', signal(), 'transit')).toMatchObject({
			status: 503,
			body: null
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('memo511: one 511 read per route per window (TRAFFIC1)', () => {
	it('concurrent cold requests share one read', async () => {
		let release!: (v: string) => void;
		const read = vi.fn(() => new Promise<string>((r) => (release = r)));
		const memo = memo511<string>(60_000, () => 0);
		const both = Promise.all([memo('a', read), memo('a', read)]);
		release('x');
		expect(await both).toEqual(['x', 'x']);
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('serves the same outcome inside the window, reads again after it; routes are separate', async () => {
		let t = 0;
		const read = vi.fn(async () => t);
		const memo = memo511<number>(60_000, () => t);
		expect(await memo('a', read)).toBe(0);
		t = 59_999;
		expect(await memo('a', read)).toBe(0);
		expect(await memo('b', read)).toBe(59_999);
		t = 60_000;
		expect(await memo('a', read)).toBe(60_000);
		expect(read).toHaveBeenCalledTimes(3);
	});

	it('the window can depend on the outcome: a failure is held briefly, a success longer', async () => {
		let t = 0;
		const memo = memo511<{ ok: boolean }>(
			(v) => (v.ok ? 900_000 : 60_000),
			() => t
		);
		await memo('fail', async () => ({ ok: false }));
		await memo('good', async () => ({ ok: true }));
		t = 60_000;
		const read = vi.fn(async () => ({ ok: true }));
		await memo('fail', read);
		await memo('good', read);
		expect(read).toHaveBeenCalledTimes(1);
	});

	it('a read that throws is not kept', async () => {
		const memo = memo511<number>(60_000, () => 0);
		await expect(memo('a', () => Promise.reject(new Error('x')))).rejects.toThrow('x');
		expect(await memo('a', async () => 1)).toBe(1);
	});
});

describe('log511Read', () => {
	it('writes one structured line per read, without the key or URL', () => {
		const warn = vi.mocked(console.warn);
		log511Read('traffic/corridors', { status: 429, retryAfter: '1800', remaining: '0' }, 212);
		expect(warn).toHaveBeenCalledTimes(1);
		const line = String(warn.mock.calls[0][0]);
		expect(JSON.parse(line)).toEqual({
			evt: '511-read',
			route: 'traffic/corridors',
			status: 429,
			retryAfter: '1800',
			remaining: '0',
			ms: 212
		});
		expect(line).not.toContain('api_key');
	});

	it('a successful read logs at info, so failures stand out by level', () => {
		const [info, warn] = [vi.mocked(console.info), vi.mocked(console.warn)];
		log511Read('transit', { status: 200, retryAfter: null, remaining: '12' }, 90);
		expect([info.mock.calls.length, warn.mock.calls.length]).toEqual([1, 0]);
	});
});
