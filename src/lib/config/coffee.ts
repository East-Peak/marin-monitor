import type { CoffeeDrinkId, CoffeeSource } from '$lib/types/coffee';
import {
	COFFEE_SHOPS_DATA,
	CAPPUCCINO_HARDCODED_PRICES,
	CAPPUCCINO_MIN_FRESH_LIVE_RATIO,
	CAPPUCCINO_USER_AGENT,
	COFFEE_INDEX_NAME_DATA,
	COFFEE_PRIMARY_DRINK_ID,
	COFFEE_INDEX_DRINKS_DATA,
	COFFEE_INDEX_FALLBACK_PRICES,
	COFFEE_INDEX_MIN_FRESH_LIVE_MENU_RATIO
} from './coffee.shared.js';

/** Blob storage key */
export const CAPPUCCINO_BLOB_KEY = 'marin-cappuccino.json';
export const COFFEE_INDEX_BLOB_KEY = 'marin-coffee-index.json';
export const COFFEE_INDEX_NAME = COFFEE_INDEX_NAME_DATA;
export const COFFEE_PRIMARY_DRINK: CoffeeDrinkId = COFFEE_PRIMARY_DRINK_ID;

/** Max history entries (52 weeks = 1 year at weekly cadence) */
export const MAX_CAPPUCCINO_HISTORY = 52;
export const MAX_COFFEE_INDEX_HISTORY = 52;

/** Scraping timeout per page (ms) — reduced from 30s for Vercel compatibility */
export const TOAST_PAGE_TIMEOUT = 15000;

/** Search term to find cappuccino on Toast menus */
export const CAPPUCCINO_SEARCH_TERM = 'cappuccino';

/** Shared browser UA for Toast scraping */
export { CAPPUCCINO_USER_AGENT };

/** Minimum live coverage required to mark a snapshot fresh */
export { CAPPUCCINO_MIN_FRESH_LIVE_RATIO };
export { COFFEE_INDEX_MIN_FRESH_LIVE_MENU_RATIO };

export interface CoffeeShopConfig {
	id: string;
	name: string;
	address: string;
	town: string;
	lat: number;
	lon: number;
	source: CoffeeSource;
	url: string;
	hasCappuccino: boolean;
	altDrink?: string;
	supportsLivePriceScrape?: boolean;
	fallbackReason?: string;
}

export interface CoffeeDrinkConfig {
	id: CoffeeDrinkId;
	label: string;
	aliases: string[];
	excludeTerms?: string[];
}

export const COFFEE_SHOPS = COFFEE_SHOPS_DATA as CoffeeShopConfig[];
export const CAPPUCCINO_HARDCODED_PRICE_MAP: Record<
	string,
	{ price: number | null; altPrice?: number; source: string }
> = CAPPUCCINO_HARDCODED_PRICES;
export const COFFEE_INDEX_DRINKS = COFFEE_INDEX_DRINKS_DATA as CoffeeDrinkConfig[];
export const COFFEE_INDEX_FALLBACK_PRICE_MAP = COFFEE_INDEX_FALLBACK_PRICES as Record<
	string,
	Partial<Record<CoffeeDrinkId, number>>
>;

export const CAPPUCCINO_SHOPS = COFFEE_SHOPS.filter((s) => s.hasCappuccino);
export const TOAST_SHOPS = COFFEE_SHOPS.filter((s) => s.source === 'toast');
