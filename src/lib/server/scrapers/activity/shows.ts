/**
 * Shows & music venue scrapers.
 * Covers: RSS show feeds (Sweetwater, Rancho Nicasio), Mac's at 19 Broadway,
 * JSON-LD event pages (Dance Palace, JCC, Tourist Club), and show hub pages.
 */
import type { NewsItem } from '$lib/types';
import { stripHtml, safeFetch } from '../shared';
import type { SourceConfig } from './types';
import { buildItem } from './helpers';
import { venueOfSource } from '$lib/config/venues';
import { parseRssFeed, parseJsonLdEventPage, parseSinglePageItem } from './parsers';

/** A reviewed venue's calendar fields: its town and its own building's point. */
function atVenue(source: string) {
	const v = venueOfSource(source);
	return { source, town: v.town, townSlug: v.townSlug, lat: v.lat, lon: v.lon, venueId: v.id };
}

const SHOW_SOURCES = [
	// Sweetwater's pubDate is the post's update time, not the show's: no start (NEWSPIN1).
	{ ...atVenue('Sweetwater Music Hall'), url: 'https://sweetwatermusichall.org/events/feed/' },
	{
		...atVenue('Rancho Nicasio'),
		url: 'https://ranchonicasio.com/events/feed/',
		pubDateIsShowDay: true
	}
];

const SHOW_EVENT_PAGES = [
	{
		...atVenue('Dance Palace'),
		url: 'https://dancepalace.org/events/',
		topics: ['music', 'community-events', 'west-marin']
	},
	{
		...atVenue('Osher Marin JCC'),
		url: 'https://www.marinjcc.org/events/',
		topics: ['community-events', 'arts']
	},
	{
		...atVenue('Tourist Club'),
		url: 'https://touristclubsf.org/calendar/',
		topics: ['community-events', 'club']
	}
];

/** Hub pages: a calendar to check directly, dated by fetch; not venues (no start, no venue). */
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
		lat: 38.069,
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
		lat: 37.998,
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
		lon: -122.529,
		topics: ['community-events', 'fraternal']
	}
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A card's "WEDNESDAY, OCT 14, 2026" as that calendar day; no time of day is claimed. */
function cardDay(text: string): Pick<NewsItem, 'startSource' | 'startDay'> {
	const m = text.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})\b/i);
	const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
	if (!m || month < 0) return {};
	const day = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
	return { startSource: 'calendar', startDay: day };
}

export async function parseMacsEvents(now: number): Promise<NewsItem[]> {
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
					title: stripHtml(match[2]),
					link: stripHtml(match[3]),
					pubDate: stripHtml(match[1]),
					description: "Upcoming Fairfax show at Mac's at 19 Broadway.",
					content: 'Fairfax live music, comedy, and nightlife calendar.',
					verification: 'community',
					...atVenue("Mac's at 19 Broadway"),
					topics: ['music', 'shows'],
					...cardDay(stripHtml(match[1]))
				},
				now
			)
		)
		.filter((item): item is NewsItem => item !== null)
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(0, 10);
}

export async function scrapeShowRssFeeds(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];
	for (const source of SHOW_SOURCES) {
		items.push(
			...(await parseRssFeed({ ...source, category: 'shows', topics: ['music', 'shows'] }, now))
		);
	}
	return items;
}

export async function scrapeShowsHubs(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];

	items.push(...(await parseMacsEvents(now)));

	for (const page of SHOW_EVENT_PAGES) {
		items.push(
			...(await parseJsonLdEventPage(
				{ ...page, category: 'shows', verification: 'community' },
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
					description: 'Curated Marin venue or community calendar worth checking directly.',
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
