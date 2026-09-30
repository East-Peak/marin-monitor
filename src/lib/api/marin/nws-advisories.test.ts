import { afterEach, describe, expect, it, vi } from 'vitest';
import { NWS_ALERTS_URL, fetchMarinAdvisories } from './nws-advisories';

const FEATURE = {
	properties: {
		id: 'urn:a1',
		event: 'Red Flag Warning',
		headline: null,
		severity: 'Severe',
		status: 'Actual',
		messageType: 'Alert',
		sent: '2026-09-29T07:00:00-07:00',
		effective: '2026-09-29T07:00:00-07:00',
		expires: '2026-09-29T20:00:00-07:00',
		ends: null,
		references: [],
		geocode: { UGC: ['CAZ502'] }
	}
};

afterEach(() => vi.unstubAllGlobals());

/** Typed like fetch, so `mock.calls[0][0]` type-checks (Codex r1 #1). */
const fetchMock = (impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) =>
	vi.fn(impl);

describe('fetchMarinAdvisories', () => {
	it('asks NWS for the four Marin zones and returns the parsed advisories', async () => {
		const fetchSpy = fetchMock(async () => new Response(JSON.stringify({ features: [FEATURE] })));
		vi.stubGlobal('fetch', fetchSpy);
		const result = await fetchMarinAdvisories();
		expect(fetchSpy.mock.calls[0][0]).toBe(NWS_ALERTS_URL);
		expect(NWS_ALERTS_URL).toMatch(
			/zone=(CAZ502|CAZ505|CAZ506|CAC041)(,(CAZ502|CAZ505|CAZ506|CAC041)){3}$/
		);
		expect(result.advisories.map((a) => a.event)).toEqual(['Red Flag Warning']);
		expect(result.unreadable).toBe(0);
	});
	it('an HTTP failure throws instead of returning [] (the old nws.ts behavior)', async () => {
		vi.stubGlobal(
			'fetch',
			fetchMock(async () => new Response('down', { status: 503 }))
		);
		await expect(fetchMarinAdvisories()).rejects.toThrow('HTTP 503');
	});
	it('a body that is not an alert collection throws', async () => {
		vi.stubGlobal(
			'fetch',
			fetchMock(async () => new Response('{"title":"oops"}'))
		);
		await expect(fetchMarinAdvisories()).rejects.toThrow('not an NWS alert collection');
	});
	it('the deadline covers a body that never arrives', async () => {
		vi.stubGlobal(
			'fetch',
			fetchMock(
				async () =>
					({ ok: true, status: 200, json: () => new Promise(() => {}) }) as unknown as Response
			)
		);
		await expect(fetchMarinAdvisories({ timeoutMs: 30 })).rejects.toThrow(
			'nws alerts: timed out after 30 ms'
		);
	});
	it("the owner's abort ends the request and aborts the fetch", async () => {
		const fetchSpy = fetchMock(
			(_input, init) =>
				new Promise((_, reject) =>
					init!.signal!.addEventListener('abort', () =>
						reject(new DOMException('aborted', 'AbortError'))
					)
				)
		);
		vi.stubGlobal('fetch', fetchSpy);
		const owner = new AbortController();
		const pending = fetchMarinAdvisories({ signal: owner.signal });
		owner.abort();
		await expect(pending).rejects.toThrow(/aborted/i);
		expect(fetchSpy.mock.calls[0][1]?.signal?.aborted).toBe(true);
	});
});
