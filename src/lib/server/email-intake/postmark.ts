/**
 * Who may post to the inbound webhook (email intake v1). Postmark adds no Authentication-Results
 * header, so the provider's own verdict is read from the headers its inbound servers prepend:
 * Received-SPF (pass, for a govdelivery.com envelope), SpamAssassin's X-Spam-Tests (DKIM_VALID_AU:
 * a valid signature from the From domain) and X-Spam-Status (No). Each comes from the Headers
 * array only, never the body or a top-level field, and a duplicate of any of them is rejected:
 * a sender can add its own copy, Postmark prepends one.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const GG_SENDER = 'goldengate@service.govdelivery.com';
const GG_ACCOUNT = 'CAGOLDEN';
/** Postmark keeps inbound mail 45 days; anything older is not a delivery we expect. */
const MAX_AGE_MS = 45 * 24 * 60 * 60_000;
const FUTURE_SKEW_MS = 5 * 60_000;

export interface PostmarkHeader {
	Name: string;
	Value: string;
}

/** The fields of Postmark's inbound JSON the intake reads, shape-checked. */
export interface PostmarkInbound {
	From: string;
	FromFull: { Email: string };
	To: string;
	ToFull: { Email: string }[];
	Cc: string;
	Bcc: string;
	OriginalRecipient: string;
	Subject: string;
	Date: string;
	TextBody: string;
	Headers: PostmarkHeader[];
}

export type Verdict = { ok: true } | { ok: false; status: 403 | 422; reason: string };

const isString = (v: unknown): v is string => typeof v === 'string';
const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const isHeader = (v: unknown): v is PostmarkHeader =>
	isRecord(v) && isString(v.Name) && isString(v.Value);
const optional = (v: unknown) => v === undefined || v === null || isString(v);

export function parsePostmark(raw: unknown): PostmarkInbound | null {
	if (!isRecord(raw)) return null;
	const { FromFull, ToFull, Headers } = raw;
	const ok =
		isString(raw.From) &&
		isRecord(FromFull) &&
		isString(FromFull.Email) &&
		isString(raw.To) &&
		Array.isArray(ToFull) &&
		ToFull.every((t) => isRecord(t) && isString(t.Email)) &&
		optional(raw.Cc) &&
		optional(raw.Bcc) &&
		isString(raw.OriginalRecipient) &&
		isString(raw.Subject) &&
		isString(raw.Date) &&
		optional(raw.TextBody) &&
		Array.isArray(Headers) &&
		Headers.every(isHeader);
	if (!ok) return null;
	return {
		From: raw.From as string,
		FromFull: { Email: FromFull.Email as string },
		To: raw.To as string,
		ToFull: (ToFull as { Email: string }[]).map((t) => ({ Email: t.Email })),
		Cc: (raw.Cc as string | undefined) ?? '',
		Bcc: (raw.Bcc as string | undefined) ?? '',
		OriginalRecipient: raw.OriginalRecipient as string,
		Subject: raw.Subject as string,
		Date: raw.Date as string,
		TextBody: (raw.TextBody as string | undefined) ?? '',
		Headers: (Headers as PostmarkHeader[]).map((h) => ({ Name: h.Name, Value: h.Value }))
	};
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** HTTP basic auth, compared as digests in constant time; unset secrets fail closed. */
export function basicAuthOk(header: string | null, user: string, pass: string): boolean {
	if (!user || !pass || !header?.startsWith('Basic ')) return false;
	let decoded: string;
	try {
		decoded = atob(header.slice('Basic '.length).trim());
	} catch {
		return false;
	}
	if (!decoded.includes(':')) return false;
	// Both comparisons always run: no early exit on the user.
	const userOk = timingSafeEqual(digest(decoded.slice(0, decoded.indexOf(':'))), digest(user));
	const passOk = timingSafeEqual(digest(decoded.slice(decoded.indexOf(':') + 1)), digest(pass));
	return userOk && passOk;
}

/** Every value of a header, its name matched case-insensitively. */
export const headerValues = (p: PostmarkInbound, name: string) =>
	p.Headers.filter((h) => h.Name.toLowerCase() === name.toLowerCase()).map((h) => h.Value);

/** The one value of a header, or null when it is missing or repeated. */
export function onlyHeader(p: PostmarkInbound, name: string): string | null {
	const values = headerValues(p, name);
	return values.length === 1 ? values[0] : null;
}

const lower = (s: string) => s.trim().toLowerCase();
const reject = (status: 403 | 422, reason: string): Verdict => ({ ok: false, status, reason });

function spfPass(value: string): boolean {
	if (!/^pass\s/i.test(value)) return false;
	const envelope = /envelope-from="[^"@]*@([^"]+)"/i.exec(value)?.[1]?.toLowerCase();
	return !!envelope && (envelope === 'govdelivery.com' || envelope.endsWith('.govdelivery.com'));
}

/** RFC 5322 dates name their zone: an offset, or GMT/UT. */
const ZONED = /(?:[+-]\d{4}|\bGMT|\bUTC?)\s*(?:\([^)]*\))?\s*$/i;

export function verifyPostmark(p: PostmarkInbound, inbound: string, now: number): Verdict {
	if (lower(p.From) !== GG_SENDER || lower(p.FromFull.Email) !== GG_SENDER)
		return reject(403, 'sender not allowed');
	const to = lower(inbound);
	if (
		!to ||
		lower(p.OriginalRecipient) !== to ||
		p.ToFull.length !== 1 ||
		lower(p.ToFull[0].Email) !== to ||
		p.Cc.trim() !== '' ||
		p.Bcc.trim() !== ''
	)
		return reject(403, 'recipient not ours');
	const spf = onlyHeader(p, 'Received-SPF');
	const tests = onlyHeader(p, 'X-Spam-Tests');
	const status = onlyHeader(p, 'X-Spam-Status');
	const account = onlyHeader(p, 'X-Accountcode');
	if (spf === null || tests === null || status === null || account === null)
		return reject(403, 'provider headers missing or repeated');
	if (!spfPass(spf)) return reject(403, 'spf');
	if (!tests.split(',').some((t) => t.trim() === 'DKIM_VALID_AU')) return reject(403, 'dkim');
	if (status.trim() !== 'No') return reject(403, 'spam');
	if (account.trim() !== GG_ACCOUNT) return reject(403, 'account');
	const ids = headerValues(p, 'Message-ID');
	if (ids.length > 1) return reject(403, 'message-id repeated');
	if (ids.length === 0 || ids[0].trim() === '') return reject(422, 'no message-id');
	const sent = ZONED.test(p.Date.trim()) ? Date.parse(p.Date) : NaN;
	if (!Number.isFinite(sent) || sent - now > FUTURE_SKEW_MS || now - sent > MAX_AGE_MS)
		return reject(422, 'date');
	return { ok: true };
}
