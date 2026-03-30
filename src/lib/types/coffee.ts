/** Source platform for scraping */
export type CoffeeSource = 'toast' | 'html' | 'delivery';
export type CoffeePriceSource = 'live' | 'hardcoded' | 'fallback' | 'unavailable';

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
