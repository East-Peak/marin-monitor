/**
 * Story-identity rules, shared by the producer's dedupe and the dashboard's
 * reporting selectors (one definition, never re-implemented):
 * - sourceScopedId: a GUID is unique only within its own feed — used for
 *   both producer and browser ids. Copies of one story in several feeds are
 *   joined by article identity instead (collapseStoryCopies / dedupeItems).
 * - titleKey: accents removed BEFORE punctuation is normalized, so
 *   "Réouverture" → "reouverture" (not "re ouverture").
 * - sameStoryByTitle: same key (≥12 chars) AND both dated within 24h.
 * - isGenericUrl: home/section/listing/feed pages are never article identity.
 * - compareRepresentative: which copy of a story represents it — a dated
 *   copy beats an undated one, then source priority, newest, id.
 */
import type { PublishedAtStatus } from './feed-date';
import { compareNewest, hasKnownPublicationTime } from './order';
import { canonicalizeUrl } from './url';

export const TITLE_MATCH_WINDOW_MS = 24 * 3_600_000;
export const MIN_TITLE_KEY_CHARS = 12;

export function sourceScopedId(sourceId: string, rawId: string): string {
	return `${sourceId}:${rawId}`;
}

export function titleKey(title: string): string {
	return title
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

const knownMs = (publishedAt: string | null): number | null => {
	if (publishedAt === null) return null;
	const ms = Date.parse(publishedAt);
	return Number.isFinite(ms) ? ms : null;
};

export function sameStoryByTitle(
	a: { title: string; publishedAt: string | null },
	b: { title: string; publishedAt: string | null }
): boolean {
	const am = knownMs(a.publishedAt);
	const bm = knownMs(b.publishedAt);
	const key = titleKey(a.title);
	return (
		am !== null &&
		bm !== null &&
		key.length >= MIN_TITLE_KEY_CHARS &&
		key === titleKey(b.title) &&
		Math.abs(am - bm) <= TITLE_MATCH_WINDOW_MS
	);
}

const LANDING_PATH =
	/^\/(?:[\w-]+\/)?(?:news|feed|rss|home|index(?:\.\w+)?|blog|events?|calendar|agendas?|minutes|viewpublisher\.php)$/i;
const LISTING_PATH = /^\/(?:tag|tags|category|categories|topics?|author|section)\//i;

/** A home, section, listing or feed page — never evidence that two items are one story. */
export function isGenericUrl(canonicalUrl: string): boolean {
	const { pathname } = new URL(canonicalUrl);
	return pathname === '/' || LANDING_PATH.test(pathname) || LISTING_PATH.test(pathname);
}

export function compareRepresentative<
	T extends { id: string; sourceId: string; publishedAt: string | null }
>(priorityOf: (sourceId: string) => number): (a: T, b: T) => number {
	const undated = (x: T) => (knownMs(x.publishedAt) === null ? 1 : 0);
	return (a, b) =>
		undated(a) - undated(b) ||
		priorityOf(a.sourceId) - priorityOf(b.sourceId) ||
		compareNewest(a, b) ||
		a.id.localeCompare(b.id);
}

/**
 * Canonical article URLs that some single source uses for two different
 * titles — shared landing pages in disguise, never story identity.
 */
export function reusedArticleUrls(
	items: readonly { source: string; title: string; url: string | null }[]
): Set<string> {
	const titles = new Map<string, Set<string>>();
	const reused = new Set<string>();
	for (const { source, title, url } of items) {
		if (!url) continue;
		const key = `${source}\u0000${url}`;
		const seen = titles.get(key) ?? new Set<string>();
		seen.add(titleKey(title));
		titles.set(key, seen);
		if (seen.size > 1) reused.add(url);
	}
	return reused;
}

/** What collapsing copies of one story preserves from every copy. */
export interface StoryCopyProvenance<C extends string = string> {
	/** Every category any copy appeared under (the kept copy's first). */
	categories: C[];
	/** Sources of the other copies that were joined into this one. */
	alsoReportedBy: string[];
}

interface CollapsibleStory {
	id: string;
	source: string;
	title: string;
	link: string;
	category?: string;
	town?: string;
	townSlug?: string;
	/** Set by county-scoped feeds (dashboard D1); merged, never dropped. */
	geoScope?: 'county';
	/** NaN when the publication time is unknown (browser NewsItem). */
	timestamp?: number;
	publishedAtStatus?: PublishedAtStatus;
}

/**
 * A feed that files two different stories under one GUID (the producer's
 * rule in dedupeItems): the first title keeps the id, each other distinct
 * title gets `~2`, `~3`, …; a repeated title is the same story and keeps it.
 */
export function disambiguateReusedIds<T extends { id: string; title: string }>(
	items: readonly T[]
): T[] {
	const titlesById = new Map<string, string[]>();
	return items.map((item) => {
		const titles = titlesById.get(item.id) ?? [];
		titlesById.set(item.id, titles);
		const key = titleKey(item.title);
		const n = titles.includes(key) ? titles.indexOf(key) : titles.push(key) - 1;
		return n === 0 ? item : { ...item, id: `${item.id}~${n + 1}` };
	});
}

/**
 * One story from its copies. The representative is the first DATED copy —
 * compareRepresentative's first rule, with input (feed) order standing in for
 * source priority — else the first copy. Scope and provenance are MERGED
 * from every copy, so nothing is lost to input order:
 * - geoScope: 'county' if ANY copy is explicitly county-scoped;
 * - town/townSlug: the representative's, else the first copy that has one;
 * - categories: union, the representative's own first;
 * - alsoReportedBy: the other copies' sources.
 */
function mergeCopies<T extends CollapsibleStory>(
	copies: readonly T[]
): T & StoryCopyProvenance<NonNullable<T['category']>> {
	type C = NonNullable<T['category']>;
	const dated = (c: T) =>
		hasKnownPublicationTime({ timestamp: c.timestamp, publishedAtStatus: c.publishedAtStatus });
	const rep = copies.find(dated) ?? copies[0];
	const withTown = rep.townSlug ? rep : copies.find((c) => c.townSlug);
	const unique = <V>(values: (V | undefined)[]) =>
		[...new Set(values)].filter((v): v is V => v !== undefined);
	return {
		...rep,
		...(copies.some((c) => c.geoScope === 'county') ? { geoScope: 'county' as const } : {}),
		...(withTown ? { town: withTown.town, townSlug: withTown.townSlug } : {}),
		categories: unique([rep, ...copies].map((c) => c.category as C | undefined)),
		alsoReportedBy: unique(copies.map((c) => c.source)).filter((s) => s !== rep.source)
	};
}

/**
 * The browser stores' combined view (allNewsItems, alerts): one entry per
 * story, in first-seen order. Ids are source-scoped, so equal GUIDs from
 * different feeds never collide; copies of ONE story carried by several feeds
 * (e.g. a Marin IJ post in two tag feeds) are joined by trustworthy article
 * identity — the same canonical, non-generic, non-reused article URL — and
 * merged by mergeCopies.
 */
export function collapseStoryCopies<T extends CollapsibleStory>(
	items: readonly T[]
): (T & StoryCopyProvenance<NonNullable<T['category']>>)[] {
	const urls = items.map((item) => canonicalizeUrl(item.link));
	const reused = reusedArticleUrls(items.map((item, k) => ({ ...item, url: urls[k] })));
	const byId = new Map<string, T[]>();
	const byUrl = new Map<string, T[]>();
	const groups: T[][] = [];
	items.forEach((item, k) => {
		const url = urls[k];
		const article = url && !reused.has(url) && !isGenericUrl(url) ? url : null;
		let group = byId.get(item.id) ?? (article ? byUrl.get(article) : undefined);
		if (group) group.push(item);
		else groups.push((group = [item]));
		if (!byId.has(item.id)) byId.set(item.id, group);
		if (article && !byUrl.has(article)) byUrl.set(article, group);
	});
	return groups.map(mergeCopies);
}
