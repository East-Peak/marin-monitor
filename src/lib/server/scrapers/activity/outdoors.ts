/**
 * Outdoors & fishing scrapers.
 * Covers: CDFW fishing regulation pages and keyword-filtered RSS feeds
 * (Point Reyes Light fishing, Marin IJ fishing, Marin Magazine farm).
 */
import type { NewsItem } from '$lib/types';
import { parseSinglePageItem, parseFilteredFeedCategory } from './parsers';

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

export async function scrapeFishingPages(now: number): Promise<NewsItem[]> {
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

export async function scrapeFishingFeeds(now: number): Promise<NewsItem[]> {
	const items: NewsItem[] = [];

	// Point Reyes Light fishing articles
	items.push(
		...(await parseFilteredFeedCategory(
			{
				url: 'https://www.ptreyeslight.com/feed/',
				source: 'Point Reyes Light',
				category: 'outdoors',
				keywords: [
					'fish',
					'fishing',
					'salmon',
					'crab',
					'oyster',
					'dungeness',
					'halibut',
					'rockfish',
					'herring',
					'squid',
					'mackerel',
					'mussels',
					'clam',
					'abalone',
					'striped bass',
					'sturgeon',
					'steelhead',
					'trout',
					'albacore'
				],
				topics: ['fishing', 'west-marin']
			},
			now
		))
	);

	// Marin IJ fishing articles
	items.push(
		...(await parseFilteredFeedCategory(
			{
				url: 'https://www.marinij.com/feed/',
				source: 'Marin Independent Journal',
				category: 'outdoors',
				keywords: [
					'fishing',
					'salmon',
					'crab',
					'dungeness',
					'oyster',
					'halibut',
					'fish stock',
					'trawl',
					'commercial fishing',
					'shellfish',
					'aquaculture'
				],
				topics: ['fishing', 'local-news']
			},
			now
		))
	);

	// Marin Magazine farm/market articles
	items.push(
		...(await parseFilteredFeedCategory(
			{
				url: 'https://marinmagazine.com/feed/',
				source: 'Marin Magazine',
				category: 'farm',
				keywords: [
					'farmers market',
					'market',
					'cheese',
					'creamery',
					'produce',
					'wine',
					'beer',
					'brewery'
				],
				topics: ['farmers-market', 'food-drink']
			},
			now
		))
	);

	return items;
}
