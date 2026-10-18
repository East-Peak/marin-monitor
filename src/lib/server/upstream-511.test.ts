// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log511Read, readPage } from './upstream-511';

const fetchMock = vi.fn<typeof fetch>();
const signal = () => new AbortController().signal;
const ok = (events: unknown[] = []) =>
	new Response(JSON.stringify({ events, pagination: { offset: 0 } }), {
		headers: { 'RateLimit-Remaining': '41' }
	});

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('readPage', () => {
	it('a failed page keeps 511 status and Retry-After, so a 429 is told from a 5xx', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '1800' } })
		);
		const read = await readPage('/traffic/events?format=json', 'k', signal());
		expect(read).toMatchObject({ ok: false, status: 429, retryAfter: '1800' });
	});

	it('a network error is a failure with no status', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
		expect(await readPage('/traffic/events?format=json', 'k', signal())).toMatchObject({
			ok: false,
			status: null,
			retryAfter: null
		});
	});

	it('a 200 that does not parse keeps its status: a bad body, not a refusal', async () => {
		fetchMock.mockResolvedValueOnce(new Response('<html>'));
		expect(await readPage('/traffic/events?format=json', 'k', signal())).toMatchObject({
			ok: false,
			status: 200
		});
	});

	it('a good page reads its events and the remaining hourly budget', async () => {
		fetchMock.mockResolvedValueOnce(ok([{ id: 'a' }]));
		expect(await readPage('/traffic/events?format=json', 'k', signal())).toEqual({
			ok: true,
			status: 200,
			remaining: '41',
			events: [{ id: 'a' }],
			next: null
		});
	});
});

describe('log511Read', () => {
	it('writes one structured line per read, without the key or URL', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		log511Read('transit', { status: 200, retryAfter: null, remaining: '12' }, 90);
		expect([info.mock.calls.length, warn.mock.calls.length]).toEqual([1, 0]);
	});
});
