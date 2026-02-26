/**
 * API Configuration — endpoints, keys, and proxy setup for Marin Monitor
 */

import { browser } from '$app/environment';

/**
 * AirNow API key (free tier)
 * Get your key at: https://docs.airnowapi.org/account/request/
 */
export const AIRNOW_API_KEY = browser
	? (import.meta.env?.VITE_AIRNOW_API_KEY ?? '')
	: (process.env.VITE_AIRNOW_API_KEY ?? '');

/**
 * Strava API credentials (free tier, rate limited)
 * Create app at: https://www.strava.com/settings/api
 */
export const STRAVA_CLIENT_ID = browser
	? (import.meta.env?.VITE_STRAVA_CLIENT_ID ?? '')
	: (process.env.VITE_STRAVA_CLIENT_ID ?? '');

export const STRAVA_CLIENT_SECRET = browser
	? (import.meta.env?.VITE_STRAVA_CLIENT_SECRET ?? '')
	: (process.env.VITE_STRAVA_CLIENT_SECRET ?? '');

/**
 * API base URLs
 */
export const API_URLS = {
	nws: 'https://api.weather.gov',
	noaaTides: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter',
	usgsEarthquakes: 'https://earthquake.usgs.gov/fdsnws/event/1/query',
	airnow: 'https://www.airnowapi.org/aq/observation/latLong/current',
	marinOpenData: 'https://data.marincounty.org/resource'
} as const;

/**
 * Check if we're in development mode
 */
const isDev = browser ? (import.meta.env?.DEV ?? false) : false;

/**
 * CORS proxy URLs for external API requests
 * TODO: Set up our own Cloudflare Worker proxy
 */
export const CORS_PROXIES = {
	primary: 'https://corsproxy.io/?url=',
	fallback: 'https://api.allorigins.win/raw?url='
} as const;

export const CORS_PROXY_URL = CORS_PROXIES.primary;

/**
 * Fetch with CORS proxy fallback
 * Tries primary proxy first, falls back to secondary on failure
 */
export async function fetchWithProxy(url: string): Promise<Response> {
	const encodedUrl = encodeURIComponent(url);

	// Try primary proxy first
	try {
		const response = await fetch(CORS_PROXIES.primary + encodedUrl);
		if (response.ok) {
			return response;
		}
		logger.warn('API', `Primary proxy failed (${response.status}), trying fallback`);
	} catch (error) {
		logger.warn('API', 'Primary proxy error, trying fallback:', error);
	}

	// Fallback to secondary proxy
	return fetch(CORS_PROXIES.fallback + encodedUrl);
}

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
