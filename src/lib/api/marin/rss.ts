/**
 * RSS Feed Adapter for Marin Monitor
 *
 * Fetches and parses RSS/Atom feeds from Marin news sources.
 * Parsing and normalization are shared with the server producer
 * ($lib/news/feed-xml + normalize), so both paths behave identically.
 * Feed XML is fetched through the first-party /api/feeds route.
 */

import { FEEDS, type FeedSource } from '$lib/config/feeds';
import { isCountyScopedFeed } from '$lib/config/county-scope';
import type { NewsItem, NewsCategory } from '$lib/types';
import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import type { NormalizedNewsItem } from '$lib/news/normalize';
import { newsSourceId } from '$lib/news/source-id';
import { compareByTimestamp } from '$lib/news/order';
import { disambiguateReusedIds, sourceScopedId } from '$lib/news/identity';
import { loadNewsPipeline, type NewsPipeline } from './news-pipeline';

/** Result from fetching a single feed */
interface FeedResult {
	items: NewsItem[];
	feedName: string;
	error?: string;
}

/** Result from fetching all feeds in a category */
export interface CategoryFetchResult {
	category: NewsCategory;
	items: NewsItem[];
	errors: string[];
}

/**
 * Browser view of a normalized item. An unknown publication time is never
 * replaced by "now" (dashboard spec §13.8, TV spec Principle 3): the item is
 * kept with `timestamp: NaN` and its publishedAtStatus/raw value, shows as
 * "undated", and is excluded only from Latest reporting and recency counts.
 */
function toNewsItem(item: NormalizedNewsItem): NewsItem {
	return {
		id: sourceScopedId(item.sourceId, item.id),
		title: item.title,
		link: item.link,
		pubDate: item.publishedAtRaw ?? undefined,
		publishedAtSource: item.publishedAtSource ?? undefined,
		publishedAtStatus: item.publishedAtStatus,
		timestamp: item.publishedAt === null ? Number.NaN : Date.parse(item.publishedAt),
		...(item.eventAt ? { eventAt: item.eventAt } : {}),
		description: item.summary ?? undefined,
		content: item.content ?? undefined,
		source: item.source,
		category: item.category,
		verification: item.verification,
		...(item.point
			? {
					lat: item.point.lat,
					lon: item.point.lon,
					locationConfidence: 'exact' as const,
					locationEvidence: 'feed coordinates'
				}
			: {})
	};
}

/**
 * Parse an RSS 2.0 or Atom XML string into NewsItem[] with the same shared
 * parser and normalizer the server producer uses.
 */
function parseRssXml(
	xml: string,
	feedSource: FeedSource,
	category: NewsCategory,
	nowMs: number,
	{ parseFeedXml, normalizeEntry }: NewsPipeline
): NewsItem[] {
	const ctx = {
		sourceId: newsSourceId(feedSource.name),
		source: feedSource.name,
		category,
		verification: feedSource.verification,
		assumedTimeZone: feedSource.assumedTimeZone,
		pubDateMeaning: feedSource.pubDateMeaning
	};
	const items: NewsItem[] = [];
	for (const entry of parseFeedXml(xml).entries) {
		const normalized = normalizeEntry(entry, ctx, nowMs);
		if (normalized) {
			const item = toNewsItem(normalized);
			items.push(isCountyScopedFeed(feedSource.url) ? { ...item, geoScope: 'county' } : item);
		}
	}
	return disambiguateReusedIds(items);
}

/**
 * Fetch RSS XML for a feed URL via the first-party server route.
 */
async function fetchRssXml(url: string): Promise<string> {
	const proxyUrl = `/api/feeds?url=${encodeURIComponent(url)}`;
	const response = await fetchWithTimeout(proxyUrl, {
		headers: { Accept: 'application/xml, text/xml, application/rss+xml, */*' }
	});
	if (!response.ok) {
		throw new Error(`Feed proxy failed (${response.status})`);
	}

	const text = await response.text();
	if (!text || !text.includes('<')) {
		throw new Error('Feed proxy returned invalid XML');
	}

	return text;
}

/**
 * Fetch and parse a single RSS feed
 */
async function fetchFeed(
	feedSource: FeedSource,
	category: NewsCategory,
	pipeline: NewsPipeline
): Promise<FeedResult> {
	try {
		logger.log('RSS', `Fetching ${feedSource.name}: ${feedSource.url}`);

		const xml = await fetchRssXml(feedSource.url);
		const items = parseRssXml(xml, feedSource, category, Date.now(), pipeline);

		logger.log('RSS', `${feedSource.name}: ${items.length} items`);
		return { items, feedName: feedSource.name };
	} catch (error) {
		const msg = `${feedSource.name}: ${(error as Error).message}`;
		logger.warn('RSS', msg);
		return { items: [], feedName: feedSource.name, error: msg };
	}
}

/**
 * Fetch all feeds for a given category. Rejects when the parser cannot load,
 * so callers keep their previous items instead of replacing them with none.
 */
export async function fetchCategory(category: NewsCategory): Promise<CategoryFetchResult> {
	const feeds = FEEDS[category].filter((f) => !f.broken);

	if (feeds.length === 0) {
		return { category, items: [], errors: [] };
	}

	const pipeline = await loadNewsPipeline();
	// Fetch all feeds in the category concurrently
	const results = await Promise.allSettled(
		feeds.map((feed) => fetchFeed(feed, category, pipeline))
	);

	const allItems: NewsItem[] = [];
	const errors: string[] = [];

	for (const result of results) {
		if (result.status === 'fulfilled') {
			allItems.push(...result.value.items);
			if (result.value.error) {
				errors.push(result.value.error);
			}
		} else {
			errors.push(result.reason?.message || 'Unknown error');
		}
	}

	// Dated newest first; undated (NaN) last — never a subtraction comparator.
	allItems.sort(compareByTimestamp);

	return { category, items: allItems, errors };
}

/**
 * Fetch all RSS categories. If the parser cannot load, this rejects as a
 * whole: loadAllNews then records an `rss:` error and rewrites no category,
 * so the stores keep their last items until a later refresh recovers.
 */
export async function fetchAllFeeds(): Promise<CategoryFetchResult[]> {
	await loadNewsPipeline();
	const rssCategories: NewsCategory[] = [
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
		'satire'
	];

	const results = await Promise.allSettled(rssCategories.map((cat) => fetchCategory(cat)));

	return results.map((result, i) => {
		if (result.status === 'fulfilled') {
			return result.value;
		}
		return {
			category: rssCategories[i],
			items: [],
			errors: [result.reason?.message || 'Category fetch failed']
		};
	});
}
