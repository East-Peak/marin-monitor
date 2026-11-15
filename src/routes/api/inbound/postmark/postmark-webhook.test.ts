// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- SvelteKit RequestEvent mock; handler uses request only */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBlobApi, type MemoryBlobApi } from '$lib/server/news/memory-blob-api';
import { FAKE_INBOUND, fixture } from '$lib/server/email-intake/fixtures';
import { EMAIL_PREFIX } from '$lib/server/email-intake/store';

let api: MemoryBlobApi;
const mockEnv: Record<string, string | undefined> = {};

vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/server/news/vercel-blob-api', () => ({ vercelBlobApi: () => api }));

const { POST } = await import('./+server');

const AUTH = `Basic ${btoa('intake:s3cret')}`;
const post = (body: unknown, auth: string | null = AUTH, headers: Record<string, string> = {}) =>
	POST({
		request: new Request('https://localhost/api/inbound/postmark', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(auth ? { authorization: auth } : {}),
				...headers
			},
			body: typeof body === 'string' ? body : JSON.stringify(body)
		})
	} as any);
const keys = async () =>
	(await api.list(EMAIL_PREFIX, new AbortController().signal)).map((b) => b.key);

beforeEach(() => {
	api = createMemoryBlobApi();
	Object.assign(mockEnv, {
		GG_INGEST_USER: 'intake',
		GG_INGEST_PASS: 's3cret',
		GG_INGEST_TO: FAKE_INBOUND,
		BLOB_READ_WRITE_TOKEN: 'tok'
	});
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-11-14T12:00:00.000Z'));
});

describe('POST /api/inbound/postmark', () => {
	it('stores a Golden Gate alert and answers 200 after the write', async () => {
		const res = await post(fixture('transit-route-580'));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			outcome: 'stored',
			rule: 'gg-transit-alert',
			destination: 'transit'
		});
		expect(await keys()).toHaveLength(1);
	});

	it.each([
		['missing', null],
		['wrong', `Basic ${btoa('intake:nope')}`]
	])('%s basic auth → 401, nothing stored', async (_, auth) => {
		const res = await post(fixture('transit-route-580'), auth);
		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toMatch(/^Basic/);
		expect(await keys()).toEqual([]);
	});

	it.each(['GG_INGEST_USER', 'GG_INGEST_PASS', 'GG_INGEST_TO', 'BLOB_READ_WRITE_TOKEN'])(
		'unset %s fails closed (500), nothing stored',
		async (name) => {
			mockEnv[name] = undefined;
			expect((await post(fixture('transit-route-580'))).status).toBe(500);
			expect(await keys()).toEqual([]);
		}
	);

	it('rejects the wrong sender and the wrong recipient with 403, nothing stored', async () => {
		expect((await post({ ...fixture('transit-route-580'), From: 'x@evil.example' })).status).toBe(
			403
		);
		expect(
			(await post({ ...fixture('transit-route-580'), OriginalRecipient: 'x@y.z' })).status
		).toBe(403);
		expect(await keys()).toEqual([]);
	});

	it('a body over the cap is 413, by header or by stream; nothing stored', async () => {
		const big = { ...fixture('transit-route-580'), TextBody: 'x'.repeat(600 * 1024) };
		expect((await post(big)).status).toBe(413);
		expect(
			(await post(fixture('transit-route-580'), AUTH, { 'content-length': '999999' })).status
		).toBe(413);
		expect(await keys()).toEqual([]);
	});

	it('bad JSON or the wrong shape is 400', async () => {
		expect((await post('{nope')).status).toBe(400);
		expect((await post({ hello: 'world' })).status).toBe(400);
	});

	it('a malformed or future date is 422', async () => {
		expect((await post({ ...fixture('transit-route-580'), Date: 'soon' })).status).toBe(422);
		expect(
			(await post({ ...fixture('transit-route-580'), Date: 'Sun, 15 Nov 2026 12:00:00 +0000' }))
				.status
		).toBe(422);
		expect(await keys()).toEqual([]);
	});

	it('account mail is answered 200 (so Postmark stops) and never stored', async () => {
		const res = await post(fixture('account-welcome'));
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ outcome: 'dropped', rule: 'gg-account' });
		expect(await keys()).toEqual([]);
	});

	it('a re-delivery is 200 and still one blob', async () => {
		await post(fixture('transit-route-580'));
		const again = await post(fixture('transit-route-580'));
		expect(again.status).toBe(200);
		expect(await again.json()).toMatchObject({ outcome: 'duplicate' });
		expect(await keys()).toHaveLength(1);
	});

	it('a failed write is a 500, so Postmark retries', async () => {
		api.before = (op) => {
			if (op === 'write') throw new Error('blob down');
		};
		const res = await post(fixture('transit-route-580'));
		expect(res.status).toBe(500);
		expect(await res.text()).not.toContain('blob down');
	});

	it('accepts nothing but POST', async () => {
		const mod = await import('./+server');
		expect(Object.keys(mod).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['POST']);
	});
});
