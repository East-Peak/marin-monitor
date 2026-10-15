// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const key = vi.hoisted(() => ({ value: 'test-key' }));
vi.mock('$lib/server/api-keys', () => ({ get511ApiKey: () => key.value }));
const { GET } = await import('./+server');

const fetchMock = vi.fn<typeof fetch>();
const incident = {
	id: '511.org/1563727',
	status: 'ACTIVE',
	event_type: 'INCIDENT',
	event_subtypes: ['Traffic Hazard'],
	severity: 'Moderate',
	created: '2026-10-14T22:20Z',
	areas: [{ name: 'Contra Costa' }],
	roads: [{ name: 'I-580 W', direction: 'Westbound', '+article': 'east of', from: 'Central Ave' }],
	geography: { type: 'Point', coordinates: [-122.311741, 37.89741] }
};
const sonoma = {
	...incident,
	id: '511.org/1',
	areas: [{ name: 'Sonoma' }],
	roads: [{ name: 'CA-116' }],
	geography: { type: 'Point', coordinates: [-123.0, 38.48] }
};
const NEXT = '/traffic/events?api_key=test-key&format=json&limit=500&offset=500';
const body = (events: unknown[], pagination: unknown = { offset: 0 }) =>
	JSON.stringify({ events, pagination, meta: { version: 'v1' } });
const page = (events: unknown[], next?: string, bom = false) =>
	new Response(
		`${bom ? '﻿' : ''}${body(events, next ? { offset: 0, next_url: next } : { offset: 0 })}`
	);
const call = async () => {
	const res = await GET();
	return { res, json: await res.json() };
};
const ids = (j: { events: { id: string }[] }) => j.events.map((e) => e.id);
const urlOf = (i: number) => new URL(String(fetchMock.mock.calls[i][0]));

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	key.value = 'test-key';
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('GET /api/traffic/corridors', () => {
	it('without a 511 key: 503, no request', async () => {
		key.value = '';
		const { res } = await call();
		expect(res.status).toBe(503);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('reads 511 in one large page and serves only corridor events, with its own check time', async () => {
		fetchMock.mockResolvedValueOnce(page([incident, sonoma]));
		const { res, json } = await call();
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe(
			'public, max-age=60, s-maxage=120, stale-while-revalidate=60'
		);
		expect(urlOf(0).origin + urlOf(0).pathname).toBe('https://api.511.org/traffic/events');
		expect(urlOf(0).searchParams.get('limit')).toBe('500');
		expect(urlOf(0).searchParams.get('format')).toBe('json');
		expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
		expect([json.upstreamCount, json.unreadable]).toEqual([2, 0]);
		expect(ids(json)).toEqual(['511.org/1563727']);
		expect(Number.isFinite(Date.parse(json.checkedAt))).toBe(true);
	});

	it('follows next_url: an incident on page 2 is served (prod dropped page 2 on 2026-10-14)', async () => {
		fetchMock
			.mockResolvedValueOnce(page([sonoma], NEXT))
			.mockResolvedValueOnce(page([incident], undefined, true));
		const { json } = await call();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(urlOf(1).searchParams.get('offset')).toBe('500');
		expect(urlOf(1).searchParams.getAll('api_key')).toEqual(['test-key']);
		expect(json.upstreamCount).toBe(2);
		expect(ids(json)).toEqual(['511.org/1563727']);
	});

	it('a list that does not end within 5 pages is incomplete: 502, never a partial list', async () => {
		fetchMock.mockImplementation(async () => page([incident], NEXT));
		const { res, json } = await call();
		expect(res.status).toBe(502);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(json).toEqual({ error: 'Traffic events incomplete' });
		expect(fetchMock).toHaveBeenCalledTimes(5);
	});

	it.each([
		['HTTP 500', async () => new Response('x', { status: 500 })],
		['not JSON', async () => new Response('<html>')],
		['no events array', async () => new Response(JSON.stringify({ pagination: {} }))],
		['a next_url somewhere else', async () => page([], 'https://evil.example/traffic/events?x')],
		[
			'a next_url that is not a string (Codex r1 #3)',
			async () => new Response(body([incident], { next_url: 42 }))
		],
		['pagination that is not an object', async () => new Response(body([incident], 'more'))],
		[
			'a network error',
			async (): Promise<Response> => {
				throw new Error('ECONNRESET');
			}
		]
	])('%s → 502, no-store', async (_name, respond) => {
		fetchMock.mockImplementation(respond);
		const { res } = await call();
		expect(res.status).toBe(502);
		expect(res.headers.get('cache-control')).toBe('no-store');
	});

	it('records it cannot read are reported, so no client reads them as "nothing listed" (Codex r1 #3)', async () => {
		fetchMock.mockResolvedValueOnce(page([{}, incident]));
		const { res, json } = await call();
		expect(res.status).toBe(200);
		expect([json.unreadable, ids(json)]).toEqual([1, ['511.org/1563727']]);
	});

	const stall = (_url: RequestInfo | URL, init?: RequestInit) =>
		new Promise<Response>((_, reject) =>
			init?.signal?.addEventListener('abort', () =>
				reject(new DOMException('aborted', 'AbortError'))
			)
		);

	it('one deadline for the whole read, not per page: 6 s on page 1 + a stalled page 2 fails at 8 s total (Codex r1 #10, r4 #5)', async () => {
		vi.useFakeTimers();
		fetchMock
			.mockImplementationOnce(
				() => new Promise<Response>((res) => setTimeout(() => res(page([sonoma], NEXT)), 6_000))
			)
			.mockImplementationOnce(stall);
		let done = false;
		const pending = call().finally(() => (done = true));
		await vi.advanceTimersByTimeAsync(7_999);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		const { res } = await pending;
		expect(res.status).toBe(502); // a fresh 8 s per page would still be waiting until 14 s
		expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
	});

	it('the deadline covers the body: headers arrive, the body stalls, the read fails at 8 s', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementationOnce(async (_url, init) => {
			const body = new ReadableStream({
				start(c) {
					init?.signal?.addEventListener('abort', () =>
						c.error(new DOMException('aborted', 'AbortError'))
					);
				}
			});
			return new Response(body, { status: 200 });
		});
		const pending = call();
		await vi.advanceTimersByTimeAsync(8_000);
		const { res } = await pending;
		expect(res.status).toBe(502);
		expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
	});

	it('overlapping pages: an event seen twice is served once; a conflicting duplicate is counted unreadable (Codex r4 #2)', async () => {
		fetchMock
			.mockResolvedValueOnce(page([incident], NEXT))
			.mockResolvedValueOnce(page([incident, { ...incident, severity: 'Major' }]));
		const { json } = await call();
		expect([ids(json), json.unreadable]).toEqual([['511.org/1563727'], 1]);
	});

	it('never echoes the key', async () => {
		fetchMock.mockResolvedValueOnce(page([incident]));
		const { json } = await call();
		expect(JSON.stringify(json)).not.toContain('test-key');
	});
});
