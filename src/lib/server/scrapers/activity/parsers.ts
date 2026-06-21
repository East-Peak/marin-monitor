/**
 * Generic feed/page parsers used by multiple activity scraper sub-modules.
 * These handle RSS, Atom, JSON-LD, single-page, and event-page patterns.
 */
import type { NewsItem } from '$lib/types';
import { stripHtml, safeFetch, fetchLastModified, parseXml } from '../shared';
import type { EventPageConfig } from './types';
import { buildItem, getTagText, flattenJsonLdEvents, buildEventTitle } from './helpers';

export async function parseRssFeed(
	config: {
		source: string;
		url: string;
		town?: string;
		townSlug?: string;
		lat?: number;
		lon?: number;
		category: string;
		topics?: string[];
	},
	now: number
): Promise<NewsItem[]> {
	const xml = await safeFetch(config.url);
	const doc = parseXml(xml);
	const items: NewsItem[] = [];
	for (const item of [...doc.querySelectorAll('item')]) {
		const title = stripHtml(getTagText(item, 'title'));
		const link = stripHtml(getTagText(item, 'link'));
		const pubDate = getTagText(item, 'pubDate');
		const description = getTagText(item, 'description');
		const content = getTagText(item, 'content:encoded') || description;
		const newsItem = buildItem(
			{
				category: config.category,
				source: config.source,
				title,
				link,
				pubDate,
				description,
				content,
				verification: 'community',
				town: config.town,
				townSlug: config.townSlug,
				lat: config.lat,
				lon: config.lon,
				topics: config.topics
			},
			now
		);
		if (newsItem) items.push(newsItem);
	}
	return items;
}

export async function parseAtomFeed(
	config: {
		source: string;
		url: string;
		category: string;
		town?: string;
		townSlug?: string;
		lat?: number;
		lon?: number;
		topics?: string[];
	},
	now: number
): Promise<NewsItem[]> {
	const xml = await safeFetch(config.url);
	const doc = parseXml(xml);
	const items: NewsItem[] = [];
	for (const entry of [...doc.querySelectorAll('entry')]) {
		const title = stripHtml(entry.querySelector('title')?.textContent || '');
		const link =
			entry.querySelector('link[rel="alternate"]')?.getAttribute('href') ||
			entry.querySelector('link')?.getAttribute('href') ||
			'';
		const pubDate =
			entry.querySelector('published')?.textContent || entry.querySelector('updated')?.textContent;
		const description =
			entry.querySelector('summary')?.textContent ||
			entry.querySelector('content')?.textContent ||
			'';
		const content = entry.querySelector('content')?.textContent || description;
		const newsItem = buildItem(
			{
				category: config.category,
				source: config.source,
				title,
				link,
				pubDate,
				description,
				content,
				verification: 'official',
				town: config.town,
				townSlug: config.townSlug,
				lat: config.lat,
				lon: config.lon,
				topics: config.topics
			},
			now
		);
		if (newsItem) items.push(newsItem);
	}
	return items;
}

export async function parseJsonLdEventPage(
	config: {
		source: string;
		url: string;
		category: string;
		town?: string;
		townSlug?: string;
		lat?: number;
		lon?: number;
		verification?: string;
		topics?: string[];
		limit?: number;
	},
	now: number
): Promise<NewsItem[]> {
	const html = await safeFetch(config.url);
	const scripts = [
		...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
	];
	const events: Record<string, unknown>[] = [];
	for (const match of scripts) {
		try {
			const parsed = JSON.parse(match[1].trim());
			events.push(...flattenJsonLdEvents(parsed));
		} catch {
			// skip malformed
		}
	}

	const limit = config.limit ?? 10;
	return events
		.map((event) =>
			buildItem(
				{
					category: config.category,
					source: config.source,
					title: stripHtml((event.name as string) || 'Upcoming event'),
					link: (event.url as string) || config.url,
					pubDate:
						(event.startDate as string) || (event.endDate as string) || new Date().toISOString(),
					description: stripHtml((event.description as string) || ''),
					content: stripHtml(
						[
							(event.location as Record<string, unknown>)?.name,
							(event.organizer as Record<string, unknown>)?.name,
							event.eventAttendanceMode,
							event.eventStatus
						]
							.filter(Boolean)
							.join(' · ') as string
					),
					verification: config.verification || 'community',
					town: config.town,
					townSlug: config.townSlug,
					lat: config.lat,
					lon: config.lon,
					topics: config.topics
				},
				now
			)
		)
		.filter((item): item is NewsItem => item !== null)
		.filter((item) => item.timestamp >= now - 24 * 60 * 60 * 1000)
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(0, limit);
}

export async function parseSinglePageItem(
	config: {
		source: string;
		category: string;
		title: string;
		url: string;
		description: string;
		town?: string;
		townSlug?: string;
		lat?: number;
		lon?: number;
		verification?: string;
		topics?: string[];
		pubDate?: string;
	},
	now: number
): Promise<NewsItem[]> {
	const effectivePubDate = config.pubDate ?? (await fetchLastModified(config.url));
	const item = buildItem(
		{
			category: config.category,
			source: config.source,
			title: config.title,
			link: config.url,
			pubDate: effectivePubDate,
			description: config.description,
			verification: config.verification || 'community',
			town: config.town,
			townSlug: config.townSlug,
			lat: config.lat,
			lon: config.lon,
			topics: config.topics
		},
		now
	);
	return item ? [item] : [];
}

export async function parseEventPage(config: EventPageConfig, now: number): Promise<NewsItem[]> {
	const {
		source,
		eventName,
		url,
		category,
		town,
		townSlug,
		lat,
		lon,
		topics = [],
		datePatterns = [],
		regPatterns = [],
		regLinkPattern,
		fallbackDate,
		description: staticDesc,
		verification = 'community'
	} = config;

	let html: string;
	try {
		html = await safeFetch(url);
	} catch {
		if (fallbackDate || staticDesc) {
			const item = buildItem(
				{
					category,
					source,
					title: buildEventTitle(eventName, fallbackDate, false),
					link: url,
					pubDate: fallbackDate,
					description: staticDesc || `Official ${eventName} event page.`,
					verification,
					town,
					townSlug,
					lat,
					lon,
					topics
				},
				now
			);
			return item ? [item] : [];
		}
		return [];
	}

	// Try JSON-LD first
	const jsonLdScripts = [
		...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
	];
	for (const match of jsonLdScripts) {
		try {
			const parsed = JSON.parse(match[1].trim());
			const events = flattenJsonLdEvents(parsed);
			if (events.length > 0) {
				const event = events[0];
				const hasReg = regPatterns.some((p) => p.test(html));
				const item = buildItem(
					{
						category,
						source,
						title: buildEventTitle(eventName, event.startDate, hasReg),
						link: (event.url as string) || url,
						pubDate: (event.startDate as string) || (event.endDate as string),
						description: stripHtml((event.description as string) || '') || staticDesc,
						verification,
						town,
						townSlug,
						lat,
						lon,
						topics
					},
					now
				);
				return item ? [item] : [];
			}
		} catch {
			// malformed JSON-LD
		}
	}

	// Regex fallback
	const pageText = stripHtml(html);
	let extractedDate = fallbackDate;
	for (const pattern of datePatterns) {
		const m = pageText.match(pattern);
		if (m) {
			const parsed = new Date(m[1]);
			if (Number.isFinite(parsed.getTime())) {
				extractedDate = m[1];
				break;
			}
		}
	}

	const hasReg = regPatterns.some((p) => p.test(html));
	let link = url;
	if (regLinkPattern) {
		const linkMatch = html.match(regLinkPattern);
		if (linkMatch) link = linkMatch[1];
	}

	const item = buildItem(
		{
			category,
			source,
			title: buildEventTitle(eventName, extractedDate, hasReg),
			link,
			pubDate: extractedDate,
			description: staticDesc || `Official ${eventName} event page.`,
			verification,
			town,
			townSlug,
			lat,
			lon,
			topics
		},
		now
	);
	return item ? [item] : [];
}

export async function parseFilteredFeedCategory(
	config: {
		url: string;
		source: string;
		category: string;
		town?: string;
		townSlug?: string;
		keywords: string[];
		topics?: string[];
	},
	now: number
): Promise<NewsItem[]> {
	const items = await parseRssFeed(
		{
			source: config.source,
			url: config.url,
			category: config.category,
			town: config.town,
			townSlug: config.townSlug,
			topics: config.topics
		},
		now
	);
	return items.filter((item) => {
		const haystack = `${item.title} ${item.description || ''} ${item.content || ''}`.toLowerCase();
		return config.keywords.some((keyword) => haystack.includes(keyword));
	});
}
