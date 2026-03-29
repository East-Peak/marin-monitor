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

// ---- Hardcoded baseline data for fallback when Shopify blocks datacenter IPs ----

/** A baseline wine product used when the Shopify API is unreachable */
export interface BaselineWineProduct {
	title: string;
	price: number;
	vendor: string;
}

/** Baseline products per category — real PlumpJack prices (March 2026) */
export const BASELINE_CATEGORY_PRODUCTS: Record<WineCategory, BaselineWineProduct[]> = {
	'napa-sonoma': [
		{ title: 'Opus One 2022', price: 519.99, vendor: 'Opus One' },
		{ title: 'Silver Oak Napa Valley Cabernet Sauvignon 2020', price: 177.99, vendor: 'Silver Oak' },
		{ title: 'Caymus Napa Valley Cabernet Sauvignon', price: 92.99, vendor: 'Caymus' },
		{ title: 'Silver Oak Alexander Valley Cabernet Sauvignon 2020', price: 86.99, vendor: 'Silver Oak' },
		{ title: 'Duckhorn Napa Valley Merlot', price: 57.99, vendor: 'Duckhorn' }
	],
	'burgundy': [
		{ title: 'Burgundy Baseline Median', price: 52.00, vendor: 'Baseline' }
	],
	'champagne': [
		{ title: 'Champagne Baseline Median', price: 65.00, vendor: 'Baseline' }
	]
};

/** Pre-computed baseline medians for each category */
export const BASELINE_CATEGORY_MEDIANS: Record<WineCategory, number> = {
	'napa-sonoma': 78,
	'burgundy': 52,
	'champagne': 65
};

/** Baseline staff picks — real PlumpJack selections (March 2026) */
export const BASELINE_STAFF_PICKS: BaselineWineProduct[] = [
	{ title: 'Lelarge-Pugeot Tradition NV Champagne', price: 66, vendor: 'Lelarge-Pugeot' },
	{ title: 'Cameron Winery Dundee Hills Pinot Noir', price: 45, vendor: 'Cameron Winery' },
	{ title: 'Vinca Minor Mariah Vineyard Chardonnay', price: 50, vendor: 'Vinca Minor' },
	{ title: 'Peterson Zero Manipulation Red Blend', price: 22, vendor: 'Peterson' },
	{ title: 'Horus "Sol e Terra" Frappato', price: 25, vendor: 'Horus' }
];

/** Baseline allocated wines — real PlumpJack selections (March 2026) */
export const BASELINE_ALLOCATED_WINES: BaselineWineProduct[] = [
	{ title: 'Quintarelli Amarone 2017', price: 463, vendor: 'Quintarelli' },
	{ title: 'Dominus 2019', price: 400, vendor: 'Dominus' },
	{ title: 'Ridge Montebello 2021', price: 300, vendor: 'Ridge' },
	{ title: 'Kosta Browne Russian River Pinot Noir 2023', price: 121, vendor: 'Kosta Browne' },
	{ title: 'Paolo Bea Sagrantino 2018', price: 128, vendor: 'Paolo Bea' }
];
