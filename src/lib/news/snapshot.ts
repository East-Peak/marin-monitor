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
// Rules take the item COUNT so the public view (no items) is held to them too.
const STATE_RULES: ReadonlyMap<string, (s: Rec, count: number) => boolean> = new Map<
	NewsSourceState,
	(s: Rec, count: number) => boolean
>([
	// ok/empty: fetched THIS run, so the last success is this attempt.
	[
		'ok',
		(s, count) =>
			s.consecutiveFailures === 0 &&
			s.lastError === null &&
			s.lastSuccessAt === s.lastAttemptAt &&
			count > 0
	],
	[
		'empty',
		(s, count) =>
			s.consecutiveFailures === 0 &&
			s.lastError === null &&
			s.lastSuccessAt === s.lastAttemptAt &&
			count === 0
	],
	[
		'retained',
		(s, count) =>
			(s.consecutiveFailures as number) > 0 &&
			isNonEmpty(s.lastError) &&
			s.lastSuccessAt !== null &&
			count > 0
	],
	[
		'failed',
		(s, count) => (s.consecutiveFailures as number) > 0 && isNonEmpty(s.lastError) && count === 0
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
		rule(v, v.items.length) &&
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

/** categories contains the item's own; alsoReportedBy names other sources the reader can vouch for. */
function hasStoryProvenance(v: Rec, vouched: (sourceId: string) => boolean): boolean {
	return (
		Array.isArray(v.categories) &&
		v.categories.length > 0 &&
		v.categories.every((c) => CATEGORIES.has(c as string)) &&
		v.categories.includes(v.category) &&
		isStringArray(v.alsoReportedBy) &&
		v.alsoReportedBy.every((id) => id !== v.sourceId && vouched(id))
	);
}

/**
 * A public story is a copy of an item in its own source's collection, and
 * every source it also cites still carries items (retention view agrees).
 */
function isSnapshotItem(v: unknown, collections: ReadonlyMap<string, Rec[]>): boolean {
	return (
		isSourceItem(v) &&
		(collections.get(v.sourceId as string) ?? []).some((own) => isCopyOf(v, own)) &&
		hasStoryProvenance(v, (id) => (collections.get(id)?.length ?? 0) > 0)
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

// ── Public projection: what GET /api/news/snapshot serves ─────────────────
// sources[].items is the producer's retention state (about half the blob) and
// is never served: readers get the deduplicated items plus each source's
// status. The view shares schemaVersion (a breaking snapshot change is a
// breaking view change). The browser re-checks every view it receives: a
// cached body can predate a deploy.

export interface NewsSnapshotView {
	schemaVersion: typeof NEWS_SNAPSHOT_SCHEMA_VERSION;
	revision: number;
	generatedAt: string;
	lastSuccessfulScrapeAt: string | null;
	sources: Omit<NewsSourceStatus, 'items'>[];
	items: NewsSnapshotItem[];
}

/**
 * The endpoint body (dashboard §13.2 mapping): unavailable = nothing has been
 * published yet; unknown = a snapshot may exist but cannot be trusted or read.
 */
export type NewsSnapshotResponse =
	| { status: 'ok'; snapshot: NewsSnapshotView }
	| { status: 'unavailable'; reason: 'missing' }
	| { status: 'unknown'; reason: 'invalid' | 'read-failed' | 'not-configured' };

export function toNewsSnapshotView(snapshot: NewsSnapshot): NewsSnapshotView {
	return {
		schemaVersion: snapshot.schemaVersion,
		revision: snapshot.revision,
		generatedAt: snapshot.generatedAt,
		lastSuccessfulScrapeAt: snapshot.lastSuccessfulScrapeAt,
		sources: snapshot.sources.map(({ items: _items, ...status }) => status),
		items: snapshot.items
	};
}

/** The full reader's source rules, held against itemCount instead of items. */
function isSourceSummary(v: unknown, generatedAt: unknown): boolean {
	if (!isRecord(v)) return false;
	const rule = isString(v.status) ? STATE_RULES.get(v.status) : undefined;
	return (
		isNonEmpty(v.id) &&
		isNonEmpty(v.name) &&
		CATEGORIES.has(v.category as string) &&
		VERIFICATIONS.has(v.verification as string) &&
		rule !== undefined &&
		isIsoInstant(v.lastAttemptAt) &&
		notAfter(v.lastAttemptAt, generatedAt) &&
		isIsoOrNull(v.lastSuccessAt) &&
		(v.lastSuccessAt === null || notAfter(v.lastSuccessAt, v.lastAttemptAt)) &&
		(v.lastError === null || isString(v.lastError)) &&
		isNat(v.consecutiveFailures) &&
		isNat(v.itemCount) &&
		rule(v, v.itemCount as number)
	);
}

/** Strict check of an untrusted view. Anything short of a valid v1 view → null. */
export function parseNewsSnapshotView(value: unknown): NewsSnapshotView | null {
	if (!isRecord(value) || value.schemaVersion !== NEWS_SNAPSHOT_SCHEMA_VERSION) return null;
	if (!Number.isInteger(value.revision) || (value.revision as number) < 1) return null;
	if (!isIsoInstant(value.generatedAt) || !isIsoOrNull(value.lastSuccessfulScrapeAt)) return null;
	const { sources, items, generatedAt } = value;
	if (
		value.lastSuccessfulScrapeAt !== null &&
		!notAfter(value.lastSuccessfulScrapeAt, generatedAt)
	) {
		return null;
	}
	if (!Array.isArray(sources) || !sources.every((s) => isSourceSummary(s, generatedAt)))
		return null;
	const sourceIds = new Set(sources.map((s) => (s as Rec).id as string));
	if (sourceIds.size !== sources.length) return null;
	// Story ↔ source consistency still checkable without the retention items
	// (Codex r2 #7): a story comes from a source that carries items, no later
	// than that source's last success, and a source cannot show more public
	// stories than it carries.
	const byId = new Map(sources.map((s) => [(s as Rec).id as string, s as Rec]));
	const carries = (id: string) => ((byId.get(id)?.itemCount as number | undefined) ?? 0) > 0;
	const isViewItem = (v: unknown) => {
		if (!isSourceItem(v)) return false;
		const own = byId.get(v.sourceId as string);
		return (
			own !== undefined &&
			carries(v.sourceId as string) &&
			own.lastSuccessAt !== null &&
			Date.parse(v.fetchedAt as string) <= Date.parse(own.lastSuccessAt as string) &&
			notAfter(v.fetchedAt, generatedAt) &&
			hasStoryProvenance(v, carries)
		);
	};
	if (!Array.isArray(items) || !items.every(isViewItem)) return null;
	// Every distinct source a story references (own + alsoReportedBy) holds
	// one of its items for that story (Codex r3 #4).
	const perSource = new Map<string, number>();
	for (const i of items as Rec[]) {
		for (const id of new Set([i.sourceId as string, ...(i.alsoReportedBy as string[])])) {
			perSource.set(id, (perSource.get(id) ?? 0) + 1);
		}
	}
	for (const [id, n] of perSource) if (n > ((byId.get(id)?.itemCount as number) ?? 0)) return null;
	if (!allUnique(items.map((i) => (i as Rec).id))) return null;
	return value as unknown as NewsSnapshotView;
}

const UNKNOWN_REASONS: ReadonlySet<string> = new Set(['invalid', 'read-failed', 'not-configured']);

/** Strict check of an untrusted endpoint body. */
export function parseNewsSnapshotResponse(value: unknown): NewsSnapshotResponse | null {
	if (!isRecord(value)) return null;
	if (value.status === 'ok') {
		const snapshot = parseNewsSnapshotView(value.snapshot);
		return snapshot === null ? null : { status: 'ok', snapshot };
	}
	if (value.status === 'unavailable' && value.reason === 'missing') {
		return { status: 'unavailable', reason: 'missing' };
	}
	if (value.status === 'unknown' && UNKNOWN_REASONS.has(value.reason as string)) {
		return {
			status: 'unknown',
			reason: value.reason as 'invalid' | 'read-failed' | 'not-configured'
		};
	}
	return null;
}
