/**
 * Sports scrapers.
 * Covers: San Rafael Pacifics schedule, Marin Rowing calendar, sports hub pages,
 * prep sports hubs, and Redwood Bark sports RSS.
 */
import type { NewsItem } from '$lib/types';
import { stripHtml, safeFetch, parseHtml } from '../shared';
import type { SourceConfig } from './types';
import { buildItem, buildPacificsScheduleUrl, inferLikelyCalendarYear } from './helpers';
import { parseRssFeed, parseSinglePageItem } from './parsers';

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

export async function scrapePacificsSchedule(now: number): Promise<NewsItem[]> {
	const scheduleUrl = buildPacificsScheduleUrl(now);
	try {
		const html = await safeFetch(scheduleUrl);
		const items: NewsItem[] = [];
		const doc = parseHtml(html);

		// Parse calendar table cells -- bgcolor indicates home (acd8ef) vs away (c0c0c0/5a007c)
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
			const dateMatch = dateText.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
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
			return items.sort((a, b) => a.timestamp - b.timestamp).slice(0, 20);
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
			description: 'Local sports hub for schedules, fixtures, club updates, or season information.',
			verification: 'community',
			town: pacificsHub.town,
			townSlug: pacificsHub.townSlug,
			topics: pacificsHub.topics
		},
		now
	);
}

export async function scrapeMarinRowingCalendar(now: number): Promise<NewsItem[]> {
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

			// Parse the date -- add current year if not present
			let dateStr = rawDate;
			if (!/\d{4}/.test(dateStr)) {
				dateStr += `, ${inferLikelyCalendarYear(dateStr, now)}`;
			}
			// Handle date ranges like "March 26-29" -- use the first date
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

		return items.sort((a, b) => a.timestamp - b.timestamp).slice(0, 15);
	} catch {
		return [];
	}
}

export async function scrapeSportsHubs(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];

	items.push(...(await scrapePacificsSchedule(now)));

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

export async function scrapePrepHubs(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];
	for (const hub of PREP_HUBS) {
		items.push(
			...(await parseSinglePageItem(
				{
					source: hub.source,
					category: 'prep',
					title: hub.title || `${hub.source} hub`,
					url: hub.url,
					description: 'Official athletics or team hub for a Marin-area school or league program.',
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

export async function scrapeRedwoodBarkSports(now: number): Promise<NewsItem[]> {
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
