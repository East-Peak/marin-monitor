/**
 * Raw feed entry → normalized news item. Pure and clock-injected; the browser
 * adapter (api/marin/rss.ts) and the server producer both call this, so the
 * two paths cannot disagree about titles, links, ids or dates.
 */
import { detectTopics, detectTown } from '$lib/config/keywords';
import type { NewsCategory, VerificationLevel } from '$lib/types';
import {
	parseFeedDate,
	resolveEventAt,
	resolvePublishedAt,
	type EventAt,
	type PublishedAt
} from './feed-date';
import type { RawFeedEntry } from './feed-xml';
import { htmlToText } from './html-to-text';
import { canonicalizeUrl, httpUrl } from './url';

export { canonicalizeUrl };

export const SUMMARY_MAX_CHARS = 300;

export interface FeedContext {
	sourceId: string;
	source: string;
	category: NewsCategory;
	verification: VerificationLevel;
	/** IANA zone for a source that sends zone-less times (config/feeds.ts). */
	assumedTimeZone?: string;
	/** What the feed's date field means; default 'publication' (config/feeds.ts). */
	pubDateMeaning?: 'publication' | 'event-start';
}

export interface NormalizedNewsItem extends PublishedAt, EventAt {
	id: string;
	sourceId: string;
	source: string;
	category: NewsCategory;
	verification: VerificationLevel;
	title: string;
	/** Original link when it is http(s); '' otherwise (never javascript: etc.). */
	link: string;
	/** Dedupe key: https, lower-case host without www, no tracking params/hash/trailing slash. */
	canonicalUrl: string | null;
	summary: string | null;
	content: string | null;
	/** Atom <updated> as an ISO instant. A modification time, never publication. */
	updatedAt: string | null;
	/** Town named in the title (provenance: title-match). */
	town: { name: string; slug: string; source: 'title-match' } | null;
	/** Coordinates the feed itself supplied (provenance: feed). */
	point: { lat: number; lon: number; source: 'feed' } | null;
	topics: string[];
}

/** Same hash the client has always used for items with neither guid nor link. */
function stableId(title: string, source: string): string {
	const str = `${source}:${title}`.toLowerCase();
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return `rss-${Math.abs(hash).toString(36)}`;
}

const UNKNOWN_PUBLICATION: PublishedAt = {
	publishedAt: null,
	publishedAtRaw: null,
	publishedAtSource: null,
	publishedAtStatus: 'missing',
	publishedAtAssumedZone: null
};

/**
 * Publication vs event time. For an 'event-start' source (Granicus agendas:
 * pubDate is the meeting time) the date is kept as eventAt and publication
 * stays unknown — it must never qualify as recent reporting.
 */
function dates(entry: RawFeedEntry, ctx: FeedContext, nowMs: number): PublishedAt & EventAt {
	if (ctx.pubDateMeaning === 'event-start') {
		return { ...UNKNOWN_PUBLICATION, ...resolveEventAt(entry.published, ctx.assumedTimeZone) };
	}
	return {
		...resolvePublishedAt(entry.published, nowMs, ctx.assumedTimeZone),
		eventAt: null,
		eventAtSource: null
	};
}

export function normalizeEntry(
	entry: RawFeedEntry,
	ctx: FeedContext,
	nowMs: number
): NormalizedNewsItem | null {
	const title = entry.title ? htmlToText(entry.title) : '';
	if (!title) return null;
	const summary = entry.description
		? htmlToText(entry.description).slice(0, SUMMARY_MAX_CHARS) || null
		: null;
	const content = entry.content ? htmlToText(entry.content) || null : null;
	const updatedMs = entry.updated ? parseFeedDate(entry.updated) : null;
	const town = detectTown(title);
	return {
		id: entry.guid || entry.link || stableId(entry.title ?? title, ctx.source),
		sourceId: ctx.sourceId,
		source: ctx.source,
		category: ctx.category,
		verification: ctx.verification,
		title,
		link: httpUrl(entry.link) ? (entry.link as string) : '',
		canonicalUrl: canonicalizeUrl(entry.link),
		summary,
		content,
		...dates(entry, ctx, nowMs),
		updatedAt: updatedMs === null ? null : new Date(updatedMs).toISOString(),
		town: town ? { ...town, source: 'title-match' } : null,
		point: entry.point ? { ...entry.point, source: 'feed' } : null,
		topics: detectTopics(`${title} ${summary ?? ''} ${content ?? ''}`)
	};
}
