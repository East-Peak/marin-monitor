// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { boundedFetch, readStreamCapped } from './bounded-fetch';

const HOSTS = new Set(['feeds.example', 'cdn.feeds.example']);
const LIMITS = { deadlineMs: 200, maxBytes: 1_000, maxRedirects: 2 };

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	return new ReadableStream({
		start(c) {
			for (const chunk of chunks) c.enqueue(enc.encode(chunk));
			c.close();
		}
	});
}

/** A body that sends one chunk and then stalls forever, ignoring cancellation. */
function stallingStream(): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(c) {
			c.enqueue(new TextEncoder().encode('<rss>'));
		},
		pull() {
			return new Promise(() => {});
		}
	});
}

function fakeFetch(routes: Record<string, () => Response>) {
	return vi.fn(async (input: string | URL | Request) => {
		const route = routes[String(input)];
		if (!route) throw new TypeError(`unexpected fetch ${String(input)}`);
		return route();
	}) as unknown as typeof fetch;
}

describe('boundedFetch', () => {
	it('returns the body of an allowlisted https URL', async () => {
		const fetchImpl = fakeFetch({
			'https://feeds.example/rss': () => new Response(streamOf('<rss>', '</rss>'))
		});
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toEqual({
			ok: true,
			text: '<rss></rss>',
			finalUrl: 'https://feeds.example/rss',
			bytes: 11
		});
	});

	it('refuses a host that is not allowlisted without fetching', async () => {
		const fetchImpl = fakeFetch({});
		const r = await boundedFetch('https://evil.example/rss', { allowedHosts: HOSTS, fetchImpl });
		expect(r).toMatchObject({ ok: false, reason: 'host-not-allowed' });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('refuses plain http even for an allowlisted host', async () => {
		const r = await boundedFetch('http://feeds.example/rss', {
			allowedHosts: HOSTS,
			fetchImpl: fakeFetch({})
		});
		expect(r).toMatchObject({ ok: false, reason: 'host-not-allowed' });
	});

	it('follows a redirect that stays on the allowlist', async () => {
		const fetchImpl = fakeFetch({
			'https://feeds.example/rss': () =>
				new Response(null, { status: 301, headers: { location: 'https://cdn.feeds.example/rss' } }),
			'https://cdn.feeds.example/rss': () => new Response('<rss/>')
		});
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toMatchObject({ ok: true, finalUrl: 'https://cdn.feeds.example/rss' });
	});

	it('refuses a redirect off the allowlist and never fetches the target', async () => {
		const fetchImpl = fakeFetch({
			'https://feeds.example/rss': () =>
				new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } })
		});
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toMatchObject({ ok: false, reason: 'redirect-not-allowed' });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('refuses a relative redirect that downgrades to http', async () => {
		const fetchImpl = fakeFetch({
			'https://feeds.example/rss': () =>
				new Response(null, { status: 302, headers: { location: 'http://feeds.example/rss' } })
		});
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toMatchObject({ ok: false, reason: 'redirect-not-allowed' });
	});

	it('stops a redirect loop', async () => {
		const fetchImpl = fakeFetch({
			'https://feeds.example/rss': () =>
				new Response(null, { status: 302, headers: { location: '/rss' } })
		});
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toMatchObject({ ok: false, reason: 'too-many-redirects' });
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it('reports a non-2xx status', async () => {
		const fetchImpl = fakeFetch({
			'https://feeds.example/rss': () => new Response('nope', { status: 404 })
		});
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toEqual({ ok: false, reason: 'http-status', detail: 'HTTP 404' });
	});

	it('rejects an oversized declared Content-Length before reading', async () => {
		const fetchImpl = fakeFetch({
			'https://feeds.example/rss': () =>
				new Response('x', { headers: { 'content-length': '5000' } })
		});
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toMatchObject({ ok: false, reason: 'too-large' });
	});

	it('rejects an oversized body with no Content-Length by counting bytes read', async () => {
		const fetchImpl = fakeFetch({
			'https://feeds.example/rss': () => new Response(streamOf('x'.repeat(600), 'y'.repeat(600)))
		});
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toMatchObject({ ok: false, reason: 'too-large' });
	});

	it('times out while the BODY stalls (deadline covers body consumption)', async () => {
		const fetchImpl = fakeFetch({
			'https://feeds.example/rss': () => new Response(stallingStream())
		});
		const started = Date.now();
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toMatchObject({ ok: false, reason: 'timeout' });
		expect(Date.now() - started).toBeLessThan(LIMITS.deadlineMs + 150);
	});

	it('times out when headers never arrive, even if fetch ignores the signal', async () => {
		const fetchImpl = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toMatchObject({ ok: false, reason: 'timeout', detail: 'deadline 200ms exceeded' });
	});

	it('stops immediately when the outer run budget is already spent', async () => {
		const outer = new AbortController();
		outer.abort();
		const fetchImpl = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl,
			signal: outer.signal
		});
		expect(r).toMatchObject({ ok: false, reason: 'timeout', detail: 'run budget exhausted' });
	});

	it('reports a network error', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch;
		const r = await boundedFetch('https://feeds.example/rss', {
			allowedHosts: HOSTS,
			limits: LIMITS,
			fetchImpl
		});
		expect(r).toEqual({ ok: false, reason: 'network', detail: 'fetch failed' });
	});
});

describe('readStreamCapped', () => {
	it('decodes UTF-8 split across chunks', async () => {
		const bytes = new TextEncoder().encode('Café');
		const stream = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(bytes.slice(0, 4));
				c.enqueue(bytes.slice(4));
				c.close();
			}
		});
		expect(await readStreamCapped(stream, 100, new AbortController().signal)).toEqual({
			text: 'Café',
			bytes: 5
		});
	});
});
