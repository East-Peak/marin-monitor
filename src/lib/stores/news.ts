/**
 * News store - manages news data across all Marin categories
 */

import { writable, derived, get } from 'svelte/store';
import type { NewsItem, NewsCategory } from '$lib/types';
import { containsAlertKeyword, detectTown, detectTopics } from '$lib/config';
import { isLocallyRelevant } from '$lib/config/relevance';
import { isActiveAlert } from '$lib/news/alert-status';
import { compareByTimestamp } from '$lib/news/order';
import { collapseStoryCopies } from '$lib/news/identity';
import { claimSharedStores, mayWrite, type StoreClaim } from './ownership';

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
	'satire',
	'311'
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

/** Re-read on every store change, so a kept alert ages out through failed refreshes too. */
const activeNow = (item: NewsItem) => isActiveAlert(item, Date.now());

// Enrich news item with town detection and alert keywords
function enrichNewsItem(item: NewsItem): NewsItem {
	const fullText = `${item.title} ${item.description || ''} ${item.content || ''}`;
	// A keyword says what a story is about, never that it's an alert (alert-status.ts). Only
	// the TITLE: description/content matches are too noisy ("wildfire" in a landscaping article).
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
		isAlert: isActiveAlert(item, Date.now()),
		alertKeyword: alertResult.isAlert ? alertResult.keyword : undefined,
		town: item.town ?? townResult?.name,
		townSlug: item.townSlug ?? townResult?.slug,
		topics: item.topics ?? detectTopics(fullText)
	};
}

// Create the store
function createNewsStore() {
	const { subscribe, set, update } = writable<NewsState>(createInitialState());

	return {
		subscribe,

		/**
		 * Initialize store
		 */
		init() {
			update((state) => ({ ...state, initialized: true }));
		},

		/**
		 * Set error state for a category
		 */
		setError(category: NewsCategory, error: string | null) {
			if (!mayWrite(undefined)) return;
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
		 * Set items for a category. `keep` decides which enriched items stay;
		 * the default is the local-relevance rule. A caller whose items were
		 * already judged elsewhere passes its own: the server producer applies
		 * the same rule with the article text the browser never sees.
		 */
		setItems(
			category: NewsCategory,
			items: NewsItem[],
			options: {
				keep?: (item: NewsItem) => boolean;
				owner?: symbol;
				observedAt?: number | null;
			} = {}
		) {
			if (!mayWrite(options.owner)) return;
			const keep = options.keep ?? isLocallyRelevant;
			const enrichedItems = items.map(enrichNewsItem).filter((item) => keep(item));

			update((state) => ({
				...state,
				categories: {
					...state.categories,
					[category]: {
						...state.categories[category],
						items: enrichedItems,
						loading: false,
						// Never implied (spec §13.2): the error stays until the owner clears it,
						// and the time is when the caller observed the data, or unknown.
						lastUpdated: options.observedAt ?? null
					}
				}
			}));
		},

		/**
		 * Append items to a category (for pagination)
		 */
		appendItems(
			category: NewsCategory,
			items: NewsItem[],
			options: { observedAt?: number | null } = {}
		) {
			if (!mayWrite(undefined)) return;
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
							lastUpdated: options.observedAt ?? null
						}
					}
				};
			});
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
				alerts.push(...state.categories[category].items.filter(activeNow));
			}
			return alerts.sort(compareByTimestamp);
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
			return items.sort(compareByTimestamp);
		},

		/**
		 * Clear a category
		 */
		clearCategory(category: NewsCategory) {
			if (!mayWrite(undefined)) return;
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
		 * Take the news and refresh stores exclusively (TV mount): clears the
		 * news store, and from now on only the returned token writes.
		 */
		claim(): StoreClaim {
			const claim = claimSharedStores();
			set(createInitialState());
			return claim;
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
export const threeOneOneNews = derived(news, ($news) => $news.categories['311']);

// Derived store for all news items — one entry per story (ids are
// source-scoped; copies of one story in several feeds are joined by article URL).
export const allNewsItems = derived(news, ($news) =>
	collapseStoryCopies(NEWS_CATEGORIES.flatMap((category) => $news.categories[category].items))
);

// Derived store for alerts (one entry per story)
export const alerts = derived(news, ($news) =>
	collapseStoryCopies(
		NEWS_CATEGORIES.flatMap((category) => $news.categories[category].items.filter(activeNow))
	).sort(compareByTimestamp)
);

// Derived store for loading state
export const isLoading = derived(news, ($news) =>
	NEWS_CATEGORIES.some((cat) => $news.categories[cat].loading)
);

// Derived store for any errors
export const hasErrors = derived(news, ($news) =>
	NEWS_CATEGORIES.some((cat) => $news.categories[cat].error !== null)
);
