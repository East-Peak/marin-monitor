// src/lib/config/wine.ts

import type { WineCategory } from '$lib/types/wine';

/** Blob storage key */
export const WINE_INDEX_BLOB_KEY = 'marin-wine-index.json';

/** Max history entries (52 weeks = 1 year at weekly cadence) */
export const MAX_WINE_HISTORY = 52;

/** PlumpJack Shopify storefront base URL */
export const PLUMPJACK_BASE_URL = 'https://plumpjackwines.com';

/** Timeout for Shopify API requests (ms) */
export const SHOPIFY_FETCH_TIMEOUT = 15000;

/** Max products per page (Shopify limit) */
export const SHOPIFY_PAGE_LIMIT = 250;

/** Wine accent color (deep purple/wine) */
export const WINE_ACCENT = '#7c3aed';

/** Wine accent color with transparency for area fills */
export const WINE_ACCENT_FILL = 'rgba(124, 58, 237, 0.1)';

/** Collection configuration for median price tracking */
export interface WineCollectionConfig {
	/** Shopify collection handle (URL slug) */
	handle: string;
	/** Which category this maps to */
	category: WineCategory;
	/** Human-readable label */
	label: string;
}

/** Collections used for index median computation */
export const WINE_INDEX_COLLECTIONS: WineCollectionConfig[] = [
	{
		handle: 'napa-and-sonoma-wines',
		category: 'napa-sonoma',
		label: 'Napa/Sonoma Cab'
	},
	{
		handle: 'burgundy',
		category: 'burgundy',
		label: 'Burgundy'
	},
	{
		handle: 'champagne',
		category: 'champagne',
		label: 'Champagne'
	}
];

/** Collection handles for bottle listings (not used for median computation) */
export const WINE_LISTING_COLLECTIONS = {
	staffPicks: 'staff-picks',
	allocated: 'allocated-wines'
} as const;

/** Category display order */
export const WINE_CATEGORY_ORDER: WineCategory[] = ['napa-sonoma', 'burgundy', 'champagne'];
