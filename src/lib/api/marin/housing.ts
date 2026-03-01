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

export interface HousingMetric {
	month: string;
	medianPrice: number | null;
	medianPpsf: number | null;
	inventory: number | null;
	daysOnMarket: number | null;
	homesSold: number | null;
}

/**
 * Fetch Marin County housing market data from static JSON.
 * Returns the last 12 months of data.
 */
export async function fetchHousingData(): Promise<HousingMetric[]> {
	try {
		logger.log('Housing', 'Loading housing data from static/data/marin-housing.json');

		const response = await fetch('/data/marin-housing.json');
		if (!response.ok) {
			throw new Error(`Housing data fetch failed: ${response.status}`);
		}

		const data: HousingMetric[] = await response.json();

		// Return last 12 months
		return data.slice(-12);
	} catch (error) {
		logger.warn('Housing', `Housing data fetch failed: ${(error as Error).message}`);
		return [];
	}
}
