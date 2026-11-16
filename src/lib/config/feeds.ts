/**
 * Marin County RSS feed and news source configuration
 *
 * All feeds verified working as of 2026-04-03 unless marked broken.
 * Marin IJ feeds switched from /feed/ and /location/ paths (403 since ~Apr 2026)
 * to /tag/ paths which still work.
 * Dead/broken feeds are commented out with date and reason.
 */

import type { NewsCategory, VerificationLevel } from '$lib/types';

export interface FeedSource {
	name: string;
	url: string;
	verification: VerificationLevel;
	/** Known to be working as of last test */
	confirmed?: boolean;
	/** Known to be broken — skip in fetcher */
	broken?: boolean;
	/**
	 * IANA zone for feeds whose item dates carry no zone. Only zone-less values
	 * use it, and the assumption is recorded as provenance ($lib/news/feed-date).
	 */
	assumedTimeZone?: string;
	/**
	 * What the item date means. 'event-start': it is when the thing happens
	 * (a meeting), kept as eventAt; publication time stays unknown.
	 */
	pubDateMeaning?: 'publication' | 'event-start';
}

export const FEEDS: Record<NewsCategory, FeedSource[]> = {
	local: [
		// --- Primary Marin sources ---
		{
			name: 'Marin Independent Journal',
			// tag/news stopped being populated; marin-county is the IJ's live local tag.
			url: 'https://www.marinij.com/tag/marin-county/feed/',
			verification: 'local_media',
			confirmed: true
		},
		// Retired 2026-09: Marin IJ tag/breaking-news and tag/emergency (empty all year).
		{
			name: 'Point Reyes Light',
			url: 'https://www.ptreyeslight.com/feed/',
			verification: 'local_media',
			confirmed: true
		},
		{
			name: 'Pacific Sun',
			url: 'https://pacificsun.com/feed/',
			verification: 'local_media',
			confirmed: true
		},
		{
			name: 'Marin Magazine',
			url: 'https://marinmagazine.com/feed/',
			verification: 'local_media',
			confirmed: true
		},
		// --- Bay Area sources that cover Marin ---
		{
			name: 'NBC Bay Area – Marin',
			url: 'https://www.nbcbayarea.com/tag/marin-county/feed/',
			verification: 'local_media',
			confirmed: true,
			// Item pubDate is zone-less local time ("Fri, Sep 25 2026 11:48:58 AM");
			// the channel pubDate is -0700, i.e. Pacific.
			assumedTimeZone: 'America/Los_Angeles'
		},
		{
			name: 'KQED News',
			url: 'https://ww2.kqed.org/news/feed/',
			verification: 'local_media',
			confirmed: true
		}
		// Dead: SF Chronicle (404), SFGate (410 Gone), Patch (all removed)
	],

	civic: [
		{
			name: 'City of San Rafael',
			url: 'https://sanrafael.gov/feed/',
			verification: 'official',
			confirmed: true
		},
		{
			name: 'Town of Fairfax',
			url: 'https://townoffairfaxca.gov/feed/',
			verification: 'official',
			confirmed: true
		},
		{
			name: 'City of Belvedere',
			url: 'https://cityofbelvedere.gov/feed/',
			verification: 'official',
			confirmed: true
		},
		{
			name: 'Marin IJ – Politics',
			url: 'https://www.marinij.com/tag/politics/feed/',
			verification: 'local_media',
			confirmed: true
		},
		{
			name: 'Marin County BOS – Agendas',
			url: 'https://marin.granicus.com/ViewPublisherRSS.php?view_id=33&mode=agendas',
			verification: 'official',
			confirmed: true,
			// pubDate is the meeting time, not when the agenda was posted.
			pubDateMeaning: 'event-start'
		},
		{
			name: 'Marin County BOS – Minutes',
			url: 'https://marin.granicus.com/ViewPublisherRSS.php?view_id=33&mode=minutes',
			verification: 'official',
			confirmed: true,
			// pubDate is the meeting time the minutes record, not a publication time.
			pubDateMeaning: 'event-start'
		}
		// Dead: Novato (404), San Anselmo (.gov migration, empty), Mill Valley (404),
		// Corte Madera (.gov migration, empty), Marin County (Cloudflare 403)
	],

	safety: [
		{
			name: 'Marin IJ – Crime',
			url: 'https://www.marinij.com/tag/crime/feed/',
			verification: 'local_media',
			confirmed: true
		},
		{
			name: 'Marin IJ – Fire',
			url: 'https://www.marinij.com/tag/fire/feed/',
			verification: 'local_media',
			confirmed: true
		},
		{
			name: 'NBC Bay Area – Crime',
			url: 'https://www.nbcbayarea.com/tag/crime/feed/',
			verification: 'local_media',
			confirmed: true,
			// Same NBC CMS as NBC Bay Area – Marin: zone-less Pacific item dates.
			assumedTimeZone: 'America/Los_Angeles'
		}
		// Dead: CHP Golden Gate (returns HTML), Marin County Emergency (403),
		// CAL FIRE (403), Nixle (absorbed by Everbridge, RSS dead),
		// Individual PDs have no RSS feeds
		// TODO: Add USGS earthquakes (JSON API, not RSS) via separate adapter
	],

	outdoors: [
		{
			name: 'Marin IJ – Environment',
			url: 'https://www.marinij.com/tag/environment/feed/',
			verification: 'local_media',
			confirmed: true
		},
		{
			name: 'WildCare',
			url: 'https://discoverwildcare.org/feed/',
			verification: 'community',
			confirmed: true
		}
		// NPS alerts (Point Reyes, Muir Woods, GGNRA) handled via JSON API adapter
	],

	housing: [
		{
			name: 'Marin IJ – Housing',
			url: 'https://www.marinij.com/tag/housing/feed/',
			verification: 'local_media',
			confirmed: true
		}
		// Additional housing data from Marin Open Data (Socrata) API — separate adapter
	],

	cycling: [],

	endurance: [],

	shows: [],

	prep: [],

	farm: [],

	satire: [
		{
			name: 'Marin Lately',
			url: 'https://www.marinlately.com/latest/rss/',
			verification: 'satire',
			confirmed: true
		}
	],

	// 311 items are fetched from the FixItMarin adapter, not RSS feeds
	'311': []
};
