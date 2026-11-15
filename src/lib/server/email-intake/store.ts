/**
 * Email intake storage (Vercel Blob, private). One blob per message at
 * email-intake/v1/<sent UTC date>/<sha256(Message-ID)[:32]>.json, written createOnly: a
 * re-delivery finds its own blob (idempotent), and two deliveries never share a blob, so there is
 * no read-modify-write to lose. The route is a field, not a path: a held item is filtered out by
 * the public reader, never served. Only the sanitised EmailItem is stored, never the payload.
 */
import { createHash } from 'node:crypto';
import {
	collapseRevisions,
	isEmailItem,
	withinWindow,
	EMAIL_WINDOW_DAYS,
	type EmailIntakeRead,
	type EmailItem
} from '$lib/email-intake';
import { BlobWriteConflict, type BlobApi } from '$lib/server/news/snapshot-store';
import { readGoldenGate, type Route } from './golden-gate';
import { GG_SENDER, onlyHeader, type PostmarkInbound } from './postmark';

export const EMAIL_PREFIX = 'email-intake/v1/';
const DAY_MS = 24 * 60 * 60_000;
const READ_CONCURRENCY = 8;

/** Vercel Blob's list, every page of a prefix (the real one caps its pages and throws past them). */
export interface BlobLister {
	list(prefix: string, signal: AbortSignal): Promise<{ key: string; uploadedAt: string }[]>;
}

export interface IngestDeps {
	api: BlobApi;
	inbound: string;
	now: () => Date;
	signal: AbortSignal;
}

export type IngestResult =
	| { outcome: 'stored' | 'duplicate'; rule: string; destination: Route }
	| { outcome: 'dropped'; rule: string; destination: 'dropped' };

/** The allowlist: one reader per sender. A new sender is a new entry here. */
const READERS: Readonly<Record<string, typeof readGoldenGate>> = { [GG_SENDER]: readGoldenGate };

export const messageKey = (messageId: string) =>
	createHash('sha256').update(messageId.trim(), 'utf8').digest('hex').slice(0, 32);

export const itemPath = (sentAt: string, key: string) =>
	`${EMAIL_PREFIX}${sentAt.slice(0, 10)}/${key}.json`;

/**
 * Last-line guard: precise secret patterns only, never English words (an alert may say
 * "subscribers"). Sanitising happens earlier, in the reader; this catches what slipped through.
 */
function unsafe(item: EmailItem, inbound: string): boolean {
	const text = JSON.stringify(item).toLowerCase();
	const address = inbound.toLowerCase();
	return [
		'verification=',
		'links-2.govdelivery.com',
		'x-subscriber',
		'subscriber_id',
		'bulletin_recipient_id',
		address,
		address.replace('@', '%40')
	].some((bad) => bad !== '' && text.includes(bad));
}

/** Ingest one verified message (verifyPostmark passed). A failed write throws: never a 200. */
export async function ingestEmail(p: PostmarkInbound, deps: IngestDeps): Promise<IngestResult> {
	const sender = p.From.trim().toLowerCase();
	const reader = READERS[sender];
	if (!reader) throw new Error('email-intake: no reader for an allowed sender');
	const read = reader(p, deps.inbound);
	if (read.destination === 'dropped')
		return { outcome: 'dropped', rule: read.rule, destination: 'dropped' };
	const key = messageKey(onlyHeader(p, 'Message-ID') ?? '');
	const item: EmailItem = {
		v: 1,
		key,
		sender,
		rule: read.rule,
		destination: read.destination,
		subject: read.subject,
		sentAt: new Date(Date.parse(p.Date)).toISOString(),
		receivedAt: deps.now().toISOString(),
		description: read.description,
		permalink: read.permalink,
		topics: read.topics
	};
	if (unsafe(item, deps.inbound))
		return { outcome: 'dropped', rule: 'gg-unsafe', destination: 'dropped' };
	if (!isEmailItem(item)) throw new Error('email-intake: refusing to write an invalid item');
	try {
		await deps.api.write(
			itemPath(item.sentAt, key),
			JSON.stringify(item),
			{ createOnly: true },
			deps.signal
		);
	} catch (err) {
		if (err instanceof BlobWriteConflict)
			return { outcome: 'duplicate', rule: item.rule, destination: item.destination };
		throw err;
	}
	return { outcome: 'stored', rule: item.rule, destination: item.destination };
}

/** Bounded parallel map: at most `limit` reads in flight. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
}

/** A news row is its subject and bulletin link: nothing else of the email leaves the server. */
const forClient = (item: EmailItem): EmailItem =>
	item.destination === 'news' ? { ...item, description: null, topics: [] } : item;

/**
 * The public read: the date prefixes the window can touch (today back 14 days, plus tomorrow for
 * clock skew), every item read and validated; held and out-of-window items left out, revisions
 * collapsed. Any failed or invalid read fails the whole read: never a partial "none".
 */
export async function readEmailIntake(deps: {
	api: BlobApi & BlobLister;
	now: () => Date;
	signal: AbortSignal;
}): Promise<EmailIntakeRead> {
	const now = deps.now().getTime();
	const days = Array.from({ length: EMAIL_WINDOW_DAYS + 2 }, (_, i) =>
		new Date(now + DAY_MS - i * DAY_MS).toISOString().slice(0, 10)
	);
	const listed = (
		await Promise.all(days.map((d) => deps.api.list(`${EMAIL_PREFIX}${d}/`, deps.signal)))
	).flat();
	const items = await mapLimited(listed, READ_CONCURRENCY, async ({ key }) => {
		const found = await deps.api.read(key, deps.signal);
		if (!found) throw new Error(`email-intake: ${key} vanished`);
		const item: unknown = JSON.parse(found.text);
		if (!isEmailItem(item)) throw new Error(`email-intake: invalid item ${key}`);
		return item;
	});
	return {
		checkedAt: new Date(now).toISOString(),
		items: collapseRevisions(
			items.filter((i) => i.destination !== 'held' && i.permalink !== null && withinWindow(i, now))
		).map(forClient)
	};
}

/** When the newest stored email arrived (held included): information, never a verdict. */
export async function lastEmailReceived(
	lister: BlobLister,
	signal: AbortSignal
): Promise<string | null> {
	const blobs = await lister.list(EMAIL_PREFIX, signal);
	return blobs.reduce<string | null>(
		(max, b) => (max === null || b.uploadedAt > max ? b.uploadedAt : max),
		null
	);
}
