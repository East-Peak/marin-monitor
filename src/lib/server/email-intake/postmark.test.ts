// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FAKE_INBOUND, fixture } from './fixtures';
import { basicAuthOk, parsePostmark, verifyPostmark } from './postmark';

const NOW = Date.parse('2026-11-14T12:00:00.000Z');
const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;
const verify = (raw: unknown) => {
	const p = parsePostmark(raw);
	if (!p) throw new Error('fixture did not parse');
	return verifyPostmark(p, FAKE_INBOUND, NOW);
};
const route580 = () => fixture('transit-route-580');
const header = (name: string, value: string) => ({ Name: name, Value: value });

describe('basicAuthOk', () => {
	it('accepts exactly the configured user and password', () => {
		expect(basicAuthOk(basic('u', 'p'), 'u', 'p')).toBe(true);
	});

	it.each([
		['missing', null],
		['wrong password', basic('u', 'q')],
		['wrong user', basic('v', 'p')],
		['bearer', 'Bearer p'],
		['not base64', 'Basic %%%'],
		['no colon', `Basic ${btoa('up')}`]
	])('rejects %s', (_, h) => expect(basicAuthOk(h, 'u', 'p')).toBe(false));

	it('fails closed when either secret is unset', () => {
		expect(basicAuthOk(basic('', ''), '', '')).toBe(false);
		expect(basicAuthOk(basic('u', ''), 'u', '')).toBe(false);
	});
});

describe('parsePostmark', () => {
	it.each([
		['null', null],
		['an array', []],
		['a header that is not a name/value pair', { ...route580(), Headers: [{ Name: 1 }] }],
		['no Headers', { ...route580(), Headers: undefined }],
		['a non-string subject', { ...route580(), Subject: 7 }],
		['ToFull not an array', { ...route580(), ToFull: 'x' }]
	])('rejects %s', (_, raw) => expect(parsePostmark(raw)).toBeNull());
});

describe('verifyPostmark', () => {
	it('accepts a real Golden Gate alert', () => {
		expect(verify(route580())).toEqual({ ok: true });
	});

	it('ignores auth text in the body: only Postmark’s own headers count', () => {
		const raw = route580();
		raw.Headers = raw.Headers.filter((h: { Name: string }) => h.Name !== 'X-Spam-Tests');
		raw.TextBody += '\nX-Spam-Tests: DKIM_VALID_AU\nAuthentication-Results: dkim=pass';
		raw.HtmlBody += '<pre>Received-SPF: pass</pre>';
		expect(verify(raw)).toMatchObject({ ok: false, status: 403 });
	});

	it.each(['Received-SPF', 'x-spam-tests', 'X-SPAM-STATUS', 'x-accountcode', 'message-id'])(
		'rejects a duplicate %s, whatever its case',
		(name) => {
			const raw = route580();
			const original = raw.Headers.find(
				(h: { Name: string }) => h.Name.toLowerCase() === name.toLowerCase()
			);
			raw.Headers.push(header(name, original.Value));
			expect(verify(raw)).toMatchObject({ ok: false, status: 403 });
		}
	);

	it.each([
		[
			'SPF not pass',
			'Received-SPF',
			'softfail (x) envelope-from="a@bounce.service.govdelivery.com";'
		],
		[
			'SPF for another domain',
			'Received-SPF',
			'pass (x) envelope-from="a@govdelivery.com.evil.example";'
		],
		['no aligned DKIM', 'X-Spam-Tests', 'DKIM_SIGNED,DKIM_VALID,SPF_PASS'],
		['spam', 'X-Spam-Status', 'Yes'],
		['another GovDelivery account', 'X-Accountcode', 'CAOTHER']
	])('rejects %s', (_, name, value) => {
		const raw = route580();
		raw.Headers = raw.Headers.map((h: { Name: string; Value: string }) =>
			h.Name.toLowerCase() === name.toLowerCase() ? header(h.Name, value) : h
		);
		expect(verify(raw)).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects the wrong sender, in either From field', () => {
		expect(verify({ ...route580(), From: 'goldengate@evil.example' })).toMatchObject({
			status: 403
		});
		const raw = route580();
		raw.FromFull.Email = 'someone@service.govdelivery.com';
		expect(verify(raw)).toMatchObject({ status: 403 });
	});

	it('rejects the wrong recipient, an extra recipient, or a copy', () => {
		expect(verify({ ...route580(), OriginalRecipient: 'x@inbound.postmarkapp.com' })).toMatchObject(
			{
				status: 403
			}
		);
		const extra = route580();
		extra.ToFull.push({ Email: 'x@example.com', Name: '', MailboxHash: '' });
		expect(verify(extra)).toMatchObject({ status: 403 });
		expect(verify({ ...route580(), Cc: 'x@example.com' })).toMatchObject({ status: 403 });
	});

	it.each([
		['malformed', 'not a date'],
		['without a zone', 'Fri, 13 Nov 2026 18:09:29'],
		['in the future', 'Sat, 14 Nov 2026 12:06:00 +0000'],
		['older than Postmark keeps mail', 'Mon, 28 Sep 2026 12:00:00 +0000']
	])('rejects a date %s', (_, date) => {
		expect(verify({ ...route580(), Date: date })).toMatchObject({ ok: false, status: 422 });
	});

	it('rejects a message without a Message-ID', () => {
		const raw = route580();
		raw.Headers = raw.Headers.filter((h: { Name: string }) => h.Name !== 'Message-ID');
		expect(verify(raw)).toMatchObject({ ok: false, status: 422 });
	});
});
