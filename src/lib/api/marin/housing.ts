/**
 * Housing data adapter for Marin County
 *
 * Uses pre-extracted Redfin Data Center data stored as a static JSON file.
 * The source data comes from Redfin's national county_market_tracker.tsv000.gz,
 * filtered to Marin County "All Residential" and saved to static/data/marin-housing.json.
 *
 * To refresh: curl -s "https://...county_market_tracker.tsv000.gz" | gunzip | node scripts/extract-housing.mjs
 */

import { logger } from '$lib/config/api';
import type { DataSource, FetchResult } from './data-fetcher';
import { fetchWithTimeout } from './fetch-helpers';

export interface HousingMetric {
	month: string;
	medianPrice: number | null;
	medianPpsf: number | null;
	inventory: number | null;
	daysOnMarket: number | null;
	homesSold: number | null;
}

const FALLBACK: HousingMetric[] = [];
const KNOWN_DATA_SOURCES: ReadonlySet<DataSource> = new Set([
	'live',
	'static-fallback',
	'local-fallback',
	'legacy'
]);

function parseDataSource(headerValue: string | null): DataSource {
	if (headerValue && (KNOWN_DATA_SOURCES as Set<string>).has(headerValue)) {
		return headerValue as DataSource;
	}
	return 'live';
}

async function loadHousingResult(): Promise<FetchResult<HousingMetric[]>> {
	try {
		logger.log('Housing', 'Loading housing data from /api/data/housing');
		const response = await fetchWithTimeout('/api/data/housing');
		if (!response.ok) {
			const error = `HTTP ${response.status}`;
			logger.warn('Housing', `Housing data fetch failed: ${error}`);
			return { ok: false, error, fallback: FALLBACK };
		}
		const dataSource = parseDataSource(response.headers?.get('X-Data-Source') ?? null);
		if (dataSource !== 'live') {
			logger.warn('Housing', `Served from ${dataSource} (live blob unavailable)`);
		}
		const data: HousingMetric[] = await response.json();
		return { ok: true, data: data.slice(-12), dataSource };
	} catch (error) {
		const message = (error as Error).message;
		logger.warn('Housing', `Housing data fetch failed: ${message}`);
		return { ok: false, error: message, fallback: FALLBACK };
	}
}

/**
 * Fetch Marin County housing market data from static JSON.
 * Returns the last 12 months of data, or `[]` on any failure.
 */
export async function fetchHousingData(): Promise<HousingMetric[]> {
	const result = await loadHousingResult();
	return result.ok ? result.data : result.fallback;
}

/**
 * Fetch Marin County housing market data with status tagging.
 * Used by callers (e.g., TV wallboard) that need to know whether the fetch
 * actually succeeded or returned a fallback.
 */
export const fetchHousingDataWithStatus = loadHousingResult;
