/**
 * The producer's source registry, derived from the checked-in feed config
 * (the same list /api/feeds allowlists). Order = dedupe priority.
 */
import { FEEDS } from '$lib/config/feeds';
import { newsSourceId } from '$lib/news/source-id';
import type { NewsCategory, VerificationLevel } from '$lib/types';

export interface NewsSource {
	id: string;
	name: string;
	url: string;
	category: NewsCategory;
	verification: VerificationLevel;
	assumedTimeZone?: string;
	pubDateMeaning?: 'publication' | 'event-start';
	/** Lower wins dedupe ties. */
	priority: number;
}

export const NEWS_SOURCES: readonly NewsSource[] = Object.freeze(
	(Object.entries(FEEDS) as [NewsCategory, (typeof FEEDS)[NewsCategory]][])
		.flatMap(([category, feeds]) =>
			feeds.filter((feed) => !feed.broken).map((feed) => ({ ...feed, category }))
		)
		.map((feed, priority) =>
			Object.freeze({
				id: newsSourceId(feed.name),
				name: feed.name,
				url: feed.url,
				category: feed.category,
				verification: feed.verification,
				...(feed.assumedTimeZone ? { assumedTimeZone: feed.assumedTimeZone } : {}),
				...(feed.pubDateMeaning ? { pubDateMeaning: feed.pubDateMeaning } : {}),
				priority
			})
		)
);

/** Exact hostnames the producer may contact (initial URLs and redirects). */
export const NEWS_ALLOWED_HOSTS: ReadonlySet<string> = new Set(
	NEWS_SOURCES.map((source) => new URL(source.url).hostname)
);
