// src/lib/types/grocery.ts

/** A single item in the Bare Essentials basket */
export interface BasketItem {
	id: string;
	name: string;
	/** Size/quantity descriptor, e.g. "12 ct", "64 fl oz" */
	size: string;
	/** Search term used for Instacart search */
	searchTerm: string;
	/** Reference price from initial research (anchor store) */
	referencePrice: number;
	/** Reference store name */
	referenceStore: string;
	/** Category for grouping in UI */
	category: 'produce' | 'dairy-alt' | 'protein' | 'pantry' | 'beverages' | 'supplements';
}

/** A price result from a single store for one item */
export interface ItemPriceResult {
	/** basket item id */
	itemId: string;
	/** store name from Instacart (e.g. "Sprouts", "Safeway") */
	store: string;
	/** price in dollars */
	price: number;
	/** product name as listed on Instacart */
	productName: string;
	/** whether this appears to be a sale price */
	onSale: boolean;
}

/** Price data for a single basket item across all stores */
export interface BasketItemPrices {
	itemId: string;
	itemName: string;
	cheapest: number | null;
	cheapestStore: string | null;
	mostExpensive: number | null;
	mostExpensiveStore: string | null;
	/** All store prices found */
	storePrices: ItemPriceResult[];
}

/** A single weekly snapshot of the full basket */
export interface GrocerySnapshot {
	timestamp: string;
	lastSuccessfulScrapeAt?: string | null;
	/** Total basket cost using cheapest store for each item */
	totalCheapest: number | null;
	/** Total basket cost at most expensive stores */
	totalExpensive: number | null;
	/** Number of items successfully priced */
	itemsFound: number;
	/** Per-item price data (included in current, omitted from history) */
	items: BasketItemPrices[];
}

/** Top-level data structure stored in Vercel Blob */
export interface GroceryBasketData {
	current: GrocerySnapshot | null;
	history: GrocerySnapshot[];
}
