import type { CoffeeSource } from '$lib/types/coffee';
import {
	COFFEE_SHOPS_DATA,
	CAPPUCCINO_HARDCODED_PRICES,
	CAPPUCCINO_MIN_FRESH_LIVE_RATIO,
	CAPPUCCINO_USER_AGENT
} from './coffee.shared.js';

/** Blob storage key */
export const CAPPUCCINO_BLOB_KEY = 'marin-cappuccino.json';

/** Max history entries (52 weeks = 1 year at weekly cadence) */
export const MAX_CAPPUCCINO_HISTORY = 52;

/** Scraping timeout per page (ms) — reduced from 30s for Vercel compatibility */
export const TOAST_PAGE_TIMEOUT = 15000;

/** Search term to find cappuccino on Toast menus */
export const CAPPUCCINO_SEARCH_TERM = 'cappuccino';

/** Shared browser UA for Toast scraping */
export { CAPPUCCINO_USER_AGENT };

/** Minimum live coverage required to mark a snapshot fresh */
export { CAPPUCCINO_MIN_FRESH_LIVE_RATIO };

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
}

export const COFFEE_SHOPS = COFFEE_SHOPS_DATA as CoffeeShopConfig[];
export const CAPPUCCINO_HARDCODED_PRICE_MAP: Record<
	string,
	{ price: number | null; altPrice?: number; source: string }
> = CAPPUCCINO_HARDCODED_PRICES;

export const CAPPUCCINO_SHOPS = COFFEE_SHOPS.filter((s) => s.hasCappuccino);
export const TOAST_SHOPS = COFFEE_SHOPS.filter((s) => s.source === 'toast');
