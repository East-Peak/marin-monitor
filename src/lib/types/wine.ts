// src/lib/types/wine.ts

/** A single wine product from the Shopify API */
export interface WineProduct {
	/** Shopify product ID */
	id: number;
	title: string;
	handle: string;
	vendor: string;
	product_type: string;
	/** First variant price as a number */
	price: number;
	/** Compare-at price (original price if on sale), null if not on sale */
	compareAtPrice: number | null;
	/** Whether the first variant is in stock */
	available: boolean;
	/** Product tags from Shopify (grape variety, region, etc.) */
	tags: string[];
}

/** Wine category identifiers for index tracking */
export type WineCategory = 'napa-sonoma' | 'burgundy' | 'champagne';

/** A point-in-time snapshot of a single wine category */
export interface WineCategorySnapshot {
	category: WineCategory;
	/** Human-readable category label */
	label: string;
	/** Number of products in this collection */
	productCount: number;
	/** Median price across all products in the collection */
	medianPrice: number | null;
	/** Week-over-week change in median price (computed client-side from history) */
	minPrice: number | null;
	maxPrice: number | null;
}

/** A staff pick or allocated wine for the bottle listing */
export interface WineStaffPick {
	id: number;
	title: string;
	handle: string;
	vendor: string;
	price: number;
	compareAtPrice: number | null;
	available: boolean;
	/** Which listing this came from */
	listingType: 'staff-pick' | 'allocated';
}

/** Full snapshot of all wine index data at a point in time */
export interface WineSnapshot {
	timestamp: string;
	lastSuccessfulScrapeAt?: string | null;
	/** Category median snapshots */
	categories: WineCategorySnapshot[];
	/** Staff picks bottle listing */
	staffPicks: WineStaffPick[];
	/** Allocated/limited wines listing */
	allocatedWines: WineStaffPick[];
}

/** Top-level Blob shape (mirrors CoffeeData pattern) */
export interface WineIndexData {
	current: WineSnapshot | null;
	/** History entries store categories only (no bottle listings) to keep size small */
	history: Array<{
		timestamp: string;
		categories: WineCategorySnapshot[];
	}>;
}
