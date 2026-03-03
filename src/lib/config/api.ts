/**
 * API Configuration — endpoints, keys, and proxy setup for Marin Monitor
 */

import { browser } from '$app/environment';

/**
 * Mapbox token for optional traffic congestion overlays (public — used client-side for map tiles)
 */
export const MAPBOX_TOKEN = browser
	? (import.meta.env?.VITE_MAPBOX_TOKEN ?? '')
	: (process.env.VITE_MAPBOX_TOKEN ?? '');

/**
 * API base URLs
 */
export const API_URLS = {
	nws: 'https://api.weather.gov',
	noaaTides: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter',
	usgsEarthquakes: 'https://earthquake.usgs.gov/fdsnws/event/1/query',
	airnow: 'https://www.airnowapi.org/aq/observation/latLong/current',
	marinOpenData: 'https://data.marincounty.gov/resource'
} as const;

/**
 * Check if we're in development mode
 */
const isDev = browser ? (import.meta.env?.DEV ?? false) : false;

/**
 * API request delays (ms) to avoid rate limiting
 */
export const API_DELAYS = {
	betweenCategories: 500,
	betweenRetries: 1000
} as const;

/**
 * Cache TTLs (ms)
 */
export const CACHE_TTLS = {
	weather: 15 * 60 * 1000, // 15 minutes
	news: 5 * 60 * 1000, // 5 minutes
	tides: 60 * 60 * 1000, // 1 hour (predictions don't change often)
	airQuality: 30 * 60 * 1000, // 30 minutes
	earthquakes: 5 * 60 * 1000, // 5 minutes
	housing: 6 * 60 * 60 * 1000, // 6 hours
	gasPrices: 4 * 60 * 60 * 1000, // 4 hours
	evCharging: 24 * 60 * 60 * 1000, // 24 hours
	default: 5 * 60 * 1000 // 5 minutes
} as const;

/**
 * Debug/logging configuration
 */
export const DEBUG = {
	enabled: isDev,
	logApiCalls: isDev,
	logCacheHits: false
} as const;

/**
 * Conditional logger — only logs in development
 */
export const logger = {
	log: (prefix: string, ...args: unknown[]) => {
		if (DEBUG.logApiCalls) {
			console.log(`[${prefix}]`, ...args);
		}
	},
	warn: (prefix: string, ...args: unknown[]) => {
		console.warn(`[${prefix}]`, ...args);
	},
	error: (prefix: string, ...args: unknown[]) => {
		console.error(`[${prefix}]`, ...args);
	}
};
