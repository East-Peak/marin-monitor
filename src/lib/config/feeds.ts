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
}

export const FEEDS: Record<NewsCategory, FeedSource[]> = {
	local: [
		// --- Primary Marin sources ---
		{
			name: 'Marin Independent Journal',
			url: 'https://www.marinij.com/tag/news/feed/',
			verification: 'local_media',
			confirmed: true
		},
		{
			name: 'Marin IJ – Breaking News',
			url: 'https://www.marinij.com/tag/breaking-news/feed/',
			verification: 'local_media',
			confirmed: true
		},
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
			confirmed: true
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
			url: 'https://www.cityofsanrafael.org/feed/',
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
			name: 'Marin IJ – Politics',
			url: 'https://www.marinij.com/tag/politics/feed/',
			verification: 'local_media',
			confirmed: true
		},
		{
			name: 'Marin County BOS – Agendas',
			url: 'https://marin.granicus.com/ViewPublisherRSS.php?view_id=33&mode=agendas',
			verification: 'official',
			confirmed: true
		},
		{
			name: 'Marin County BOS – Minutes',
			url: 'https://marin.granicus.com/ViewPublisherRSS.php?view_id=33&mode=minutes',
			verification: 'official',
			confirmed: true
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
			name: 'Marin IJ – Emergency',
			url: 'https://www.marinij.com/tag/emergency/feed/',
			verification: 'local_media',
			confirmed: true
		},
		{
			name: 'NBC Bay Area – Crime',
			url: 'https://www.nbcbayarea.com/tag/crime/feed/',
			verification: 'local_media',
			confirmed: true
		}
		// Dead: CHP Golden Gate (returns HTML), Marin County Emergency (403),
		// CAL FIRE (403), Nixle (absorbed by Everbridge, RSS dead),
		// Individual PDs have no RSS feeds
		// TODO: Add USGS earthquakes (JSON API, not RSS) via separate adapter
	],

	outdoors: [
		{
			name: 'MMWD / Marin Water',
			url: 'https://www.marinwater.org/feed/',
			verification: 'official',
			confirmed: true
		},
		{
			name: 'Marin IJ – Environment',
			url: 'https://www.marinij.com/tag/environment/feed/',
			verification: 'local_media',
			confirmed: true
		},
		{
			name: 'Marin Humane',
			url: 'https://marinhumane.org/feed/',
			verification: 'community',
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
			url: 'https://marinlately.com/feed/',
			verification: 'satire',
			confirmed: true
		}
	],

	// 311 items are fetched from the FixItMarin adapter, not RSS feeds
	'311': []
};

/**
 * Supplemental Marin IJ tag feeds — available for topic-specific panels
 * These aren't in the main FEEDS map to avoid duplicating stories,
 * but are available for targeted fetching.
 */
export const MARINIJ_TAG_FEEDS = {
	weather: 'https://www.marinij.com/tag/weather/feed/',
	transportation: 'https://www.marinij.com/tag/transportation/feed/',
	business: 'https://www.marinij.com/tag/business/feed/',
	education: 'https://www.marinij.com/tag/education/feed/',
	health: 'https://www.marinij.com/tag/health/feed/',
	wildfire: 'https://www.marinij.com/tag/wildfire/feed/',
	sports: 'https://www.marinij.com/tag/sports/feed/',
	obituaries: 'https://www.marinij.com/tag/obituaries/feed/'
} as const;

/**
 * Marin IJ per-city feeds — available for town-specific filtering
 */
export const MARINIJ_LOCATION_FEEDS: Record<string, string> = {
	'san-rafael': 'https://www.marinij.com/tag/san-rafael/feed/',
	novato: 'https://www.marinij.com/tag/novato/feed/',
	'mill-valley': 'https://www.marinij.com/tag/mill-valley/feed/',
	tiburon: 'https://www.marinij.com/tag/tiburon/feed/',
	sausalito: 'https://www.marinij.com/tag/sausalito/feed/',
	larkspur: 'https://www.marinij.com/tag/larkspur/feed/',
	'corte-madera': 'https://www.marinij.com/tag/corte-madera/feed/',
	'san-anselmo': 'https://www.marinij.com/tag/san-anselmo/feed/',
	fairfax: 'https://www.marinij.com/tag/fairfax/feed/',
	'marin-county': 'https://www.marinij.com/tag/marin-county/feed/'
};

/**
 * All feed URLs flattened for batch fetching (excludes broken feeds)
 */
export function getAllFeedUrls(): {
	name: string;
	url: string;
	category: NewsCategory;
	verification: VerificationLevel;
}[] {
	const all: {
		name: string;
		url: string;
		category: NewsCategory;
		verification: VerificationLevel;
	}[] = [];
	for (const [category, sources] of Object.entries(FEEDS)) {
		for (const source of sources) {
			if (source.broken) continue;
			all.push({
				name: source.name,
				url: source.url,
				category: category as NewsCategory,
				verification: source.verification
			});
		}
	}
	return all;
}
