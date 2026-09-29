/**
 * The published news snapshot: the shared normalized read model. The
 * scheduled producer (server/news/producer.ts) writes it; TV slice 3 and the
 * dashboard (G2) read it. Bump NEWS_SNAPSHOT_SCHEMA_VERSION on any breaking
 * change — readers reject versions they do not know.
 *
 * Two views, one blob:
 * - sources[].items: each source's own last-good items, NOT deduplicated.
 *   This is the retention state the next run starts from.
 * - items: the public, deduplicated view derived from all sources[].items.
 *
 * Time fields, kept separate on purpose:
 * - generatedAt: when this revision was built.
 * - lastSuccessfulScrapeAt: last run in which ≥1 source fetched OK (G0a's
 *   observation for the snapshot as a whole).
 * - sources[].lastSuccessAt: per-source observation time.
 * - items[].publishedAt: the feed's publication time (null when unknown).
 * - items[].eventAt: when the thing happens (event-start sources only).
 * - items[].updatedAt: Atom modification time, never publication.
 * - items[].fetchedAt: when the run that produced the item fetched its source.
 */
import type { NewsCategory, VerificationLevel } from '$lib/types';
import { resolvePublishedAt } from './feed-date';
import type { PublishedAtSource } from './feed-xml';
import type { NormalizedNewsItem } from './normalize';

export const NEWS_SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * ok: fetched and parsed this run, ≥1 item. empty: fetched OK, nothing
 * relevant. retained: failed this run; serving last-good items (see
 * lastSuccessAt). failed: failed and nothing retained.
 */
export type NewsSourceState = 'ok' | 'empty' | 'retained' | 'failed';

/** One source's own copy of an item (never merged with other sources). */
export type NewsSourceItem = Omit<NormalizedNewsItem, 'content'> & { fetchedAt: string };

export interface NewsSourceStatus {
	id: string;
	name: string;
	category: NewsCategory;
	verification: VerificationLevel;
	status: NewsSourceState;
	lastAttemptAt: string;
	lastSuccessAt: string | null;
	/** Short failure code + detail, e.g. "http-status: HTTP 404". Never a stack. */
	lastError: string | null;
	consecutiveFailures: number;
	/** = items.length */
	itemCount: number;
	/** Last-good items of this source, undeduplicated (retention state). */
	items: NewsSourceItem[];
}

export type NewsSnapshotItem = NewsSourceItem & {
	/** Every category the story appeared under (dedupe union). */
	categories: NewsCategory[];
	/** Other source ids whose copy of this story was merged into this one. */
	alsoReportedBy: string[];
};

export interface NewsSnapshot {
	schemaVersion: typeof NEWS_SNAPSHOT_SCHEMA_VERSION;
	/** Monotonic: previous revision + 1. */
	revision: number;
	generatedAt: string;
	lastSuccessfulScrapeAt: string | null;
	sources: NewsSourceStatus[];
	/** Deduped; valid publishedAt newest first, then unknown-date items. */
	items: NewsSnapshotItem[];
}

// ── Strict reader ──────────────────────────────────────────────────────────
// The blob is untrusted input (older writers, manual edits, corruption).
// Anything that does not satisfy the type AND its invariants is rejected.

const CATEGORIES: ReadonlySet<string> = new Set([
	'local',
	'civic',
	'safety',
	'outdoors',
	'housing',
	'cycling',
	'endurance',
	'shows',
	'prep',
	'farm',
	'satire',
	'311'
]);
const VERIFICATIONS: ReadonlySet<string> = new Set([
	'official',
	'local_media',
	'community',
	'satire'
]);
const DATE_SOURCES: ReadonlySet<string> = new Set(['rss:pubDate', 'rss:dc:date', 'atom:published']);

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNonEmpty = (v: unknown): v is string => isString(v) && v.length > 0;
const isNat = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/** A canonical ISO instant exactly as Date#toISOString writes it. */
export function isIsoInstant(v: unknown): v is string {
	if (!isString(v)) return false;
	const ms = Date.parse(v);
	return !Number.isNaN(ms) && new Date(ms).toISOString() === v;
}
const isIsoOrNull = (v: unknown) => v === null || isIsoInstant(v);

function isHttpUrl(v: unknown, httpsOnly = false): boolean {
	if (!isString(v)) return false;
	try {
		const { protocol } = new URL(v);
		return protocol === 'https:' || (!httpsOnly && protocol === 'http:');
	} catch {
		return false;
	}
}

/** Clock skew tolerated between a feed's timestamps and our own (feed-date FUTURE_SKEW_MS). */
const SKEW_MS = 5 * 60_000;
const notAfter = (a: unknown, b: unknown) =>
	Date.parse(a as string) <= Date.parse(b as string) + SKEW_MS;

/**
 * Publication provenance must reproduce its outcome: the raw value, re-read
 * by the shared feed-date parser in the recorded zone against the item's own
 * fetch time, yields exactly the recorded status, instant and zone. So a
 * writer cannot record a publication time its raw evidence does not support.
 */
function publishedAtConsistent(v: Rec): boolean {
	const {
		publishedAt,
		publishedAtRaw,
		publishedAtSource,
		publishedAtStatus,
		publishedAtAssumedZone: zone
	} = v;
	if (publishedAtStatus === 'missing') {
		return (
			publishedAt === null && publishedAtRaw === null && publishedAtSource === null && zone === null
		);
	}
	if (!isString(publishedAtRaw) || !DATE_SOURCES.has(publishedAtSource as string)) return false;
	if (!(zone === null || isNonEmpty(zone)) || !isIsoInstant(v.fetchedAt)) return false;
	const again = resolvePublishedAt(
		[{ source: publishedAtSource as PublishedAtSource, raw: publishedAtRaw }],
		Date.parse(v.fetchedAt),
		zone ?? undefined
	);
	return (
		again.publishedAtStatus === publishedAtStatus &&
		again.publishedAt === publishedAt &&
		again.publishedAtAssumedZone === zone
	);
}

function isSourceItem(v: unknown): v is Rec {
	if (!isRecord(v)) return false;
	const { town, point, eventAt, eventAtSource } = v;
	return (
		isNonEmpty(v.id) &&
		isNonEmpty(v.sourceId) &&
		isNonEmpty(v.source) &&
		CATEGORIES.has(v.category as string) &&
		VERIFICATIONS.has(v.verification as string) &&
		isNonEmpty(v.title) &&
		(v.link === '' || isHttpUrl(v.link)) &&
		(v.canonicalUrl === null || isHttpUrl(v.canonicalUrl, true)) &&
		(v.summary === null || isString(v.summary)) &&
		publishedAtConsistent(v) &&
		isIsoOrNull(v.updatedAt) &&
		isIsoOrNull(eventAt) &&
		(eventAt === null ? eventAtSource === null : DATE_SOURCES.has(eventAtSource as string)) &&
		// An event-start date is never also a publication time (Decision 7).
		(eventAt === null || v.publishedAtStatus === 'missing') &&
		isIsoInstant(v.fetchedAt) &&
		(town === null ||
			(isRecord(town) &&
				isNonEmpty(town.name) &&
				isNonEmpty(town.slug) &&
				town.source === 'title-match')) &&
		(point === null ||
			(isRecord(point) &&
				Number.isFinite(point.lat) &&
				Number.isFinite(point.lon) &&
				Math.abs(point.lat as number) <= 90 &&
				Math.abs(point.lon as number) <= 180 &&
				point.source === 'feed')) &&
		isStringArray(v.topics)
	);
}

// A Map, not an object literal: a status such as "toString" or
// "hasOwnProperty" must be unknown, never an inherited prototype member.
const STATE_RULES: ReadonlyMap<string, (s: Rec, items: unknown[]) => boolean> = new Map<
	NewsSourceState,
	(s: Rec, items: unknown[]) => boolean
>([
	// ok/empty: fetched THIS run, so the last success is this attempt.
	[
		'ok',
		(s, items) =>
			s.consecutiveFailures === 0 &&
			s.lastError === null &&
			s.lastSuccessAt === s.lastAttemptAt &&
			items.length > 0
	],
	[
		'empty',
		(s, items) =>
			s.consecutiveFailures === 0 &&
			s.lastError === null &&
			s.lastSuccessAt === s.lastAttemptAt &&
			items.length === 0
	],
	[
		'retained',
		(s, items) =>
			(s.consecutiveFailures as number) > 0 &&
			isNonEmpty(s.lastError) &&
			s.lastSuccessAt !== null &&
			items.length > 0
	],
	[
		'failed',
		(s, items) =>
			(s.consecutiveFailures as number) > 0 && isNonEmpty(s.lastError) && items.length === 0
	]
]);

function isSourceStatus(v: unknown): v is Rec {
	if (!isRecord(v) || !Array.isArray(v.items)) return false;
	const rule = isString(v.status) ? STATE_RULES.get(v.status) : undefined;
	return (
		isNonEmpty(v.id) &&
		isNonEmpty(v.name) &&
		CATEGORIES.has(v.category as string) &&
		VERIFICATIONS.has(v.verification as string) &&
		rule !== undefined &&
		isIsoInstant(v.lastAttemptAt) &&
		isIsoOrNull(v.lastSuccessAt) &&
		(v.lastSuccessAt === null || notAfter(v.lastSuccessAt, v.lastAttemptAt)) &&
		(v.lastError === null || isString(v.lastError)) &&
		isNat(v.consecutiveFailures) &&
		v.itemCount === v.items.length &&
		rule(v, v.items) &&
		v.items.every(
			(item) =>
				isSourceItem(item) &&
				item.sourceId === v.id &&
				// Last-good items come from the last success, never after it.
				Date.parse(item.fetchedAt as string) <= Date.parse(v.lastSuccessAt as string)
		)
	);
}

/** dedupe keeps a same-source reused GUID apart as `<id>~2`, `<id>~3`, … */
function isCopyOf(item: Rec, own: Rec): boolean {
	const [id, base] = [item.id as string, own.id as string];
	const suffix = id.startsWith(`${base}~`) ? id.slice(base.length + 1) : null;
	return own.title === item.title && (id === base || (suffix !== null && /^\d+$/.test(suffix)));
}

/**
 * A public story is a copy of an item in its own source's collection, and
 * every source it also cites still carries items (retention view agrees).
 */
function isSnapshotItem(v: unknown, collections: ReadonlyMap<string, Rec[]>): boolean {
	return (
		isSourceItem(v) &&
		(collections.get(v.sourceId as string) ?? []).some((own) => isCopyOf(v, own)) &&
		Array.isArray(v.categories) &&
		v.categories.length > 0 &&
		v.categories.every((c) => CATEGORIES.has(c as string)) &&
		v.categories.includes(v.category) &&
		isStringArray(v.alsoReportedBy) &&
		v.alsoReportedBy.every((id) => id !== v.sourceId && (collections.get(id)?.length ?? 0) > 0)
	);
}

const allUnique = (values: unknown[]) => new Set(values).size === values.length;

/** Strict check of untrusted JSON. Anything short of a valid v1 snapshot → null. */
export function parseNewsSnapshot(value: unknown): NewsSnapshot | null {
	if (!isRecord(value) || value.schemaVersion !== NEWS_SNAPSHOT_SCHEMA_VERSION) return null;
	if (!Number.isInteger(value.revision) || (value.revision as number) < 1) return null;
	if (!isIsoInstant(value.generatedAt) || !isIsoOrNull(value.lastSuccessfulScrapeAt)) return null;
	const { sources, items } = value;
	if (!Array.isArray(sources) || !sources.every(isSourceStatus)) return null;
	const collections = new Map(
		sources.map((s) => [(s as Rec).id as string, (s as Rec).items as Rec[]])
	);
	if (collections.size !== sources.length) return null;
	if (!Array.isArray(items) || !items.every((i) => isSnapshotItem(i, collections))) return null;
	// Nothing in a revision can have been fetched or attempted after it was generated.
	const generatedAt = value.generatedAt;
	const stamps = [
		...sources.flatMap((s) => [
			(s as Rec).lastAttemptAt,
			...((s as Rec).items as Rec[]).map((i) => i.fetchedAt)
		]),
		...items.map((i) => (i as Rec).fetchedAt)
	];
	if (!stamps.every((t) => notAfter(t, generatedAt))) return null;
	if (
		value.lastSuccessfulScrapeAt !== null &&
		!notAfter(value.lastSuccessfulScrapeAt, generatedAt)
	) {
		return null;
	}
	if (!allUnique(items.map((i) => (i as Rec).id))) return null;
	return value as unknown as NewsSnapshot;
}

/** The revision of a blob we cannot otherwise trust, so numbering stays monotonic. */
export function salvageRevision(value: unknown): number {
	const revision = isRecord(value) ? value.revision : undefined;
	return Number.isInteger(revision) && (revision as number) > 0 ? (revision as number) : 0;
}
