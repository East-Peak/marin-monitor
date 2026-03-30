// src/lib/server/scrapers/driveway.ts

import type { DrivewaySnapshot, MakeCount, FuelBreakdown, DrivewayFunStats, FuelType } from '$lib/types/driveway';
import {
	withPreservedSuccessfulScrapeMetadata,
	withSuccessfulScrapeMetadata
} from '$lib/server/scrape-metadata';
import {
	DMV_API_BASE,
	DMV_FUEL_TYPE_MAP,
	MARIN_ZIPS,
	FUEL_TYPE_ORDER,
	FALLBACK_DATA_YEAR,
	FALLBACK_TOP_MAKES,
	FALLBACK_FUEL_BREAKDOWN,
	FALLBACK_TOTAL_VEHICLES,
	FALLBACK_FUN_STATS
} from '$lib/config/driveway';

// DMV dataset resource ID -- "Vehicle Fuel Type Count by Zip Code"
// Discovered via: https://data.ca.gov/dataset/vehicle-fuel-type-count-by-zip-code
const RESOURCE_ID = '52a74e3a-6bc4-4068-a28c-c1a81e637811';

/** Build the ZIP IN clause for the SQL query */
function zipInClause(): string {
	return MARIN_ZIPS.map((z) => `'${z}'`).join(',');
}

interface DmvApiResult {
	success: boolean;
	result: {
		records: Array<Record<string, string | number>>;
	};
}

/**
 * Attempt to fetch the latest data year available from the DMV API.
 * Returns the most recent year that has data for Marin ZIPs.
 */
async function fetchLatestDataYear(): Promise<number | null> {
	const sql = `SELECT DISTINCT "Date" FROM "${RESOURCE_ID}" WHERE "Zip Code" IN (${zipInClause()}) ORDER BY "Date" DESC LIMIT 1`;
	const url = `${DMV_API_BASE}?sql=${encodeURIComponent(sql)}`;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	try {
		const response = await fetch(url, { signal: controller.signal });
		if (!response.ok) return null;
		const data = (await response.json()) as DmvApiResult;
		if (!data.success || !data.result.records.length) return null;

		const dateStr = String(data.result.records[0]['Date']);
		// Date field is typically "01/01/2024" or just "2024"
		const yearMatch = dateStr.match(/(\d{4})/);
		return yearMatch ? parseInt(yearMatch[1], 10) : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Fetch aggregated make counts from the DMV API for a given year.
 */
async function fetchMakeCounts(year: number): Promise<MakeCount[]> {
	const sql = `SELECT "Make", SUM("Number of Vehicles"::int) as total FROM "${RESOURCE_ID}" WHERE "Zip Code" IN (${zipInClause()}) AND "Date" LIKE '%${year}%' GROUP BY "Make" ORDER BY total DESC`;
	const url = `${DMV_API_BASE}?sql=${encodeURIComponent(sql)}`;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30000);
	try {
		const response = await fetch(url, { signal: controller.signal });
		if (!response.ok) throw new Error(`DMV make query failed: ${response.status}`);
		const data = (await response.json()) as DmvApiResult;
		if (!data.success) throw new Error('DMV API returned success=false');

		return data.result.records
			.filter((r) => {
				const make = String(r['Make'] ?? '');
				// Exclude privacy-masked "OTHER/UNK" entries
				return make && make !== 'OTHER/UNK' && make !== 'Other/Unk';
			})
			.map((r) => ({
				make: titleCase(String(r['Make'] ?? '')),
				count: parseInt(String(r['total']), 10)
			}))
			.filter((m) => !isNaN(m.count) && m.count > 0);
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Fetch aggregated fuel type counts from the DMV API for a given year.
 */
async function fetchFuelCounts(year: number): Promise<FuelBreakdown[]> {
	const sql = `SELECT "Fuel Type", SUM("Number of Vehicles"::int) as total FROM "${RESOURCE_ID}" WHERE "Zip Code" IN (${zipInClause()}) AND "Date" LIKE '%${year}%' GROUP BY "Fuel Type" ORDER BY total DESC`;
	const url = `${DMV_API_BASE}?sql=${encodeURIComponent(sql)}`;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30000);
	try {
		const response = await fetch(url, { signal: controller.signal });
		if (!response.ok) throw new Error(`DMV fuel query failed: ${response.status}`);
		const data = (await response.json()) as DmvApiResult;
		if (!data.success) throw new Error('DMV API returned success=false');

		const rawCounts: Array<{ fuelType: FuelType; count: number }> = [];

		for (const r of data.result.records) {
			const rawFuel = String(r['Fuel Type'] ?? '');
			const mappedType = DMV_FUEL_TYPE_MAP[rawFuel] ?? 'other';
			const count = parseInt(String(r['total']), 10);
			if (isNaN(count) || count <= 0) continue;

			const existing = rawCounts.find((c) => c.fuelType === mappedType);
			if (existing) {
				existing.count += count;
			} else {
				rawCounts.push({ fuelType: mappedType, count });
			}
		}

		const total = rawCounts.reduce((sum, c) => sum + c.count, 0);

		// Sort by FUEL_TYPE_ORDER, then build breakdowns with percentages
		return FUEL_TYPE_ORDER
			.map((ft) => {
				const entry = rawCounts.find((c) => c.fuelType === ft);
				if (!entry) return null;
				return {
					fuelType: ft,
					count: entry.count,
					pct: Math.round((entry.count / total) * 10000) / 100
				};
			})
			.filter((f): f is FuelBreakdown => f !== null);
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Extract fun stats from make counts and fuel breakdown.
 */
function extractFunStats(makes: MakeCount[], fuel: FuelBreakdown[]): DrivewayFunStats {
	const findMake = (name: string) =>
		makes.find((m) => m.make.toLowerCase() === name.toLowerCase())?.count ?? 0;
	const findFuel = (ft: FuelType) =>
		fuel.find((f) => f.fuelType === ft)?.count ?? 0;

	return {
		rivian: findMake('Rivian'),
		lucid: findMake('Lucid'),
		porsche: findMake('Porsche'),
		tesla: findMake('Tesla'),
		hydrogen: findFuel('hydrogen')
	};
}

/** Convert "TOYOTA" or "toyota" to "Toyota" */
function titleCase(s: string): string {
	// Handle common brand names that shouldn't be naively title-cased
	const brandMap: Record<string, string> = {
		'BMW': 'BMW',
		'GMC': 'GMC',
		'MINI': 'MINI',
		'RAM': 'RAM'
	};
	const upper = s.toUpperCase();
	if (brandMap[upper]) return brandMap[upper];
	return s
		.toLowerCase()
		.split(/[\s-]+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(upper.includes('-') ? '-' : ' ');
}

/**
 * Attempt to fetch live DMV data. Returns a snapshot or null on failure.
 */
async function fetchLiveDmvData(): Promise<DrivewaySnapshot | null> {
	try {
		const year = await fetchLatestDataYear();
		if (!year) {
			console.log('[driveway] Could not determine latest data year from DMV API');
			return null;
		}

		console.log(`[driveway] Fetching DMV data for year ${year}...`);

		const [makeCounts, fuelCounts] = await Promise.all([
			fetchMakeCounts(year),
			fetchFuelCounts(year)
		]);

		if (makeCounts.length === 0 || fuelCounts.length === 0) {
			console.log('[driveway] DMV API returned empty results');
			return null;
		}

		const totalVehicles = fuelCounts.reduce((sum, f) => sum + f.count, 0);
		const funStats = extractFunStats(makeCounts, fuelCounts);

		return withSuccessfulScrapeMetadata({
			timestamp: new Date().toISOString(),
			dataYear: year,
			totalVehicles,
			topMakes: makeCounts.slice(0, 20), // Keep top 20
			fuelBreakdown: fuelCounts,
			funStats
		});
	} catch (err) {
		console.warn('[driveway] Live DMV fetch failed:', err instanceof Error ? err.message : err);
		return null;
	}
}

/**
 * Compute a DrivewaySnapshot. Attempts live DMV API first, falls back to
 * hardcoded 2024 data if the API is unavailable or returns bad results.
 */
export async function computeDrivewaySnapshot(
	previous: DrivewaySnapshot | null = null
): Promise<DrivewaySnapshot> {
	// Try live API first
	const live = await fetchLiveDmvData();
	if (live) {
		console.log(`[driveway] Live data: ${live.totalVehicles.toLocaleString()} vehicles, year ${live.dataYear}`);
		return live;
	}

	// Fall back to hardcoded 2024 data
	console.log('[driveway] Using hardcoded 2024 fallback data');
	return withPreservedSuccessfulScrapeMetadata({
		timestamp: new Date().toISOString(),
		dataYear: FALLBACK_DATA_YEAR,
		totalVehicles: FALLBACK_TOTAL_VEHICLES,
		topMakes: FALLBACK_TOP_MAKES,
		fuelBreakdown: FALLBACK_FUEL_BREAKDOWN,
		funStats: FALLBACK_FUN_STATS
	}, {
		wasLive: false,
		previous
	});
}
