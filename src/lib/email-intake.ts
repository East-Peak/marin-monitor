/**
 * Email intake v1: the sanitised items the Postmark webhook stores, one per message, and what
 * the public reader serves. Each item records the rule that routed it. Nothing here is ever a
 * raw header or body: only the fields below, checked by one validator for writer and reader.
 */

/** Rows show the emails sent in the last 14 days, said as a window; no end time is parsed. */
export const EMAIL_WINDOW_DAYS = 14;
const WINDOW_MS = EMAIL_WINDOW_DAYS * 24 * 60 * 60_000;
const FUTURE_SKEW_MS = 5 * 60_000;

/** Where an item goes: a Getting Around part, the news feed, or held privately (never served). */
export type EmailDestination = 'transit' | 'roads' | 'news' | 'held';
const DESTINATIONS: ReadonlySet<string> = new Set(['transit', 'roads', 'news', 'held']);

export interface EmailItem {
	v: 1;
	/** sha256(Message-ID), 32 hex: the idempotency key. */
	key: string;
	sender: string;
	/** The routing rule's id ("gg-ferry-alert"). */
	rule: string;
	destination: EmailDestination;
	/** The subject as written, whitespace collapsed. */
	subject: string;
	sentAt: string;
	receivedAt: string;
	/** The body's first paragraph, links removed; null when there is none. */
	description: string | null;
	/** The public bulletin page; null only on a held item. */
	permalink: string | null;
	/** What the item is about, from its rule ("Larkspur Ferry", "Route 580"). */
	topics: string[];
}

/** The public read: shown destinations only, in the window, revisions collapsed. */
export interface EmailIntakeRead {
	checkedAt: string;
	items: EmailItem[];
}

export const BULLETIN_LINK =
	/^https:\/\/content\.govdelivery\.com\/accounts\/CAGOLDEN\/bulletins\/[0-9a-f]+$/;

const isString = (v: unknown): v is string => typeof v === 'string';
const isTime = (v: unknown): v is string => isString(v) && Number.isFinite(Date.parse(v));
const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

export function isEmailItem(v: unknown): v is EmailItem {
	return (
		isRecord(v) &&
		v.v === 1 &&
		isString(v.key) &&
		/^[0-9a-f]{32}$/.test(v.key) &&
		isString(v.sender) &&
		isString(v.rule) &&
		v.rule !== '' &&
		isString(v.destination) &&
		DESTINATIONS.has(v.destination) &&
		isString(v.subject) &&
		v.subject !== '' &&
		isTime(v.sentAt) &&
		isTime(v.receivedAt) &&
		(v.description === null || isString(v.description)) &&
		(v.permalink === null || (isString(v.permalink) && BULLETIN_LINK.test(v.permalink))) &&
		Array.isArray(v.topics) &&
		v.topics.every(isString)
	);
}

export function isEmailIntakeRead(v: unknown): v is EmailIntakeRead {
	return (
		isRecord(v) &&
		isTime(v.checkedAt) &&
		Array.isArray(v.items) &&
		v.items.every((i) => isEmailItem(i) && i.destination !== 'held' && i.permalink !== null)
	);
}

/** A resend's markers, any number, in any order: "[Updated 1:00PM]", "[UPDATED]", "REMINDER!". */
const REVISION_PREFIX = /^\s*(?:\[updated[^\]]*\]|reminder!)\s*/i;

/** The subject without its resend markers: what a revision shares with its original. */
export function revisionBase(subject: string): string {
	let out = subject;
	for (
		let next = out.replace(REVISION_PREFIX, '');
		next !== out;
		next = out.replace(REVISION_PREFIX, '')
	)
		out = next;
	return out.replace(/\s+/g, ' ').trim();
}

const newer = (a: EmailItem, b: EmailItem) =>
	Date.parse(a.sentAt) - Date.parse(b.sentAt) || (a.key > b.key ? 1 : a.key < b.key ? -1 : 0);

/** One item per alert (rule + folded base subject), the newest send winning; newest first. */
export function collapseRevisions(items: readonly EmailItem[]): EmailItem[] {
	const latest = new Map<string, EmailItem>();
	for (const item of items) {
		const id = `${item.rule}\n${revisionBase(item.subject).toLowerCase()}`;
		const held = latest.get(id);
		if (!held || newer(item, held) > 0) latest.set(id, item);
	}
	return [...latest.values()].sort((a, b) => newer(b, a));
}

/** Sent within the last 14 days (and not from the future beyond clock skew). */
export function withinWindow(item: EmailItem, now: number): boolean {
	const at = Date.parse(item.sentAt);
	return at > now - WINDOW_MS && at - now <= FUTURE_SKEW_MS;
}
