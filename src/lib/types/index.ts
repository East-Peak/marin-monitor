// Core data types for Marin Monitor

/**
 * Marin news/data categories
 */
export type NewsCategory =
	| 'local'
	| 'civic'
	| 'safety'
	| 'outdoors'
	| 'housing'
	| 'cycling'
	| 'endurance'
	| 'shows'
	| 'prep'
	| 'farm'
	| 'satire';

/**
 * Verification level for every story/item
 */
export type VerificationLevel = 'official' | 'local_media' | 'community' | 'satire';

/**
 * Map layer toggles
 */
export type MapLayer = 'civic' | 'news' | 'safety' | 'housing' | 'activity' | 'satire' | 'gas' | 'ev-charging' | 'coffee' | 'fitness';

export type { MapFeatureKind, MapFeatureInspectorData } from './map';

/**
 * A news item from any local source
 */
export interface NewsItem {
	id: string;
	title: string;
	link: string;
	pubDate?: string;
	timestamp: number;
	description?: string;
	content?: string;
	source: string;
	category: NewsCategory;
	verification: VerificationLevel;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	locationConfidence?: 'exact' | 'approx' | 'town';
	locationEvidence?: string;
	isAlert?: boolean;
	alertKeyword?: string;
	topics?: string[];
}

/**
 * RSS feed configuration
 */
export interface FeedConfig {
	name: string;
	url: string;
	category: NewsCategory;
	verification: VerificationLevel;
}

/**
 * Marin town definition
 */
export type MarinRegion =
	| 'Southern Marin'
	| 'Central Marin'
	| 'San Rafael'
	| 'Novato'
	| 'San Geronimo Valley'
	| 'West Marin';

export interface Town {
	name: string;
	slug: string;
	lat: number;
	lon: number;
	/** Approximate population */
	pop?: number;
	/** Whether this is an incorporated city */
	incorporated: boolean;
	/** ZIP codes associated with this town */
	zips?: string[];
	/** Geographic region within Marin County */
	region: MarinRegion;
}

/**
 * Weather data from NWS
 */
export interface WeatherData {
	temperature: number;
	temperatureUnit: string;
	windSpeed: string;
	windDirection: string;
	shortForecast: string;
	detailedForecast?: string;
	isDaytime: boolean;
	timestamp: number;
}

/**
 * Fire weather alert from NWS
 */
export interface FireWeatherAlert {
	id: string;
	event: string;
	headline: string;
	description: string;
	severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
	urgency: 'Immediate' | 'Expected' | 'Future' | 'Past' | 'Unknown';
	onset: string;
	expires: string;
	areaDesc: string;
}

/**
 * Air quality data from AirNow
 */
export interface AirQualityData {
	aqi: number;
	category: string;
	color: string;
	pollutant: string;
	timestamp: number;
}

/**
 * Tide data from NOAA
 */
export interface TideData {
	station: string;
	predictions: TidePrediction[];
}

export interface TidePrediction {
	time: string;
	height: number;
	type: 'H' | 'L'; // High or Low
}

/**
 * Earthquake data from USGS
 */
export interface EarthquakeData {
	id: string;
	magnitude: number;
	place: string;
	time: number;
	lat: number;
	lon: number;
	depth: number;
	url: string;
}


/**
 * Custom monitor created by user
 */
export interface CustomMonitor {
	id: string;
	name: string;
	keywords: string[];
	enabled: boolean;
	color?: string;
	town?: string;
	createdAt: number;
	updatedAt?: number;
	matchCount: number;
}

/**
 * Wastewater pathogen surveillance (Cal-SuWers)
 */
export interface WastewaterPathogen {
	id: string;
	label: string;
	status: 'high' | 'moderate' | 'low' | 'not-detected';
	latestConc: number | null;
	belowLod: boolean;
	trend: number[];
	trendDirection: 'rising' | 'falling' | 'stable';
	lastSampleDate: string;
}

export interface WastewaterData {
	pathogens: WastewaterPathogen[];
	sewershedCount: number;
	lastUpdated: string;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
	data: T;
	status: 'ok' | 'error';
	error?: string;
	cached?: boolean;
	timestamp: number;
}

/**
 * Refresh state
 */
export interface RefreshState {
	isRefreshing: boolean;
	stage: 0 | 1 | 2 | 3;
	lastUpdated: Date | null;
	error: string | null;
}

/**
 * Settings state
 */
export interface SettingsState {
	panels: Record<string, boolean>;
	panelOrder: string[];
	theme: 'dark' | 'light';
	enableVibes: boolean; // Toggle for satire/Marin Lately content
}

export type {
	StravaActivityType,
	StravaSegment,
	StravaRecordHolder,
	StravaLeaderboardRow,
	StravaLeaderboard,
	StravaEvent,
	StravaSegmentCatalog,
	StravaEventLog,
	StravaSeedSegment
} from './strava';

export type {
	CoffeeSource,
	CoffeeDrinkId,
	CoffeeShop,
	CoffeeSnapshot,
	CoffeeData,
	CoffeeDrinkPrice,
	CoffeeIndexShop,
	CoffeeDrinkSummary,
	CoffeeDrinkSummaryMap,
	CoffeeIndexSnapshot,
	CoffeeIndexHistoryEntry,
	CoffeeIndexData
} from './coffee';

export type {
	BasketItem,
	ItemPriceResult,
	BasketItemPrices,
	GrocerySnapshot,
	GroceryBasketData
} from './grocery';

export type {
	WineProduct,
	WineCategory,
	WineCategorySnapshot,
	WineStaffPick,
	WineSnapshot,
	WineIndexData
} from './wine';

export type {
	SchoolLevel,
	School,
	TuitionTier,
	SchoolSnapshot,
	SchoolIndexData
} from './school';

export type {
	FitnessType,
	FitnessStudio,
	FitnessSnapshot,
	FitnessData
} from './fitness';
