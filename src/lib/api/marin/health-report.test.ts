import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHealthReport, parseHealthReport } from './health-report';

afterEach(() => vi.unstubAllGlobals());
const SOURCE = {
	name: 'Wine Index',
	status: 'stale',
	reason: 'older than 10d',
	maxAgeDays: 10,
	observedAt: '2026-09-09T15:00:00.000Z'
};
const BODY = { status: 'degraded', sources: [SOURCE], subsources: [] };
const fetchMock = (respond: () => Promise<Response>) =>
	vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => respond());

describe('parseHealthReport (strict; Codex r1 #6)', () => {
	it('accepts a well-formed report', () => {
		expect(parseHealthReport(BODY)).toEqual(BODY);
	});
	it.each([
		['an empty inventory', { ...BODY, sources: [] }],
		['an unknown report status', { ...BODY, status: 'fine' }],
		['a source with an unknown status', { ...BODY, sources: [{ ...SOURCE, status: 'toString' }] }],
		[
			'a malformed observation time',
			{ ...BODY, sources: [{ ...SOURCE, observedAt: 'yesterday' }] }
		],
		['a non-finite max age', { ...BODY, sources: [{ ...SOURCE, maxAgeDays: 'x' }] }],
		['a nameless source', { ...BODY, sources: [{ ...SOURCE, name: '' }] }],
		[
			'a malformed acceptance',
			{ ...BODY, sources: [{ ...SOURCE, accepted: { reason: '', expiresAt: 'never' } }] }
		],
		[
			'a malformed subsource',
			{ ...BODY, subsources: [{ name: 'x', parent: '', status: 'unavailable' }] }
		],
		['missing arrays', { status: 'healthy' }]
	])('rejects %s', (_label, body) => {
		expect(parseHealthReport(body)).toBeNull();
	});
});

describe('fetchHealthReport', () => {
	it('reads the 503 "degraded" body as a successful read', async () => {
		vi.stubGlobal(
			'fetch',
			fetchMock(async () => new Response(JSON.stringify(BODY), { status: 503 }))
		);
		expect(await fetchHealthReport()).toEqual({ ok: true, data: BODY, dataSource: 'live' });
	});
	it('aborting the owner while the body is pending aborts the actual request (Codex r2 #4)', async () => {
		let requestSignal!: AbortSignal;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				requestSignal = init!.signal!;
				return {
					ok: true,
					status: 200,
					json: () =>
						new Promise((_, reject) =>
							requestSignal.addEventListener('abort', () =>
								reject(new DOMException('aborted', 'AbortError'))
							)
						)
				} as unknown as Response;
			})
		);
		const owner = new AbortController();
		const pending = fetchHealthReport({ signal: owner.signal });
		await vi.waitFor(() => expect(requestSignal).toBeDefined());
		owner.abort();
		expect(requestSignal.aborted).toBe(true);
		expect(await pending).toMatchObject({ ok: false });
	});
	it('another status, a rejected body or a network error is a failure', async () => {
		vi.stubGlobal(
			'fetch',
			fetchMock(async () => new Response('x', { status: 500 }))
		);
		expect(await fetchHealthReport()).toMatchObject({ ok: false, error: 'HTTP 500' });
		vi.stubGlobal(
			'fetch',
			fetchMock(async () => new Response(JSON.stringify({ ...BODY, sources: [] })))
		);
		expect(await fetchHealthReport()).toMatchObject({
			ok: false,
			error: 'not a valid health report'
		});
		vi.stubGlobal(
			'fetch',
			fetchMock(async () => Promise.reject(new Error('offline')))
		);
		expect(await fetchHealthReport()).toMatchObject({ ok: false, error: 'offline' });
	});
});
