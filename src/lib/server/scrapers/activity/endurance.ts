/**
 * Endurance & cycling race scrapers.
 * Covers: Webscorer (B-17), B-17 Racing site, NorCal MTB League, Dipsea Race,
 * and event pages (Marinduro, Marin Ultra Challenge, Miwok 100K, Quad Dipsea).
 */
import type { NewsItem } from '$lib/types';
import { stripHtml, safeFetch, parseHtml } from '../shared';
import type { EventPageConfig } from './types';
import {
	buildItem,
	inferTownFromText,
	inferSeasonSpanningYear,
	resolveAnnualMonthDay,
	getDipseaRaceDate
} from './helpers';
import { fetchLastModified } from '../shared';
import { parseEventPage } from './parsers';

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

export async function scrapeWebscorer(now: number): Promise<NewsItem[]> {
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

export async function scrapeDipseaHome(now: number): Promise<NewsItem[]> {
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

export async function scrapeDipseaRaceDate(now: number): Promise<NewsItem[]> {
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

export async function scrapeB17Racing(now: number): Promise<NewsItem[]> {
	try {
		const html = await safeFetch('https://b17racing.com');
		const items: NewsItem[] = [];
		const text = stripHtml(html);

		// Summit Shorty Series -- Wednesday evenings at Camp Tamarancho, Fairfax
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

export async function scrapeNorcalRaces(now: number): Promise<NewsItem[]> {
	const html = await safeFetch('https://www.norcalmtb.org/races/');
	const doc = parseHtml(html);
	const items: NewsItem[] = [];

	// Parse the race schedule table -- look for rows with race info
	const rows = [...doc.querySelectorAll('tr')];
	for (const row of rows) {
		const cells = [...row.querySelectorAll('td, th')];
		if (cells.length < 2) continue;

		const rowText = stripHtml(row.textContent || '');
		const raceMatch = rowText.match(
			/Race\s+(\d+)[:\s]*([^0-9]*?)(\d{1,2}\/\d{1,2})/i
		);
		if (!raceMatch) continue;

		const raceNum = raceMatch[1];
		const venueName = raceMatch[2].replace(/[,\s]+$/, '').trim() || `Race ${raceNum}`;

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

export async function scrapeEventPages(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];
	for (const eventConfig of EVENT_PAGES) {
		items.push(...(await parseEventPage(eventConfig, now)));
	}
	return items;
}
