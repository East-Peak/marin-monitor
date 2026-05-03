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
	fetchSeeClickFixIssues,
	enrichItemsForRelevance
} from '$lib/api/marin';

const RSS_CATEGORIES: NewsCategory[] = [
	'local', 'civic', '311', 'safety', 'outdoors', 'housing',
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
		fetchSupplementalActivityFeeds(),
		fetchSeeClickFixIssues()
	]);

	const [rssResults, npsAlerts, earthquakes, transitAlerts, sheriffBlotter, policeLogs, supplementalActivity, seeClickFixIssues] =
		settled.map((r) => (r.status === 'fulfilled' ? r.value : [])) as [
			Awaited<ReturnType<typeof fetchAllFeeds>>,
			NewsItem[],
			EarthquakeData[],
			NewsItem[],
			NewsItem[],
			NewsItem[],
			NewsItem[],
			NewsItem[]
		];

	// 311 has no RSS feed; the store is rewritten only from the SeeClickFix
	// adapter. Track whether the fetch actually succeeded so we can preserve
	// the previous good data on failure instead of pinning stale items
	// (success with [] is a legitimate "no current 311 reports" — that case
	// SHOULD clear the store).
	const seeClickFixSucceeded = settled[7].status === 'fulfilled';

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
							: result.category === '311'
									? [...seeClickFixIssues, ...(supplementalByCategory.get(result.category) ?? [])]
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

	// 311 has no live RSS source today, but if `fetchAllFeeds` ever returns a
	// '311' category result, the per-category loop above already wrote it
	// (merged with seeClickFixIssues + supplemental). In that case the direct
	// rewrite below would clobber the merge — so skip it.
	//
	// When there's no RSS '311' result:
	//   success → always rewrite (legitimate empty must clear stale items)
	//   failure → leave the store alone unless it was empty (avoid blanking
	//             a panel that had valid data during a transient outage)
	const has311RssResult = rssResults.some((r) => r.category === '311');
	const shouldWrite311 =
		!has311RssResult && (seeClickFixSucceeded || news.getItems('311').length === 0);
	if (shouldWrite311) {
		const enriched311 = await enrichItemsForRelevance(seeClickFixIssues);
		news.setItems('311', enriched311);
		if (enriched311.length > 0) {
			void news.enrichLocations('311');
		}
	}

	return { earthquakeNews, earthquakesRaw: earthquakes };
}
