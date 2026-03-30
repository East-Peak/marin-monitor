/**
 * News store - manages news data across all Marin categories
 */

import { writable, derived, get } from 'svelte/store';
import type { NewsItem, NewsCategory } from '$lib/types';
import { containsAlertKeyword, detectTown, detectTopics } from '$lib/config';
import { isLocallyRelevant } from '$lib/config/relevance';
import { enrichItemsForLocation } from '$lib/api/marin/article-enrichment';

export interface CategoryState {
	items: NewsItem[];
	loading: boolean;
	error: string | null;
	lastUpdated: number | null;
}

export interface NewsState {
	categories: Record<NewsCategory, CategoryState>;
	initialized: boolean;
}

// All Marin news categories
const NEWS_CATEGORIES: NewsCategory[] = [
	'local',
	'civic',
	'safety',
	'outdoors',
	'housing',
	'cycling',
	'endurance',
	'shows',
	'prep',
	'farm',
	'satire'
];

// Create initial state for a category
function createCategoryState(): CategoryState {
	return {
		items: [],
		loading: false,
		error: null,
		lastUpdated: null
	};
}

// Create initial state
function createInitialState(): NewsState {
	const categories = {} as Record<NewsCategory, CategoryState>;
	for (const category of NEWS_CATEGORIES) {
		categories[category] = createCategoryState();
	}
	return { categories, initialized: false };
}

// Enrich news item with town detection and alert keywords
function enrichNewsItem(item: NewsItem): NewsItem {
	const fullText = `${item.title} ${item.description || ''} ${item.content || ''}`;
	// Only scan the TITLE for alert keywords — description/content matches produce
	// too many false positives (e.g. "wildfire" in a landscaping article, "landslide"
	// in a concert listing).
	const alertResult = containsAlertKeyword(item.title, {
		source: item.source,
		verification: item.verification,
		link: item.link,
		title: item.title
	});
	// Only detect town from TITLE — description/content mentions produce false
	// positives (e.g. a San Rafael newsletter listing events in Stinson Beach gets
	// pinned at Stinson Beach instead of San Rafael).
	const townResult = detectTown(item.title);

	return {
		...item,
		isAlert: item.isAlert !== undefined ? item.isAlert : alertResult.isAlert,
		alertKeyword: alertResult.isAlert ? alertResult.keyword : undefined,
		town: item.town ?? townResult?.name,
		townSlug: item.townSlug ?? townResult?.slug,
		topics: item.topics ?? detectTopics(fullText)
	};
}

// Create the store
function createNewsStore() {
	const { subscribe, set, update } = writable<NewsState>(createInitialState());
	const inFlightLocationEnrichment = new Set<NewsCategory>();

	return {
		subscribe,

		/**
		 * Initialize store
		 */
		init() {
			update((state) => ({ ...state, initialized: true }));
		},

		/**
		 * Set loading state for a category
		 */
		setLoading(category: NewsCategory, loading: boolean) {
			update((state) => ({
				...state,
				categories: {
					...state.categories,
					[category]: {
						...state.categories[category],
						loading,
						error: loading ? null : state.categories[category].error
					}
				}
			}));
		},

		/**
		 * Set error state for a category
		 */
		setError(category: NewsCategory, error: string | null) {
			update((state) => ({
				...state,
				categories: {
					...state.categories,
					[category]: {
						...state.categories[category],
						loading: false,
						error
					}
				}
			}));
		},

		/**
		 * Set items for a category
		 */
		setItems(category: NewsCategory, items: NewsItem[]) {
			const enrichedItems = items.map(enrichNewsItem).filter(isLocallyRelevant);

			update((state) => ({
				...state,
				categories: {
					...state.categories,
					[category]: {
						items: enrichedItems,
						loading: false,
						error: null,
						lastUpdated: Date.now()
					}
				}
			}));
		},

		/**
		 * Append items to a category (for pagination)
		 */
		appendItems(category: NewsCategory, items: NewsItem[]) {
			const enrichedItems = items.map(enrichNewsItem).filter(isLocallyRelevant);

			update((state) => {
				const existing = state.categories[category].items;
				const existingIds = new Set(existing.map((i) => i.id));
				const newItems = enrichedItems.filter((i) => !existingIds.has(i.id));

				return {
					...state,
					categories: {
						...state.categories,
						[category]: {
							...state.categories[category],
							items: [...existing, ...newItems],
							loading: false,
							error: null,
							lastUpdated: Date.now()
						}
					}
				};
			});
		},

		/**
		 * Enrich already-filtered items with precise map locations (when available).
		 * This runs in the background and only updates items still present in the category.
		 */
		async enrichLocations(category: NewsCategory) {
			if (inFlightLocationEnrichment.has(category)) return;
			inFlightLocationEnrichment.add(category);

			try {
				const snapshot = get({ subscribe }).categories[category].items;
				if (snapshot.length === 0) return;

				const enriched = await enrichItemsForLocation(snapshot);
				const byId = new Map(enriched.map((item) => [item.id, item]));

				update((state) => {
					let changed = false;
					const nextItems = state.categories[category].items.map((item) => {
						const candidate = byId.get(item.id);
						if (!candidate) return item;

						const nextLat = candidate.lat;
						const nextLon = candidate.lon;
						const nextConfidence = candidate.locationConfidence;
						const nextEvidence = candidate.locationEvidence;

						const same =
							nextLat === item.lat &&
							nextLon === item.lon &&
							nextConfidence === item.locationConfidence &&
							nextEvidence === item.locationEvidence;

						if (same) return item;
						changed = true;
						return {
							...item,
							lat: nextLat,
							lon: nextLon,
							locationConfidence: nextConfidence,
							locationEvidence: nextEvidence
						};
					});

					if (!changed) return state;
					return {
						...state,
						categories: {
							...state.categories,
							[category]: {
								...state.categories[category],
								items: nextItems
							}
						}
					};
				});
			} finally {
				inFlightLocationEnrichment.delete(category);
			}
		},

		/**
		 * Get items for a category
		 */
		getItems(category: NewsCategory): NewsItem[] {
			return get({ subscribe }).categories[category].items;
		},

		/**
		 * Get all items across all categories
		 */
		getAllItems(): NewsItem[] {
			const state = get({ subscribe });
			const allItems: NewsItem[] = [];
			for (const category of NEWS_CATEGORIES) {
				allItems.push(...state.categories[category].items);
			}
			return allItems;
		},

		/**
		 * Get alert items (items with alert keywords)
		 */
		getAlertItems(): NewsItem[] {
			const state = get({ subscribe });
			const alerts: NewsItem[] = [];
			for (const category of NEWS_CATEGORIES) {
				alerts.push(...state.categories[category].items.filter((i) => i.isAlert));
			}
			return alerts.sort((a, b) => b.timestamp - a.timestamp);
		},

		/**
		 * Get items for a specific town
		 */
		getItemsByTown(townSlug: string): NewsItem[] {
			const state = get({ subscribe });
			const items: NewsItem[] = [];
			for (const category of NEWS_CATEGORIES) {
				items.push(...state.categories[category].items.filter((i) => i.townSlug === townSlug));
			}
			return items.sort((a, b) => b.timestamp - a.timestamp);
		},

		/**
		 * Clear a category
		 */
		clearCategory(category: NewsCategory) {
			update((state) => ({
				...state,
				categories: {
					...state.categories,
					[category]: createCategoryState()
				}
			}));
		},

		/**
		 * Clear all categories
		 */
		clearAll() {
			set(createInitialState());
		},

		/**
		 * Check if any category is loading
		 */
		isAnyLoading(): boolean {
			const state = get({ subscribe });
			return NEWS_CATEGORIES.some((cat) => state.categories[cat].loading);
		}
	};
}

// Export singleton store
export const news = createNewsStore();

// Derived stores for each Marin category
export const localNews = derived(news, ($news) => $news.categories.local);
export const civicNews = derived(news, ($news) => $news.categories.civic);
export const safetyNews = derived(news, ($news) => $news.categories.safety);
export const outdoorsNews = derived(news, ($news) => $news.categories.outdoors);
export const housingNews = derived(news, ($news) => $news.categories.housing);
export const cyclingNews = derived(news, ($news) => $news.categories.cycling);
export const enduranceNews = derived(news, ($news) => $news.categories.endurance);
export const humanPoweredNews = derived([cyclingNews, enduranceNews], ([$cycling, $endurance]) => ({
	items: [...$cycling.items, ...$endurance.items].sort((a, b) => b.timestamp - a.timestamp),
	loading: $cycling.loading || $endurance.loading,
	error: $cycling.error ?? $endurance.error,
	lastUpdated: Math.max($cycling.lastUpdated ?? 0, $endurance.lastUpdated ?? 0) || null
}));
export const showsNews = derived(news, ($news) => $news.categories.shows);
export const prepNews = derived(news, ($news) => $news.categories.prep);
export const farmNews = derived(news, ($news) => $news.categories.farm);
export const satireNews = derived(news, ($news) => $news.categories.satire);

// Derived store for all news items (reactive, deduplicated by id)
export const allNewsItems = derived(news, ($news) => {
	const seen = new Set<string>();
	const allItems: NewsItem[] = [];
	for (const category of NEWS_CATEGORIES) {
		for (const item of $news.categories[category].items) {
			if (!seen.has(item.id)) {
				seen.add(item.id);
				allItems.push(item);
			}
		}
	}
	return allItems;
});

// Derived store for alerts (deduplicated by id)
export const alerts = derived(news, ($news) => {
	const seen = new Set<string>();
	const allAlerts: NewsItem[] = [];
	for (const category of NEWS_CATEGORIES) {
		for (const item of $news.categories[category].items) {
			if (item.isAlert && !seen.has(item.id)) {
				seen.add(item.id);
				allAlerts.push(item);
			}
		}
	}
	return allAlerts.sort((a, b) => b.timestamp - a.timestamp);
});

// Derived store for loading state
export const isLoading = derived(news, ($news) =>
	NEWS_CATEGORIES.some((cat) => $news.categories[cat].loading)
);

// Derived store for any errors
export const hasErrors = derived(news, ($news) =>
	NEWS_CATEGORIES.some((cat) => $news.categories[cat].error !== null)
);
