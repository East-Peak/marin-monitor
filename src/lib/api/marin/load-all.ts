/**
 * Shared data loading orchestrator.
 * Used by both the main dashboard (+page.svelte) and TV mode (TvWallboard).
 * Fetches all RSS feeds, API sources, and enriches items.
 */

import { news } from '$lib/stores';
import type { NewsCategory, NewsItem, EarthquakeData } from '$lib/types';
import {
	fetchAllFeeds,
	fetchNpsAlerts,
	fetchEarthquakes,
	earthquakesToNewsItems,
	fetchTransitAlerts,
	fetchSheriffCrimeBlotter,
	fetchSupplementalPoliceLogs,
	fetchSupplementalActivityFeeds,
	enrichItemsForRelevance
} from '$lib/api/marin';

const RSS_CATEGORIES: NewsCategory[] = [
	'local', 'civic', 'safety', 'outdoors', 'housing',
	'cycling', 'endurance', 'shows', 'prep', 'farm', 'satire'
];

export interface LoadAllResult {
	earthquakeNews: NewsItem[];
	earthquakesRaw: EarthquakeData[];
}

/**
 * Fetch all news data, populate stores, and return earthquake items for the map.
 * @param showLoadingSpinners If true, sets loading state on empty categories (main dashboard only)
 */
export async function loadAllNews(showLoadingSpinners = false): Promise<LoadAllResult> {
	if (showLoadingSpinners) {
		RSS_CATEGORIES.forEach((cat) => {
			if (news.getItems(cat).length === 0) news.setLoading(cat, true);
		});
	}

	const settled = await Promise.allSettled([
		fetchAllFeeds(),
		fetchNpsAlerts(),
		fetchEarthquakes(),
		fetchTransitAlerts().then((r) => r.items),
		fetchSheriffCrimeBlotter(),
		fetchSupplementalPoliceLogs(),
		fetchSupplementalActivityFeeds()
	]);

	const [rssResults, npsAlerts, earthquakes, transitAlerts, sheriffBlotter, policeLogs, supplementalActivity] =
		settled.map((r) => (r.status === 'fulfilled' ? r.value : [])) as [
			Awaited<ReturnType<typeof fetchAllFeeds>>,
			NewsItem[],
			EarthquakeData[],
			NewsItem[],
			NewsItem[],
			NewsItem[],
			NewsItem[]
		];

	const earthquakeNews = earthquakesToNewsItems(earthquakes);

	const supplementalByCategory = new Map<NewsCategory, NewsItem[]>();
	for (const category of RSS_CATEGORIES) {
		supplementalByCategory.set(category, supplementalActivity.filter((item) => item.category === category));
	}

	await Promise.all(
		rssResults.map(async (result) => {
			const extraItems =
				result.category === 'safety'
					? [...earthquakeNews, ...transitAlerts, ...sheriffBlotter, ...policeLogs, ...(supplementalByCategory.get(result.category) ?? [])]
					: result.category === 'outdoors'
							? [...npsAlerts, ...(supplementalByCategory.get(result.category) ?? [])]
							: (supplementalByCategory.get(result.category) ?? []);

			const allItems = [...result.items, ...extraItems].sort((a, b) => b.timestamp - a.timestamp);
			const enrichedItems = await enrichItemsForRelevance(allItems);

			news.setItems(result.category, enrichedItems);
			if (enrichedItems.length > 0) {
				void news.enrichLocations(result.category);
			}
			if (result.errors.length > 0) {
				console.warn(`[${result.category}] Feed errors:`, result.errors);
			}
		})
	);

	return { earthquakeNews, earthquakesRaw: earthquakes };
}
