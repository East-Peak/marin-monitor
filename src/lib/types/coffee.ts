/** Source platform for scraping */
export type CoffeeSource = 'toast' | 'html' | 'delivery';
export type CoffeePriceSource = 'live' | 'hardcoded' | 'fallback' | 'unavailable';
export type CoffeeDrinkId = 'cappuccino' | 'latte' | 'flat_white' | 'house_coffee' | 'pour_over';

/** A single coffee shop with its current cappuccino price */
export interface CoffeeShop {
	id: string;
	name: string;
	address: string;
	town: string;
	lat: number;
	lon: number;
	price: number | null;
	source: CoffeeSource;
	/** For shops without cappuccino (e.g., Philz pour-over only) */
	altDrink?: string;
	altPrice?: number;
	priceSource?: CoffeePriceSource;
	isStale?: boolean;
	updateTime: string;
}

/** A point-in-time snapshot of all coffee shops */
export interface CoffeeSnapshot {
	timestamp: string;
	lastSuccessfulScrapeAt?: string | null;
	shopCount: number;
	pricedShopCount?: number | null;
	liveShopCount?: number | null;
	fallbackShopCount?: number | null;
	hardcodedShopCount?: number | null;
	medianPrice: number | null;
	avgPrice: number | null;
	minPrice: number | null;
	maxPrice: number | null;
	shops: CoffeeShop[];
}

/** Top-level Blob shape (mirrors GasPriceData) */
export interface CoffeeData {
	current: CoffeeSnapshot | null;
	history: CoffeeSnapshot[];
}

/** A single tracked drink quote for a shop in the generic coffee index. */
export interface CoffeeDrinkPrice {
	drinkId: CoffeeDrinkId;
	label: string;
	price: number;
	priceSource: CoffeePriceSource;
	updateTime: string;
	isStale?: boolean;
	matchedName?: string | null;
}

/** A single shop with a multi-drink menu snapshot. */
export interface CoffeeIndexShop {
	id: string;
	name: string;
	address: string;
	town: string;
	lat: number;
	lon: number;
	source: CoffeeSource;
	prices: Partial<Record<CoffeeDrinkId, CoffeeDrinkPrice>>;
}

/** Aggregate statistics for one tracked drink across all shops. */
export interface CoffeeDrinkSummary {
	drinkId: CoffeeDrinkId;
	label: string;
	pricedShopCount: number;
	liveShopCount: number;
	fallbackShopCount: number;
	hardcodedShopCount: number;
	medianPrice: number | null;
	avgPrice: number | null;
	minPrice: number | null;
	maxPrice: number | null;
}

export type CoffeeDrinkSummaryMap = Record<CoffeeDrinkId, CoffeeDrinkSummary>;

/** Current generic coffee index snapshot, with a configurable headline metric. */
export interface CoffeeIndexSnapshot {
	timestamp: string;
	lastSuccessfulScrapeAt?: string | null;
	indexName: string;
	primaryDrink: CoffeeDrinkId;
	shopCount: number;
	pricedShopCount: number;
	liveMenuShopCount: number;
	liveMenuEligibleShopCount: number;
	fallbackMenuShopCount: number;
	hardcodedMenuShopCount: number;
	primaryDrinkSummary: CoffeeDrinkSummary;
	drinks: CoffeeDrinkSummaryMap;
	shops: CoffeeIndexShop[];
}

/** History entries omit the per-shop menu payload to keep the blob compact. */
export interface CoffeeIndexHistoryEntry {
	timestamp: string;
	lastSuccessfulScrapeAt?: string | null;
	indexName: string;
	primaryDrink: CoffeeDrinkId;
	shopCount: number;
	pricedShopCount: number;
	liveMenuShopCount: number;
	liveMenuEligibleShopCount: number;
	fallbackMenuShopCount: number;
	hardcodedMenuShopCount: number;
	primaryDrinkSummary: CoffeeDrinkSummary;
	drinks: CoffeeDrinkSummaryMap;
}

export interface CoffeeIndexData {
	current: CoffeeIndexSnapshot | null;
	history: CoffeeIndexHistoryEntry[];
}
