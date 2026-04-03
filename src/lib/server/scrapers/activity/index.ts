/**
 * Activity scraper orchestrator.
 * Thin aggregation layer that imports per-source scrapers and merges results.
 */
import type { NewsItem } from '$lib/types';
import { safeParse } from '../shared';
import { scrapeShowRssFeeds, scrapeShowsHubs } from './shows';
import {
	scrapeWebscorer,
	scrapeEventPages,
	scrapeDipseaHome,
	scrapeDipseaRaceDate,
	scrapeB17Racing,
	scrapeNorcalRaces
} from './endurance';
import {
	scrapeSportsHubs,
	scrapePrepHubs,
	scrapeRedwoodBarkSports,
	scrapeMarinRowingCalendar
} from './sports';
import { scrapeFarmMarkets, scrapePointReyesCheese } from './farm';
import { scrapeFishingPages, scrapeFishingFeeds } from './outdoors';
import { dedupeItems } from './dedupe';

export async function scrapeActivity(): Promise<NewsItem[]> {
	const now = Date.now();
	const collected: NewsItem[] = [];

	// Shows & music
	collected.push(...(await safeParse('Show RSS feeds', () => scrapeShowRssFeeds(now))));
	collected.push(...(await safeParse('Shows hubs', () => scrapeShowsHubs(now))));

	// Endurance & cycling
	collected.push(...(await safeParse('Webscorer', () => scrapeWebscorer(now))));
	collected.push(...(await safeParse('Event pages', () => scrapeEventPages(now))));
	collected.push(...(await safeParse('Dipsea', () => scrapeDipseaHome(now))));
	collected.push(...(await safeParse('Dipsea race date', () => scrapeDipseaRaceDate(now))));
	collected.push(...(await safeParse('B-17 Racing', () => scrapeB17Racing(now))));
	collected.push(...(await safeParse('NorCal MTB', () => scrapeNorcalRaces(now))));

	// Sports & prep
	collected.push(...(await safeParse('Marin Rowing', () => scrapeMarinRowingCalendar(now))));
	collected.push(...(await safeParse('Redwood Bark', () => scrapeRedwoodBarkSports(now))));
	collected.push(...(await safeParse('Prep hubs', () => scrapePrepHubs(now))));
	collected.push(...(await safeParse('Sports hubs', () => scrapeSportsHubs(now))));

	// Farm & market
	collected.push(...(await safeParse('Farm markets', () => scrapeFarmMarkets(now))));
	collected.push(...(await safeParse('Pt Reyes Cheese', () => scrapePointReyesCheese(now))));

	// Outdoors & fishing
	collected.push(...(await safeParse('Fishing pages', () => scrapeFishingPages(now))));
	collected.push(...(await safeParse('Fishing/farm feeds', () => scrapeFishingFeeds(now))));

	return dedupeItems(collected, now);
}
