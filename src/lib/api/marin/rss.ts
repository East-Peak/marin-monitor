/**
 * RSS Feed Adapter for Marin Monitor
 *
 * Fetches and parses RSS/Atom feeds from Marin news sources.
 * Uses browser-native DOMParser (no npm dependencies).
 * All requests go through CORS proxy via ServiceClient.
 */

import { serviceClient } from '$lib/services/client';
import { FEEDS, type FeedSource } from '$lib/config/feeds';
import type { NewsItem, NewsCategory, VerificationLevel } from '$lib/types';
import { logger } from '$lib/config/api';

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
 * Parse an RSS 2.0 or Atom XML string into NewsItem[]
 */
function parseRssXml(
	xml: string,
	source: string,
	category: NewsCategory,
	verification: VerificationLevel
): NewsItem[] {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xml, 'text/xml');

	// Check for parse errors
	const parseError = doc.querySelector('parsererror');
	if (parseError) {
		throw new Error(`XML parse error: ${parseError.textContent?.slice(0, 100)}`);
	}

	const items: NewsItem[] = [];

	// Try RSS 2.0 format first (most common for these feeds)
	const rssItems = doc.querySelectorAll('item');
	if (rssItems.length > 0) {
		rssItems.forEach((item) => {
			const newsItem = parseRssItem(item, source, category, verification);
			if (newsItem) items.push(newsItem);
		});
		return items;
	}

	// Try Atom format
	const atomEntries = doc.querySelectorAll('entry');
	if (atomEntries.length > 0) {
		atomEntries.forEach((entry) => {
			const newsItem = parseAtomEntry(entry, source, category, verification);
			if (newsItem) items.push(newsItem);
		});
		return items;
	}

	return items;
}

/**
 * Parse a single RSS 2.0 <item> element
 */
function parseRssItem(
	item: Element,
	source: string,
	category: NewsCategory,
	verification: VerificationLevel
): NewsItem | null {
	const title = getElementText(item, 'title');
	if (!title) return null;

	const link = getElementText(item, 'link');
	const description = getElementText(item, 'description');
	const pubDate = getElementText(item, 'pubDate');
	const guid = getElementText(item, 'guid');
	const content = getElementText(item, 'content:encoded');

	const timestamp = pubDate ? new Date(pubDate).getTime() : Date.now();

	// Skip items with invalid dates (NaN)
	if (isNaN(timestamp)) {
		return {
			id: guid || link || generateId(title, source),
			title: cleanHtml(title),
			link: link || '',
			timestamp: Date.now(),
			description: description ? cleanHtml(description).slice(0, 300) : undefined,
			content: content ? cleanHtml(content) : undefined,
			source,
			category,
			verification
		};
	}

	return {
		id: guid || link || generateId(title, source),
		title: cleanHtml(title),
		link: link || '',
		pubDate: pubDate || undefined,
		timestamp,
		description: description ? cleanHtml(description).slice(0, 300) : undefined,
		content: content ? cleanHtml(content) : undefined,
		source,
		category,
		verification
	};
}

/**
 * Parse a single Atom <entry> element
 */
function parseAtomEntry(
	entry: Element,
	source: string,
	category: NewsCategory,
	verification: VerificationLevel
): NewsItem | null {
	const title = getElementText(entry, 'title');
	if (!title) return null;

	// Atom links are in <link> elements with href attribute
	const linkEl = entry.querySelector('link[rel="alternate"]') || entry.querySelector('link');
	const link = linkEl?.getAttribute('href') || '';

	const summary = getElementText(entry, 'summary');
	const content = getElementText(entry, 'content');
	const published = getElementText(entry, 'published') || getElementText(entry, 'updated');
	const id = getElementText(entry, 'id');

	const timestamp = published ? new Date(published).getTime() : Date.now();

	return {
		id: id || link || generateId(title, source),
		title: cleanHtml(title),
		link,
		pubDate: published || undefined,
		timestamp: isNaN(timestamp) ? Date.now() : timestamp,
		description: summary ? cleanHtml(summary).slice(0, 300) : undefined,
		content: content ? cleanHtml(content) : undefined,
		source,
		category,
		verification
	};
}

/**
 * Get text content of a child element.
 * Uses getElementsByTagName to handle namespaced tags (e.g. content:encoded)
 * since querySelector chokes on colons in tag names.
 */
function getElementText(parent: Element, tagName: string): string | null {
	// getElementsByTagName handles namespace prefixes correctly
	const els = parent.getElementsByTagName(tagName);
	if (els.length === 0) return null;

	const text = els[0].textContent?.trim();
	return text || null;
}

/**
 * Strip HTML tags from text (for descriptions that contain markup)
 */
function cleanHtml(text: string): string {
	return text
		.replace(/<!\[CDATA\[|\]\]>/g, '')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Generate a stable ID from title + source
 */
function generateId(title: string, source: string): string {
	const str = `${source}:${title}`.toLowerCase();
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0;
	}
	return `rss-${Math.abs(hash).toString(36)}`;
}

/**
 * Fetch RSS XML for a feed URL.
 * Tries local API proxy first (works in dev and with adapter-node),
 * falls back to CORS proxy for static builds.
 */
async function fetchRssXml(url: string): Promise<string> {
	// Try local API proxy first
	try {
		const proxyUrl = `/api/feeds?url=${encodeURIComponent(url)}`;
		const response = await fetch(proxyUrl);
		if (response.ok) {
			const text = await response.text();
			if (text && text.includes('<')) return text;
		}
	} catch {
		// Local proxy not available (static build) — fall through to CORS proxy
	}

	// Fallback: CORS proxy via ServiceClient
	return serviceClient.fetchWithProxy<string>(url);
}

/**
 * Fetch and parse a single RSS feed
 */
async function fetchFeed(feedSource: FeedSource, category: NewsCategory): Promise<FeedResult> {
	try {
		logger.log('RSS', `Fetching ${feedSource.name}: ${feedSource.url}`);

		const xml = await fetchRssXml(feedSource.url);
		const items = parseRssXml(xml, feedSource.name, category, feedSource.verification);

		logger.log('RSS', `${feedSource.name}: ${items.length} items`);
		return { items, feedName: feedSource.name };
	} catch (error) {
		const msg = `${feedSource.name}: ${(error as Error).message}`;
		logger.warn('RSS', msg);
		return { items: [], feedName: feedSource.name, error: msg };
	}
}

/**
 * Fetch all feeds for a given category
 */
export async function fetchCategory(category: NewsCategory): Promise<CategoryFetchResult> {
	const feeds = FEEDS[category].filter((f) => !f.broken);

	if (feeds.length === 0) {
		return { category, items: [], errors: [] };
	}

	// Fetch all feeds in the category concurrently
	const results = await Promise.allSettled(feeds.map((feed) => fetchFeed(feed, category)));

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

	// Sort by timestamp, newest first
	allItems.sort((a, b) => b.timestamp - a.timestamp);

	return { category, items: allItems, errors };
}

/**
 * Fetch all RSS categories
 */
export async function fetchAllFeeds(): Promise<CategoryFetchResult[]> {
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
