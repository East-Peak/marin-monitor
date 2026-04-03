/**
 * Shows & music venue scrapers.
 * Covers: RSS show feeds (Sweetwater, Rancho Nicasio), Mac's at 19 Broadway,
 * JSON-LD event pages (Dance Palace, JCC, Tourist Club), and show hub pages.
 */
import type { NewsItem } from '$lib/types';
import { stripHtml, safeFetch } from '../shared';
import type { SourceConfig } from './types';
import { buildItem } from './helpers';
import { parseRssFeed, parseJsonLdEventPage, parseSinglePageItem } from './parsers';

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

export async function scrapeShowRssFeeds(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];
	for (const source of SHOW_SOURCES) {
		items.push(
			...(await parseRssFeed(
				{ ...source, category: 'shows', topics: ['music', 'shows'] },
				now
			))
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
