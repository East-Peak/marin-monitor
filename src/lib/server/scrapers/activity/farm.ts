/**
 * Farm & market scrapers.
 * Covers: Agricultural Institute of Marin farmers markets and Point Reyes Farmstead Cheese.
 */
import type { NewsItem } from '$lib/types';
import { stripHtml, safeFetch } from '../shared';
import { parseSinglePageItem, parseAtomFeed } from './parsers';

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
] as const;

export async function scrapeFarmMarketSchedule(
	market: (typeof FARM_MARKETS)[number]
): Promise<{ title: string; description: string }> {
	try {
		const html = await safeFetch(market.url);
		const text = stripHtml(html);

		const dayMatch = text.match(
			/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i
		);
		const timeMatch = text.match(
			/(\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-\u2013\u2014to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))/i
		);
		const seasonMatch = text.match(
			/((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\s*[-\u2013\u2014]+\s*(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4})/i
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

		let location = 'town' in market ? (market.town || '') : '';
		if (locationMatch) location = locationMatch[1].trim();

		const title =
			parts.length > 0
				? `${market.title.replace(/ schedule$/, '')} \u00b7 ${parts.join(', ')}`
				: market.title;

		const desc =
			parts.length > 0
				? `${parts.join(' \u00b7 ')}${location ? ` at ${location}` : ''}`
				: 'Official market schedule from the Agricultural Institute of Marin.';

		return { title, description: desc };
	} catch {
		return {
			title: market.title,
			description: 'Official market schedule from the Agricultural Institute of Marin.'
		};
	}
}

export async function scrapeFarmMarkets(now: number): Promise<NewsItem[]> {
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
					town: 'town' in market ? market.town : undefined,
					townSlug: 'townSlug' in market ? market.townSlug : undefined,
					lat: 'lat' in market ? market.lat : undefined,
					lon: 'lon' in market ? market.lon : undefined,
					topics: ['farmers-market', 'produce']
				},
				now
			))
		);
	}
	return items;
}

export async function scrapePointReyesCheese(now: number): Promise<NewsItem[]> {
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
