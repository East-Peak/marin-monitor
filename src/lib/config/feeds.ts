/**
 * Marin County RSS feed and news source configuration
 *
 * Status as of 2026-02-25:
 *   CONFIRMED WORKING: Marin IJ, Point Reyes Light, City of San Rafael,
 *     Town of Fairfax, MMWD, Marin Lately
 *   UNTESTED: SF Chronicle, Novato, San Anselmo, Mill Valley, Corte Madera, CHP
 *   BLOCKED (403): Marin County official (Cloudflare), CAL FIRE (Akamai),
 *     Marin County Emergency (likely same Cloudflare)
 *   DEAD: All Patch feeds (404), West Marin Feed (DNS gone), NPS feeds (deprecated)
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
		{
			name: 'Marin Independent Journal',
			url: 'https://www.marinij.com/feed/',
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
			name: 'SF Chronicle – Bay Area',
			url: 'https://www.sfchronicle.com/bayarea/feed/Bay-Area-Local-702.php',
			verification: 'local_media'
		}
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
			name: 'City of Novato',
			url: 'https://www.novato.org/Home/Components/RssFeeds/RssFeeds/2/20',
			verification: 'official'
		},
		{
			name: 'Town of San Anselmo',
			url: 'https://www.townofsananselmo.org/RSSFeed.aspx',
			verification: 'official'
		},
		{
			name: 'City of Mill Valley',
			url: 'https://www.cityofmillvalley.org/feed/',
			verification: 'official'
		},
		{
			name: 'Town of Corte Madera',
			url: 'https://www.townofcortemadera.org/RSSFeed.aspx',
			verification: 'official'
		},
		{
			name: 'Marin County News',
			url: 'https://www.marincounty.org/main/county-press-releases/rss',
			verification: 'official',
			broken: true // Cloudflare 403
		}
	],
	safety: [
		{
			name: 'CHP – Golden Gate Division',
			url: 'https://cad.chp.ca.gov/Traffic.aspx/AreaRSS?AreaId=GGD',
			verification: 'official'
		},
		{
			name: 'Marin County Emergency',
			url: 'https://www.marincounty.org/depts/fr/rss',
			verification: 'official',
			broken: true // Likely same Cloudflare block
		},
		{
			name: 'CAL FIRE',
			url: 'https://www.fire.ca.gov/feed',
			verification: 'official',
			broken: true // Akamai 403
		}
	],
	outdoors: [
		{
			name: 'MMWD / Marin Water',
			url: 'https://www.marinwater.org/feed/',
			verification: 'official',
			confirmed: true
		}
		// NPS Point Reyes and Muir Woods feeds are broken (return HTML, not RSS)
	],
	housing: [
		// Housing data comes from Marin Open Data (Socrata) API, not RSS
	],
	satire: [
		{
			name: 'Marin Lately',
			url: 'https://marinlately.com/feed/',
			verification: 'satire',
			confirmed: true
		}
	]
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
