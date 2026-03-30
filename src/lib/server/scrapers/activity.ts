/**
 * Server-side activity scraper.
 * Ported from scripts/extract-activity-feeds.mjs — removes fs writes, exports scrapeActivity().
 */
import type { NewsItem } from '$lib/types';
import {
	stripHtml,
	excerpt,
	slugify,
	toIsoDate,
	safeFetch,
	fetchLastModified,
	parseXml,
	parseHtml,
	safeParse
} from './shared';

const MAX_PAST_DAYS = 300;
const MAX_FUTURE_DAYS = 400;
const ANNUAL_EVENT_STALENESS_DAYS = 180;

function getPacificsSeasonYear(now: number): number {
	const current = new Date(now);
	const year = current.getFullYear();
	return current.getMonth() >= 9 ? year + 1 : year;
}

function buildPacificsScheduleUrl(now: number): string {
	return `https://www.pacificsbaseball.com/pacifics.asp?page=11&team=801&year=${getPacificsSeasonYear(now)}`;
}

function inferSeasonSpanningYear(month: number, now: number): number {
	const current = new Date(now);
	const currentYear = current.getFullYear();
	const currentMonth = current.getMonth();
	if (month >= 8) {
		return currentMonth < 6 ? currentYear - 1 : currentYear;
	}
	return currentMonth >= 8 ? currentYear + 1 : currentYear;
}

function inferLikelyCalendarYear(dateText: string, now: number): number {
	const currentYear = new Date(now).getFullYear();
	const probe = new Date(`${dateText}, ${currentYear} 12:00:00 PST`);
	if (!Number.isFinite(probe.getTime())) return currentYear;
	return probe.getTime() < now - ANNUAL_EVENT_STALENESS_DAYS * 24 * 60 * 60 * 1000
		? currentYear + 1
		: currentYear;
}

function resolveAnnualMonthDay(
	dateText: string,
	now: number,
	timeSuffix: string
): Date | null {
	const year = inferLikelyCalendarYear(dateText, now);
	const resolved = new Date(`${dateText}, ${year} ${timeSuffix}`);
	return Number.isFinite(resolved.getTime()) ? resolved : null;
}

interface SourceConfig {
	source: string;
	url: string;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	topics?: string[];
	title?: string;
}

interface EventPageConfig {
	source: string;
	eventName: string;
	url: string;
	category: string;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	topics?: string[];
	datePatterns?: RegExp[];
	regPatterns?: RegExp[];
	regLinkPattern?: RegExp;
	fallbackDate?: string;
	description?: string;
	verification?: string;
}

const SHOW_SOURCES: SourceConfig[] = [
	{
		source: 'Sweetwater Music Hall',
		url: 'https://sweetwatermusichall.org/events/feed/',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.9059,
		lon: -122.5491
	},
	{
		source: 'Rancho Nicasio',
		url: 'https://ranchonicasio.com/events/feed/',
		town: 'Nicasio',
		townSlug: 'nicasio',
		lat: 38.0615,
		lon: -122.6983
	}
];

const FARM_MARKETS = [
	{
		title: 'Thursday Marin farmers market schedule',
		url: 'https://www.agriculturalinstitute.org/thursday-marin',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 38.0013,
		lon: -122.5378
	},
	{
		title: 'Sunday Marin farmers market schedule',
		url: 'https://www.agriculturalinstitute.org/sunday-marin',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 38.0013,
		lon: -122.5378
	},
	{
		title: 'Point Reyes farmers market schedule',
		url: 'https://www.agriculturalinstitute.org/point-reyes',
		town: 'Point Reyes Station',
		townSlug: 'point-reyes',
		lat: 38.0691,
		lon: -122.8069
	},
	{
		title: "Rollin' Root mobile market schedule",
		url: 'https://www.agriculturalinstitute.org/rollin-root'
	},
	{
		title: 'San Rafael Summer market schedule',
		url: 'https://www.agriculturalinstitute.org/san-rafael-summer-1',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9720,
		lon: -122.5227
	}
];

const FISHING_PAGES = [
	{
		title: 'Ocean sport fishing regulations',
		url: 'https://wildlife.ca.gov/Fishing/Ocean/Regulations'
	},
	{
		title: 'San Francisco ocean fishing map and regulations',
		url: 'https://wildlife.ca.gov/Fishing/Ocean/Regulations/Fishing-Map/SF'
	},
	{
		title: 'Ocean salmon sport fishing regulations',
		url: 'https://wildlife.ca.gov/Fishing/Ocean/Regulations/Salmon'
	},
	{
		title: 'Crab trap and season regulations',
		url: 'https://wildlife.ca.gov/Fishing/Ocean/Regulations/Crab'
	}
];

const PREP_HUBS: SourceConfig[] = [
	{
		source: 'Marin Catholic Athletics',
		title: 'Marin Catholic athletic calendar',
		url: 'https://www.marincatholic.org/athletics/athletic-calendar',
		town: 'Kentfield',
		townSlug: 'kentfield',
		lat: 37.9583,
		lon: -122.5511,
		topics: ['prep-sports', 'schedule']
	},
	{
		source: 'Archie Williams Athletics',
		title: 'Archie Williams athletics hub',
		url: 'https://archiewilliams.tamdistrict.org/athletics',
		town: 'San Anselmo',
		townSlug: 'san-anselmo',
		lat: 37.9833,
		lon: -122.5729,
		topics: ['prep-sports', 'schedule']
	},
	{
		source: 'San Rafael Athletics',
		title: 'San Rafael High athletics hub',
		url: 'https://sanrafael.srcs.org/athletics',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9716,
		lon: -122.5136,
		topics: ['prep-sports', 'schedule']
	},
	{
		source: 'Tamalpais Union High School District',
		title: 'TUHSD athletics hub',
		url: 'https://www.tamdistrict.org/students/athletics',
		lat: 37.9369,
		lon: -122.5253,
		topics: ['prep-sports', 'district']
	},
	{
		source: 'Archie Williams MTB',
		title: 'Archie Williams mountain bike team hub',
		url: 'https://www.awmtb.com/',
		town: 'San Anselmo',
		townSlug: 'san-anselmo',
		lat: 37.9833,
		lon: -122.5729,
		topics: ['prep-sports', 'mountain-bike']
	}
];

const SHOW_HUBS: SourceConfig[] = [
	{
		source: "Peri's Tavern",
		title: "Peri's Tavern music calendar",
		url: 'https://peristavern.com/music-calendar/',
		town: 'Fairfax',
		townSlug: 'fairfax',
		lat: 37.9895,
		lon: -122.5918,
		topics: ['music', 'shows']
	},
	{
		source: 'The Junction',
		title: 'The Junction music calendar',
		url: 'https://www.thejunc.com/music-calendar',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.8805,
		lon: -122.5234,
		topics: ['music', 'shows']
	},
	{
		source: 'HopMonk Novato',
		title: 'HopMonk Novato live music calendar',
		url: 'https://www.hopmonk.com/livemusic',
		town: 'Novato',
		townSlug: 'novato',
		lat: 38.0885,
		lon: -122.5535,
		topics: ['music', 'shows']
	},
	{
		source: "Smiley's Saloon",
		title: "Smiley's Saloon shows and supper club hub",
		url: 'https://smileyssaloon.com/',
		town: 'Bolinas',
		townSlug: 'bolinas',
		lat: 37.9096,
		lon: -122.6864,
		topics: ['music', 'west-marin']
	},
	{
		source: 'KWMR',
		title: 'KWMR events and tickets hub',
		url: 'https://kwmr.org/events',
		town: 'Point Reyes Station',
		townSlug: 'point-reyes',
		lat: 38.0690,
		lon: -122.8067,
		topics: ['music', 'community-events', 'west-marin']
	},
	{
		source: 'Sausalito Seahorse',
		title: 'Sausalito Seahorse calendar',
		url: 'https://www.sausalitoseahorse.com/calendar/',
		town: 'Sausalito',
		townSlug: 'sausalito',
		lat: 37.8686,
		lon: -122.4985,
		topics: ['music', 'shows']
	},
	{
		source: 'Marin Symphony',
		title: 'Marin Symphony tickets and events',
		url: 'https://marinsymphony.org/tickets-events/',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 38.0024,
		lon: -122.5336,
		topics: ['music', 'classical']
	},
	{
		source: 'Mill Valley Library',
		title: 'Mill Valley Library calendar',
		url: 'https://millvalleylibrary.gov/calendar.aspx',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.9064,
		lon: -122.5548,
		topics: ['community-events', 'library']
	},
	{
		source: 'Marin County Free Library',
		title: 'Marin County Free Library events',
		url: 'https://marinlibrary.bibliocommons.com/v2/events',
		lat: 37.9980,
		lon: -122.5307,
		topics: ['community-events', 'library']
	},
	{
		source: 'San Rafael Elks',
		title: 'San Rafael Elks Lodge calendar',
		url: 'https://www.elks1108.org/calendar',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9752,
		lon: -122.5290,
		topics: ['community-events', 'fraternal']
	}
];

const SHOW_EVENT_PAGES = [
	{
		source: 'Dance Palace',
		url: 'https://dancepalace.org/events/',
		town: 'Point Reyes Station',
		townSlug: 'point-reyes',
		lat: 38.0699,
		lon: -122.8089,
		topics: ['music', 'community-events', 'west-marin']
	},
	{
		source: 'Osher Marin JCC',
		url: 'https://www.marinjcc.org/events/',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9997,
		lon: -122.5231,
		topics: ['community-events', 'arts']
	},
	{
		source: 'Tourist Club',
		url: 'https://touristclubsf.org/calendar/',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.8992,
		lon: -122.5554,
		topics: ['community-events', 'club']
	}
];

const SPORTS_HUBS: SourceConfig[] = [
	{
		source: 'San Rafael Pacifics',
		title: 'San Rafael Pacifics schedule and tickets',
		url: buildPacificsScheduleUrl(Date.now()),
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9691,
		lon: -122.5286,
		topics: ['baseball', 'independent-ball']
	},
	{
		source: 'Marin Rowing Association',
		title: 'Marin Rowing Association calendar',
		url: 'https://www.marinrowing.org/calendar',
		town: 'Greenbrae',
		townSlug: 'greenbrae',
		lat: 37.9434,
		lon: -122.5171,
		topics: ['rowing', 'club-sports']
	},
	{
		source: 'Marin Highlanders Rugby',
		title: 'Marin Highlanders Rugby club hub',
		url: 'https://www.marinhighlandersrugby.org/',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9716,
		lon: -122.5136,
		topics: ['rugby', 'club-sports']
	}
];

const EVENT_PAGES: EventPageConfig[] = [
	{
		source: 'Marin Trail Stewards',
		eventName: 'Marinduro',
		url: 'https://marintrailstewards.org/marinduro',
		category: 'cycling',
		town: 'Fairfax',
		townSlug: 'fairfax',
		lat: 37.9871,
		lon: -122.5889,
		topics: ['cycling', 'enduro'],
		datePatterns: [/(\w+\s+\d{1,2},\s*\d{4})/i],
		regPatterns: [/bikereg\.com/i],
		regLinkPattern: /href="(https:\/\/www\.bikereg\.com\/[^"]+)"/i
	},
	{
		source: 'Inside Trail Racing',
		eventName: 'Marin Ultra Challenge',
		url: 'https://insidetrail.run/events/marin-ultra-challenge/',
		category: 'endurance',
		lat: 37.8305,
		lon: -122.5365,
		topics: ['running', 'ultra'],
		fallbackDate: resolveAnnualMonthDay('Mar 14', Date.now(), '08:00:00 PST')?.toISOString(),
		description: 'Official event page for the Marin Ultra Challenge at Rodeo Beach.'
	},
	{
		source: 'Miwok 100K',
		eventName: 'Miwok 100K',
		url: 'https://miwok100k.com/',
		category: 'endurance',
		lat: 37.8603,
		lon: -122.5364,
		topics: ['running', 'ultra'],
		verification: 'official',
		datePatterns: [/(\w+\s+\d{1,2},?\s*\d{4})/i],
		regPatterns: [/ultrasignup\.com/i, /registration/i]
	},
	{
		source: 'Quad Dipsea',
		eventName: 'Quad Dipsea',
		url: 'https://www.quad-dipsea.com/',
		category: 'endurance',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.9051,
		lon: -122.5530,
		topics: ['running', 'dipsea'],
		verification: 'official',
		datePatterns: [
			/(\w+day,?\s+\w+\s+\d{1,2},?\s*\d{4})/i,
			/(\w+\s+\d{1,2},?\s*\d{4})/i
		],
		regPatterns: [/ultrasignup\.com/i, /registration/i, /sign.?up/i]
	}
];

// --- Item builder ---

interface BuildItemParams {
	category: string;
	source: string;
	title: string;
	link: string;
	pubDate?: string | Date | unknown;
	description?: string;
	content?: string;
	verification?: string;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	topics?: string[];
}

function buildItem(
	params: BuildItemParams,
	now: number
): NewsItem | null {
	const {
		category,
		source,
		title,
		link,
		pubDate,
		description,
		content,
		verification = 'community',
		town,
		townSlug,
		lat,
		lon,
		topics = []
	} = params;

	const iso = toIsoDate(pubDate);
	const timestamp = new Date(iso).getTime();
	if (!Number.isFinite(timestamp)) return null;

	const deltaDays = (timestamp - now) / (1000 * 60 * 60 * 24);
	if (deltaDays < -MAX_PAST_DAYS || deltaDays > MAX_FUTURE_DAYS) return null;

	const hasCoords = typeof lat === 'number' && typeof lon === 'number';
	return {
		id: `${category}:${slugify(source)}:${slugify(title)}:${slugify(link)}`,
		title,
		link,
		pubDate: iso,
		timestamp,
		description: description ? excerpt(description) : undefined,
		content: content ? stripHtml(content) : undefined,
		source,
		category: category as NewsItem['category'],
		verification: verification as NewsItem['verification'],
		town,
		townSlug,
		lat: hasCoords ? lat : undefined,
		lon: hasCoords ? lon : undefined,
		locationConfidence: hasCoords ? 'exact' : townSlug ? 'town' : undefined,
		locationEvidence: hasCoords ? source : town ? town : undefined,
		topics
	};
}

// --- Helpers ---

function getTagText(element: Element, tagName: string): string {
	const nodes = element.getElementsByTagName(tagName);
	return nodes.length > 0 ? nodes[0].textContent || '' : '';
}

function flattenJsonLdEvents(node: unknown): Record<string, unknown>[] {
	if (!node) return [];
	if (Array.isArray(node)) return node.flatMap((entry) => flattenJsonLdEvents(entry));
	if (typeof node !== 'object') return [];
	const obj = node as Record<string, unknown>;
	if (obj['@type'] === 'Event') return [obj];
	if (Array.isArray(obj['@graph'])) return flattenJsonLdEvents(obj['@graph']);
	if (Array.isArray(obj['itemListElement'])) return flattenJsonLdEvents(obj['itemListElement']);
	if (obj['item']) return flattenJsonLdEvents(obj['item']);
	return [];
}

function buildEventTitle(eventName: string, dateInput: unknown, hasRegistration: boolean): string {
	const parts = [eventName];
	if (dateInput) {
		const d = new Date(dateInput as string);
		if (Number.isFinite(d.getTime())) {
			parts.push(
				d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
			);
		}
	}
	if (hasRegistration) parts.push('Registration open');
	return parts.join(' — ');
}

function inferTownFromText(text: string): { town?: string; townSlug?: string } {
	const lower = text.toLowerCase();
	if (lower.includes('novato')) return { town: 'Novato', townSlug: 'novato' };
	if (lower.includes('mill valley') || lower.includes('mt. tam') || lower.includes('mt tam')) {
		return { town: 'Mill Valley', townSlug: 'mill-valley' };
	}
	if (lower.includes('fairfax')) return { town: 'Fairfax', townSlug: 'fairfax' };
	if (lower.includes('san rafael')) return { town: 'San Rafael', townSlug: 'san-rafael' };
	if (lower.includes('point reyes')) {
		return { town: 'Point Reyes Station', townSlug: 'point-reyes' };
	}
	if (lower.includes('stinson')) return { town: 'Stinson Beach', townSlug: 'stinson-beach' };
	return {};
}

// --- Parsers ---

async function parseRssFeed(config: {
	source: string;
	url: string;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	category: string;
	topics?: string[];
}, now: number): Promise<NewsItem[]> {
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

async function parseAtomFeed(config: {
	source: string;
	url: string;
	category: string;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	topics?: string[];
}, now: number): Promise<NewsItem[]> {
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
			entry.querySelector('published')?.textContent ||
			entry.querySelector('updated')?.textContent;
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

async function parseJsonLdEventPage(
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
						(event.startDate as string) ||
						(event.endDate as string) ||
						new Date().toISOString(),
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

async function parseSinglePageItem(
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

async function parseEventPage(config: EventPageConfig, now: number): Promise<NewsItem[]> {
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

async function parseMacsEvents(now: number): Promise<NewsItem[]> {
	const html = await safeFetch('https://macsat19broadway.com/events/');
	const cards = [
		...html.matchAll(
			/<article class="event-card">[\s\S]*?<span class="event-date">([^<]+)<\/span>[\s\S]*?<h3 class="event-title">([\s\S]*?)<\/h3>[\s\S]*?<a href="([^"]+)"[\s\S]*?class="event-btn"/gi
		)
	];

	return cards
		.map((match) =>
			buildItem(
				{
					category: 'shows',
					source: "Mac's at 19 Broadway",
					title: stripHtml(match[2]),
					link: stripHtml(match[3]),
					pubDate: stripHtml(match[1]),
					description: 'Upcoming Fairfax show at Mac\'s at 19 Broadway.',
					content: 'Fairfax live music, comedy, and nightlife calendar.',
					verification: 'community',
					town: 'Fairfax',
					townSlug: 'fairfax',
					lat: 37.9871,
					lon: -122.5889,
					topics: ['music', 'shows']
				},
				now
			)
		)
		.filter((item): item is NewsItem => item !== null)
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(0, 10);
}

async function parseWebscorer(now: number): Promise<NewsItem[]> {
	const html = await safeFetch('https://www.webscorer.com/b17racing');
	const doc = parseHtml(html);
	const rows: NewsItem[] = [];
	for (const row of [...doc.querySelectorAll('tr')]) {
		const titleLink = row.querySelector('a[href^="/race?raceid="]');
		if (!titleLink) continue;
		const title =
			stripHtml(titleLink.textContent || '') ||
			stripHtml(titleLink.querySelector('img')?.getAttribute('alt') || '');
		const raceType = stripHtml(row.querySelector('.racetype')?.textContent || '');
		const date = stripHtml(
			row.querySelector('[id*="lbRaceDate"]')?.textContent || ''
		);
		const location = stripHtml(
			row.querySelector('[id*="lbRaceLocation"]')?.textContent || ''
		);
		const sport = stripHtml(
			row.querySelector('[id*="lbRaceSport"]')?.textContent || ''
		);
		const haystack = `${title} ${location} ${sport}`.toLowerCase();
		if (!/(stafford|novato|tam|mill valley|marin|fairfax|larkspur)/i.test(haystack)) continue;
		const link = new URL(
			titleLink.getAttribute('href') || '',
			'https://www.webscorer.com'
		).toString();
		const pubDate = `${date} 12:00:00 PST`;
		const townData = inferTownFromText(`${title} ${location}`);
		const category = /running/i.test(sport) ? 'endurance' : 'cycling';
		const item = buildItem(
			{
				category,
				source: 'B-17 / Webscorer',
				title: raceType ? `${title} — ${raceType}` : title,
				link,
				pubDate,
				description: `${location} · ${sport}`,
				content: `${location} ${sport}`,
				verification: 'community',
				town: townData.town,
				townSlug: townData.townSlug,
				topics:
					category === 'cycling'
						? ['cycling', 'race-results']
						: ['running', 'hill-climb']
			},
			now
		);
		if (item) rows.push(item);
	}
	return rows;
}

async function parseDipseaHome(now: number): Promise<NewsItem[]> {
	const html = await safeFetch('https://www.dipsea.org/');
	const matches = [
		...html.matchAll(
			/<b>([^<]+)<\/b>([\s\S]*?)<a href="(https:\/\/www\.dipsea\.org\/news\/[^"]+)"[\s\S]*?<span class='date'>Posted ([^<]+)<\/span>/gi
		)
	];
	const items: NewsItem[] = [];
	for (const match of matches.slice(0, 3)) {
		const [, rawTitle, rawBody, link, posted] = match;
		const item = buildItem(
			{
				category: 'endurance',
				source: 'Dipsea Race',
				title: stripHtml(rawTitle).replace(/:$/, ''),
				link,
				pubDate: posted,
				description: stripHtml(rawBody),
				content: stripHtml(rawBody),
				verification: 'official',
				town: 'Mill Valley',
				townSlug: 'mill-valley',
				lat: 37.906,
				lon: -122.5491,
				topics: ['running', 'trail-race']
			},
			now
		);
		if (item) items.push(item);
	}
	if (items.length > 0) return items;

	const fallbackDate = await fetchLastModified('https://www.dipsea.org/');
	const fallback = buildItem(
		{
			category: 'endurance',
			source: 'Dipsea Race',
			title: 'Dipsea race hub and season updates',
			link: 'https://www.dipsea.org/',
			pubDate: fallbackDate,
			description:
				'Official Dipsea race site for race information, entry details, and latest news.',
			verification: 'official',
			town: 'Mill Valley',
			townSlug: 'mill-valley',
			lat: 37.906,
			lon: -122.5491,
			topics: ['running', 'trail-race']
		},
		now
	);
	return fallback ? [fallback] : [];
}

async function parseRedwoodBarkSports(now: number): Promise<NewsItem[]> {
	return parseRssFeed(
		{
			source: 'Redwood Bark',
			url: 'https://redwoodbark.org/category/sports/feed/',
			category: 'prep',
			town: 'Larkspur',
			townSlug: 'larkspur',
			lat: 37.9341,
			lon: -122.5353,
			topics: ['prep-sports']
		},
		now
	);
}

async function parseNorcalRaces(now: number): Promise<NewsItem[]> {
	const html = await safeFetch('https://www.norcalmtb.org/races/');
	const doc = parseHtml(html);
	const items: NewsItem[] = [];

	// Parse the race schedule table — look for rows with race info
	// Each row typically has: Race Name/Location, Central/East Bay date, Redwood/Repack date
	const rows = [...doc.querySelectorAll('tr')];
	for (const row of rows) {
		const cells = [...row.querySelectorAll('td, th')];
		if (cells.length < 2) continue;

		const rowText = stripHtml(row.textContent || '');
		// Look for rows mentioning race numbers or venue names
		const raceMatch = rowText.match(
			/Race\s+(\d+)[:\s]*([^0-9]*?)(\d{1,2}\/\d{1,2})/i
		);
		if (!raceMatch) continue;

		const raceNum = raceMatch[1];
		const venueName = raceMatch[2].replace(/[,\s]+$/, '').trim() || `Race ${raceNum}`;

		// Extract all dates from the row — prefer later columns (Redwood/Repack league)
		const dateMatches = [...rowText.matchAll(/(\d{1,2})\/(\d{1,2})/g)];
		if (dateMatches.length === 0) continue;

			// Use the last date found (Redwood/Repack league column)
			const lastDate = dateMatches[dateMatches.length - 1];
			const month = parseInt(lastDate[1], 10);
			const day = parseInt(lastDate[2], 10);
			const year = inferSeasonSpanningYear(month, now);
			const raceDate = new Date(year, month - 1, day, 9, 0, 0);
			if (!Number.isFinite(raceDate.getTime())) continue;

		const townData = inferTownFromText(venueName);
		const isMarin = /stafford|novato|tam|fairfax|marin/i.test(venueName);

		const item = buildItem(
			{
				category: 'cycling',
				source: 'NorCal MTB League',
				title: `NorCal MTB Race ${raceNum}: ${venueName}`,
				link: 'https://www.norcalmtb.org/races/',
				pubDate: raceDate.toISOString(),
				description: `NorCal high school mountain bike league race at ${venueName}.`,
				verification: 'official',
				town: townData.town || (isMarin ? 'Novato' : undefined),
				townSlug: townData.townSlug || (isMarin ? 'novato' : undefined),
				lat: isMarin ? 38.1285 : undefined,
				lon: isMarin ? -122.6041 : undefined,
				topics: ['cycling', 'mtb', 'high-school']
			},
			now
		);
		if (item) items.push(item);
	}

	// Fallback: if table parsing found nothing, try the old regex approach
	if (items.length === 0) {
		const text = stripHtml(html);
		const match = text.match(/Race 4:\s*Stafford,?\s*Novato/i);
		if (match) {
			const item = buildItem(
				{
						category: 'cycling',
						source: 'NorCal MTB League',
						title: 'NorCal MTB Race 4: Stafford, Novato',
						link: 'https://www.norcalmtb.org/races/',
						pubDate: resolveAnnualMonthDay('Apr 25', now, '09:00:00 PST')?.toISOString(),
					description:
						'NorCal MTB race weekend at Stafford Lake with Novato on the league calendar.',
					verification: 'official',
					town: 'Novato',
					townSlug: 'novato',
					lat: 38.1285,
					lon: -122.6041,
					topics: ['cycling', 'mtb', 'high-school']
				},
				now
			);
			if (item) items.push(item);
		}
	}

	return items;
}

async function parsePacificsSchedule(now: number): Promise<NewsItem[]> {
	const scheduleUrl = buildPacificsScheduleUrl(now);
	try {
		const html = await safeFetch(scheduleUrl);
		const items: NewsItem[] = [];
		const doc = parseHtml(html);

		// Parse calendar table cells — bgcolor indicates home (acd8ef) vs away (c0c0c0/5a007c)
		const cells = [...doc.querySelectorAll('td')];
		for (const cell of cells) {
			const bg = (cell.getAttribute('bgcolor') || '').replace('#', '').toLowerCase();
			const isHome = bg === 'acd8ef';
			const isAway = bg === 'c0c0c0' || bg === '5a007c';
			if (!isHome && !isAway) continue;

			// Extract date/time from <small> tag: MM/DD/YYYY&nbsp;H:MMPM
			const small = cell.querySelector('small');
			if (!small) continue;
			const dateText = (small.textContent || '').replace(/\s+/g, ' ').trim();
			const dateMatch = dateText.match(
				/(\d{1,2}\/\d{1,2}\/\d{4})\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i
			);
			if (!dateMatch) continue;

			const gameDate = new Date(`${dateMatch[1]} ${dateMatch[2]}`);
			if (!Number.isFinite(gameDate.getTime())) continue;

			// Extract event link if present
			const eventLink = cell.querySelector('a[href*="eventid="]');
			const eventUrl = eventLink
				? new URL(
						eventLink.getAttribute('href') || '',
						'https://www.pacificsbaseball.com'
					).toString()
				: scheduleUrl;

			const dayStr = gameDate.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			});
			const timeStr = gameDate.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit'
			});
			const label = isHome ? 'Pacifics Home Game' : 'Pacifics Away Game';
			const title = `${label} · ${dayStr}, ${timeStr}`;

			const item = buildItem(
				{
					category: 'prep',
					source: 'San Rafael Pacifics',
					title,
					link: eventUrl,
					pubDate: gameDate.toISOString(),
					description: isHome
						? `San Rafael Pacifics home game at Albert Park. ${timeStr} first pitch.`
						: `San Rafael Pacifics away game. ${timeStr} first pitch.`,
					verification: 'community',
					town: 'San Rafael',
					townSlug: 'san-rafael',
					lat: 37.9697,
					lon: -122.5117,
					topics: ['baseball', 'independent-ball']
				},
				now
			);
			if (item) items.push(item);
		}

		if (items.length > 0) {
			return items
				.sort((a, b) => a.timestamp - b.timestamp)
				.slice(0, 20);
		}
	} catch {
		// Fall through to hub fallback
	}

	const pacificsHub = SPORTS_HUBS.find((h) => h.source === 'San Rafael Pacifics');
	if (!pacificsHub) return [];
	return parseSinglePageItem(
		{
			source: pacificsHub.source,
			category: 'prep',
			title: pacificsHub.title || 'San Rafael Pacifics schedule',
			url: pacificsHub.url,
			description:
				'Local sports hub for schedules, fixtures, club updates, or season information.',
			verification: 'community',
			town: pacificsHub.town,
			townSlug: pacificsHub.townSlug,
			topics: pacificsHub.topics
		},
		now
	);
}

async function parseMarinRowingCalendar(now: number): Promise<NewsItem[]> {
	try {
		const json = await safeFetch('https://www.marinrowing.org/calendar?format=json');
		const data = JSON.parse(json) as Record<string, unknown>;
		const mainContent = (data.mainContent as string) || '';
		if (!mainContent) return [];

		const items: NewsItem[] = [];
		// Extract events from <strong>DATE</strong> EVENT_NAME patterns
		const eventPattern =
			/<strong>\s*((?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+)?(\w+\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?(?:,?\s*\d{4})?)\s*<\/strong>\s*([^<]+)/gi;
		let match;
		while ((match = eventPattern.exec(mainContent)) !== null) {
			const rawDate = match[2].trim();
			const eventName = stripHtml(match[3]).trim();
			if (!eventName || eventName.length < 3) continue;

			// Parse the date — add current year if not present
			let dateStr = rawDate;
			if (!/\d{4}/.test(dateStr)) {
				dateStr += `, ${inferLikelyCalendarYear(dateStr, now)}`;
			}
			// Handle date ranges like "March 26-29" — use the first date
			dateStr = dateStr.replace(/\s*[-–]\s*\d{1,2}/, '');
			const eventDate = new Date(`${dateStr} 08:00:00 PST`);
			if (!Number.isFinite(eventDate.getTime())) continue;

			const item = buildItem(
				{
					category: 'outdoors',
					source: 'Marin Rowing Association',
					title: eventName,
					link: 'https://www.marinrowing.org/calendar',
					pubDate: eventDate.toISOString(),
					description: `Marin Rowing Association event: ${eventName}.`,
					verification: 'community',
					town: 'Greenbrae',
					townSlug: 'greenbrae',
					lat: 37.9398,
					lon: -122.5283,
					topics: ['rowing', 'regatta']
				},
				now
			);
			if (item) items.push(item);
		}

		return items
			.sort((a, b) => a.timestamp - b.timestamp)
			.slice(0, 15);
	} catch {
		return [];
	}
}

async function parseB17Racing(now: number): Promise<NewsItem[]> {
	try {
		const html = await safeFetch('https://b17racing.com');
		const items: NewsItem[] = [];
		const text = stripHtml(html);

		// Summit Shorty Series — Wednesday evenings at Camp Tamarancho, Fairfax
			const shortyDates = text.match(
				/Summit\s+Shorty[^.]*?(?:March|April|May|June|July|August)[\s\S]*?(?=Crusher|$)/i
			);
			if (shortyDates) {
				const datePattern =
					/((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})/gi;
				let dateMatch;
				while ((dateMatch = datePattern.exec(shortyDates[0])) !== null) {
					const raceDate = resolveAnnualMonthDay(dateMatch[1], now, '18:00:00 PST');
					if (!raceDate || !Number.isFinite(raceDate.getTime())) continue;

					const dayStr = raceDate.toLocaleDateString('en-US', {
						weekday: 'short',
					month: 'short',
					day: 'numeric'
				});

				const item = buildItem(
					{
						category: 'cycling',
						source: 'B-17 Racing',
						title: `Summit Shorty Series · ${dayStr}`,
						link: 'https://b17racing.com',
						pubDate: raceDate.toISOString(),
						description:
							'Wednesday evening XC race at Camp Tamarancho, Fairfax.',
						verification: 'community',
						town: 'Fairfax',
						townSlug: 'fairfax',
						lat: 37.9895,
						lon: -122.5918,
						topics: ['cycling', 'mtb', 'racing']
					},
					now
					);
					if (item) items.push(item);
				}
			}

		// Crusher Cup XCO series
			const crusherDates = text.match(
				/Crusher\s+Cup[^.]*?(?:March|April|May|June|July|August)[\s\S]*?(?=Summit|$)/i
			);
			if (crusherDates) {
				const datePattern =
					/((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})/gi;
				let dateMatch;
				while ((dateMatch = datePattern.exec(crusherDates[0])) !== null) {
					const raceDate = resolveAnnualMonthDay(dateMatch[1], now, '09:00:00 PST');
					if (!raceDate || !Number.isFinite(raceDate.getTime())) continue;

					const dayStr = raceDate.toLocaleDateString('en-US', {
						weekday: 'short',
					month: 'short',
					day: 'numeric'
				});

				const item = buildItem(
					{
						category: 'cycling',
						source: 'B-17 Racing',
						title: `Crusher Cup XCO · ${dayStr}`,
						link: 'https://b17racing.com',
						pubDate: raceDate.toISOString(),
						description: 'Crusher Cup XCO race series in Marin County.',
						verification: 'community',
						town: 'Fairfax',
						townSlug: 'fairfax',
						lat: 37.9895,
						lon: -122.5918,
						topics: ['cycling', 'mtb', 'racing']
					},
					now
				);
				if (item) items.push(item);
			}
		}

		return items
			.sort((a, b) => a.timestamp - b.timestamp)
			.slice(0, 15);
	} catch {
		return [];
	}
}

function getDipseaRaceDate(year: number): Date {
	// Dipsea is always the second Sunday in June
	const june1 = new Date(year, 5, 1); // June 1
	const dayOfWeek = june1.getDay(); // 0 = Sunday
	const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
	const secondSunday = 1 + daysToSunday + 7;
	return new Date(year, 5, secondSunday, 7, 30, 0); // 7:30 AM start
}

async function parseDipseaRaceDate(now: number): Promise<NewsItem[]> {
	const currentYear = new Date(now).getFullYear();
	const items: NewsItem[] = [];

	// Check current year and next year
	for (const year of [currentYear, currentYear + 1]) {
		const raceDate = getDipseaRaceDate(year);
		const dayStr = raceDate.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
		const item = buildItem(
			{
				category: 'endurance',
				source: 'Dipsea Race',
				title: `Dipsea Race ${year} · ${dayStr}`,
				link: 'https://www.dipsea.org/',
				pubDate: raceDate.toISOString(),
				description:
					'The Dipsea Race: oldest trail race in America. Mill Valley to Stinson Beach, 7.4 miles over Mt. Tamalpais.',
				verification: 'official',
				town: 'Mill Valley',
				townSlug: 'mill-valley',
				lat: 37.906,
				lon: -122.5491,
				topics: ['running', 'dipsea', 'trail']
			},
			now
		);
		if (item) items.push(item);
	}

	return items;
}

async function parseShowsHubs(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];

	items.push(...(await parseMacsEvents(now)));

	for (const page of SHOW_EVENT_PAGES) {
		items.push(
			...(await parseJsonLdEventPage(
				{
					source: page.source,
					url: page.url,
					category: 'shows',
					town: page.town,
					townSlug: page.townSlug,
					lat: page.lat,
					lon: page.lon,
					verification: 'community',
					topics: page.topics
				},
				now
			))
		);
	}

	for (const hub of SHOW_HUBS) {
		items.push(
			...(await parseSinglePageItem(
				{
					source: hub.source,
					category: 'shows',
					title: hub.title || `${hub.source} calendar`,
					url: hub.url,
					description:
						'Curated Marin venue or community calendar worth checking directly.',
					verification: 'community',
					town: hub.town,
					townSlug: hub.townSlug,
					lat: hub.lat,
					lon: hub.lon,
					topics: hub.topics
				},
				now
			))
		);
	}

	return items;
}

async function parseSportsHubs(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];

	items.push(...(await safeParse('Pacifics schedule', () => parsePacificsSchedule(now))));

	for (const hub of SPORTS_HUBS) {
		if (hub.source === 'San Rafael Pacifics') continue;
		items.push(
			...(await parseSinglePageItem(
				{
					source: hub.source,
					category: 'prep',
					title: hub.title || `${hub.source} hub`,
					url: hub.url,
					description:
						'Local sports hub for schedules, fixtures, club updates, or season information.',
					verification: 'community',
					town: hub.town,
					townSlug: hub.townSlug,
					lat: hub.lat,
					lon: hub.lon,
					topics: hub.topics
				},
				now
			))
		);
	}

	return items;
}

async function parsePrepHubs(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];
	for (const hub of PREP_HUBS) {
		items.push(
			...(await parseSinglePageItem(
				{
					source: hub.source,
					category: 'prep',
					title: hub.title || `${hub.source} hub`,
					url: hub.url,
					description:
						'Official athletics or team hub for a Marin-area school or league program.',
					verification: 'official',
					town: hub.town,
					townSlug: hub.townSlug,
					lat: hub.lat,
					lon: hub.lon,
					topics: hub.topics
				},
				now
			))
		);
	}
	return items;
}

async function scrapeFarmMarketSchedule(
	market: (typeof FARM_MARKETS)[number]
): Promise<{ title: string; description: string }> {
	try {
		const html = await safeFetch(market.url);
		const text = stripHtml(html);

		const dayMatch = text.match(
			/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i
		);
		const timeMatch = text.match(
			/(\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))/i
		);
		const seasonMatch = text.match(
			/((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\s*[-–—]+\s*(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4})/i
		);
		const locationMatch = text.match(
			/(?:at|location:?)\s+([^.!?\n]{5,60}(?:center|barn|street|plaza|downtown|fourth|civic))/i
		);
		const yearRoundMatch = /rain or shine|year[\s-]?round/i.test(text);

		const parts: string[] = [];
		if (dayMatch) parts.push(dayMatch[0]);
		if (timeMatch) parts.push(timeMatch[1].replace(/\s+/g, ' ').trim());
		if (seasonMatch) parts.push(seasonMatch[1]);
		else if (yearRoundMatch) parts.push('Year-round');

		let location = market.town || '';
		if (locationMatch) location = locationMatch[1].trim();

		const title =
			parts.length > 0
				? `${market.title.replace(/ schedule$/, '')} · ${parts.join(', ')}`
				: market.title;

		const desc =
			parts.length > 0
				? `${parts.join(' · ')}${location ? ` at ${location}` : ''}`
				: 'Official market schedule from the Agricultural Institute of Marin.';

		return { title, description: desc };
	} catch {
		return {
			title: market.title,
			description: 'Official market schedule from the Agricultural Institute of Marin.'
		};
	}
}

async function parseFarmMarkets(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];
	for (const market of FARM_MARKETS) {
		const scraped = await scrapeFarmMarketSchedule(market);
		items.push(
			...(await parseSinglePageItem(
				{
					source: 'Agricultural Institute of Marin',
					category: 'farm',
					title: scraped.title,
					url: market.url,
					description: scraped.description,
					verification: 'official',
					town: market.town,
					townSlug: market.townSlug,
					lat: market.lat,
					lon: market.lon,
					topics: ['farmers-market', 'produce']
				},
				now
			))
		);
	}
	return items;
}

async function parsePointReyesCheese(now: number): Promise<NewsItem[]> {
	const entries = await parseAtomFeed(
		{
			source: 'Point Reyes Farmstead Cheese',
			url: 'https://www.pointreyescheese.com/blogs/news.atom',
			category: 'farm',
			town: 'Point Reyes Station',
			townSlug: 'point-reyes',
			lat: 38.0764,
			lon: -122.8012,
			topics: ['cheese', 'farm-market']
		},
		now
	);
	if (entries.length > 0) return entries;
	return parseSinglePageItem(
		{
			source: 'Point Reyes Farmstead Cheese',
			category: 'farm',
			title: 'Point Reyes Farmstead Cheese journal',
			url: 'https://www.pointreyescheese.com/blogs/news',
			description:
				'Official Point Reyes Farmstead Cheese news and seasonal product updates.',
			verification: 'official',
			town: 'Point Reyes Station',
			townSlug: 'point-reyes',
			lat: 38.0764,
			lon: -122.8012,
			topics: ['cheese', 'farm-market']
		},
		now
	);
}

async function parseFishingPages(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];
	for (const page of FISHING_PAGES) {
		items.push(
			...(await parseSinglePageItem(
				{
					source: 'California Department of Fish & Wildlife',
					category: 'outdoors',
					title: page.title,
					url: page.url,
					description:
						'Official California fishing regulations and season information relevant to the Marin / SF coast.',
					verification: 'official',
					topics: ['fishing', 'regulations']
				},
				now
			))
		);
	}
	return items;
}

async function parseFilteredFeedCategory(
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
		const haystack =
			`${item.title} ${item.description || ''} ${item.content || ''}`.toLowerCase();
		return config.keywords.some((keyword) => haystack.includes(keyword));
	});
}

// --- Main export ---

export async function scrapeActivity(): Promise<NewsItem[]> {
	const now = Date.now();
	const collected: NewsItem[] = [];

	// RSS show sources
	for (const source of SHOW_SOURCES) {
		collected.push(
			...(await safeParse(`RSS ${source.source}`, () =>
				parseRssFeed(
					{ ...source, category: 'shows', topics: ['music', 'shows'] },
					now
				)
			))
		);
	}

	collected.push(...(await safeParse('Shows hubs', () => parseShowsHubs(now))));
	collected.push(...(await safeParse('Webscorer', () => parseWebscorer(now))));

	for (const eventConfig of EVENT_PAGES) {
		collected.push(
			...(await safeParse(`Event: ${eventConfig.eventName}`, () =>
				parseEventPage(eventConfig, now)
			))
		);
	}

	collected.push(...(await safeParse('Dipsea', () => parseDipseaHome(now))));
	collected.push(...(await safeParse('Dipsea race date', () => parseDipseaRaceDate(now))));
	collected.push(...(await safeParse('Marin Rowing', () => parseMarinRowingCalendar(now))));
	collected.push(...(await safeParse('B-17 Racing', () => parseB17Racing(now))));
	collected.push(...(await safeParse('Redwood Bark', () => parseRedwoodBarkSports(now))));
	collected.push(...(await safeParse('NorCal MTB', () => parseNorcalRaces(now))));
	collected.push(...(await safeParse('Prep hubs', () => parsePrepHubs(now))));
	collected.push(...(await safeParse('Sports hubs', () => parseSportsHubs(now))));
	collected.push(...(await safeParse('Farm markets', () => parseFarmMarkets(now))));
	collected.push(...(await safeParse('Pt Reyes Cheese', () => parsePointReyesCheese(now))));
	collected.push(...(await safeParse('Fishing pages', () => parseFishingPages(now))));

	// Fishing: Point Reyes Light
	collected.push(
		...(await safeParse('Pt Reyes Light fishing', () =>
			parseFilteredFeedCategory(
				{
					url: 'https://www.ptreyeslight.com/feed/',
					source: 'Point Reyes Light',
					category: 'outdoors',
					keywords: [
						'fish', 'fishing', 'salmon', 'crab', 'oyster', 'dungeness', 'halibut',
						'rockfish', 'herring', 'squid', 'mackerel', 'mussels', 'clam', 'abalone',
						'striped bass', 'sturgeon', 'steelhead', 'trout', 'albacore'
					],
					topics: ['fishing', 'west-marin']
				},
				now
			)
		))
	);

	// Fishing: Marin IJ
	collected.push(
		...(await safeParse('Marin IJ fishing', () =>
			parseFilteredFeedCategory(
				{
					url: 'https://www.marinij.com/feed/',
					source: 'Marin Independent Journal',
					category: 'outdoors',
					keywords: [
						'fishing', 'salmon', 'crab', 'dungeness', 'oyster', 'halibut',
						'fish stock', 'trawl', 'commercial fishing', 'shellfish', 'aquaculture'
					],
					topics: ['fishing', 'local-news']
				},
				now
			)
		))
	);

	// Farm: Marin Magazine
	collected.push(
		...(await safeParse('Marin Magazine farm', () =>
			parseFilteredFeedCategory(
				{
					url: 'https://marinmagazine.com/feed/',
					source: 'Marin Magazine',
					category: 'farm',
					keywords: [
						'farmers market', 'market', 'cheese', 'creamery', 'produce', 'wine',
						'beer', 'brewery'
					],
					topics: ['farmers-market', 'food-drink']
				},
				now
			)
		))
	);

	// --- Dedupe ---

	// Stage 1: Link-based dedupe
	const linkDeduped: NewsItem[] = [];
	const seenLinks = new Set<string>();
	for (const item of collected.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp)) {
		const normalizedLink = item.link.replace(/-\d+(\/|$)/, '$1');
		const key = `${item.category}:${normalizedLink}`;
		if (seenLinks.has(key)) continue;
		seenLinks.add(key);
		linkDeduped.push(item);
	}

	// Stage 2: Title-based dedupe for recurring events
	const titleGroups = new Map<string, NewsItem[]>();
	for (const item of linkDeduped) {
		const normTitle = item.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
		const groupKey = `${item.category}:${item.source}:${normTitle}`;
		if (!titleGroups.has(groupKey)) titleGroups.set(groupKey, []);
		titleGroups.get(groupKey)!.push(item);
	}

	const deduped: NewsItem[] = [];
	for (const [, group] of titleGroups) {
		if (group.length === 1) {
			deduped.push(group[0]);
			continue;
		}
		group.sort((a, b) => a.timestamp - b.timestamp);
		const nextUpcoming = group.find((item) => item.timestamp >= now);
		deduped.push(nextUpcoming || group[group.length - 1]);
	}

	deduped.sort((a, b) => b.timestamp - a.timestamp);
	return deduped;
}
