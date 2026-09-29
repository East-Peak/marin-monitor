// src/lib/server/scrapers/driveway.ts

import type {
	DrivewaySnapshot,
	MakeCount,
	FuelBreakdown,
	DrivewayFunStats,
	FuelType
} from '$lib/types/driveway';
import { withSuccessfulScrapeMetadata } from '$lib/server/scrape-metadata';
import {
	CKAN_API_BASE,
	DMV_PACKAGE_ID,
	DMV_REQUIRED_COLUMNS,
	DMV_FUEL_TYPE_MAP,
	MARIN_ZIPS,
	FUEL_TYPE_ORDER,
	MARIN_2024_TOTAL_VEHICLES,
	MARIN_TOTAL_TOLERANCE
} from '$lib/config/driveway';

type FetchLike = (input: string) => Promise<Response>;

interface CkanResource {
	id: string;
	name?: string;
	datastore_active?: boolean;
}

/** Yearly releases are named "1/1/2026 Vehicle Fuel Type Count by Zip Code". */
const RELEASE_NAME = /^1\/1\/(\d{4}) Vehicle Fuel Type Count by Zip Code$/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The newest yearly release. It must be queryable: falling back to last year's
 * release would publish old data as a fresh observation.
 */
export function selectNewestResource(resources: CkanResource[]): { id: string; year: number } {
	let newest: (CkanResource & { year: number }) | null = null;
	for (const resource of resources) {
		const match = RELEASE_NAME.exec(resource.name?.trim() ?? '');
		if (!match) continue;
		const year = Number(match[1]);
		if (!newest || year > newest.year) newest = { ...resource, year };
	}
	if (!newest) throw new Error(`${DMV_PACKAGE_ID}: no datastore resource`);
	if (!newest.datastore_active) throw new Error(`DMV ${newest.year} release is not queryable yet`);
	// The id is interpolated into SQL as a table name.
	if (!UUID.test(newest.id)) throw new Error(`DMV ${newest.year}: unexpected resource id`);
	return { id: newest.id, year: newest.year };
}

async function ckanResult<T>(fetchImpl: FetchLike, path: string): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30000);
	try {
		const response = await (fetchImpl as typeof fetch)(`${CKAN_API_BASE}/${path}`, {
			signal: controller.signal
		});
		if (!response.ok) throw new Error(`CKAN ${path.split('?')[0]}: HTTP ${response.status}`);
		const body = (await response.json()) as { success?: boolean; result?: T };
		if (!body.success || !body.result) throw new Error(`CKAN ${path.split('?')[0]}: success=false`);
		return body.result;
	} finally {
		clearTimeout(timeout);
	}
}

async function assertSchema(fetchImpl: FetchLike, resourceId: string): Promise<void> {
	const { fields } = await ckanResult<{ fields: Array<{ id: string }> }>(
		fetchImpl,
		`datastore_search?resource_id=${resourceId}&limit=0`
	);
	const present = new Set(fields.map((f) => f.id));
	const missing = DMV_REQUIRED_COLUMNS.filter((c) => !present.has(c));
	if (missing.length)
		throw new Error(`DMV resource ${resourceId} missing columns: ${missing.join(', ')}`);
}

/** Sum of "Vehicles" across Marin ZIPs, grouped by one column. */
async function sumBy(
	fetchImpl: FetchLike,
	resourceId: string,
	column: 'Make' | 'Fuel'
): Promise<Array<{ key: string; count: number }>> {
	const zips = MARIN_ZIPS.map((z) => `'${z}'`).join(',');
	const sql = `SELECT "${column}", SUM("Vehicles"::int) as total FROM "${resourceId}" WHERE "ZIP Code" IN (${zips}) GROUP BY "${column}" ORDER BY total DESC`;
	const { records } = await ckanResult<{ records: Array<Record<string, string | number>> }>(
		fetchImpl,
		`datastore_search_sql?sql=${encodeURIComponent(sql)}`
	);
	return records
		.map((r) => ({ key: String(r[column] ?? ''), count: parseInt(String(r['total']), 10) }))
		.filter((r) => r.key && !isNaN(r.count) && r.count > 0);
}

function toFuelBreakdown(rows: Array<{ key: string; count: number }>): FuelBreakdown[] {
	const counts = new Map<FuelType, number>();
	for (const { key, count } of rows) {
		const fuelType = DMV_FUEL_TYPE_MAP[key] ?? 'other';
		counts.set(fuelType, (counts.get(fuelType) ?? 0) + count);
	}
	const total = [...counts.values()].reduce((sum, c) => sum + c, 0);
	return FUEL_TYPE_ORDER.filter((ft) => counts.has(ft)).map((fuelType) => {
		const count = counts.get(fuelType)!;
		return { fuelType, count, pct: Math.round((count / total) * 10000) / 100 };
	});
}

/**
 * Extract fun stats from make counts and fuel breakdown.
 */
function extractFunStats(makes: MakeCount[], fuel: FuelBreakdown[]): DrivewayFunStats {
	const findMake = (name: string) =>
		makes.find((m) => m.make.toLowerCase() === name.toLowerCase())?.count ?? 0;
	const findFuel = (ft: FuelType) => fuel.find((f) => f.fuelType === ft)?.count ?? 0;

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
		BMW: 'BMW',
		GMC: 'GMC',
		MINI: 'MINI',
		RAM: 'RAM'
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
 * Compute a DrivewaySnapshot from the newest DMV release. Throws on any
 * failure (package, schema, query or an implausible total): the caller keeps
 * the last good blob and its real observation time rather than publishing
 * placeholder data as fresh.
 */
export async function computeDrivewaySnapshot(
	fetchImpl: FetchLike = fetch
): Promise<DrivewaySnapshot> {
	const { resources } = await ckanResult<{ resources: CkanResource[] }>(
		fetchImpl,
		`package_show?id=${DMV_PACKAGE_ID}`
	);
	const { id, year } = selectNewestResource(resources);
	await assertSchema(fetchImpl, id);

	const [makeRows, fuelRows] = await Promise.all([
		sumBy(fetchImpl, id, 'Make'),
		sumBy(fetchImpl, id, 'Fuel')
	]);
	const fuelBreakdown = toFuelBreakdown(fuelRows);
	const totalVehicles = fuelBreakdown.reduce((sum, f) => sum + f.count, 0);
	const drift = Math.abs(totalVehicles - MARIN_2024_TOTAL_VEHICLES) / MARIN_2024_TOTAL_VEHICLES;
	if (drift > MARIN_TOTAL_TOLERANCE) {
		throw new Error(`DMV ${year}: implausible Marin total ${totalVehicles}`);
	}

	// Exclude privacy-masked "OTHER/UNK" makes.
	const topMakes: MakeCount[] = makeRows
		.filter((r) => r.key.toUpperCase() !== 'OTHER/UNK')
		.map((r) => ({ make: titleCase(r.key), count: r.count }));

	if (topMakes.length === 0) throw new Error(`DMV ${year}: no makes in the Marin aggregate`);

	console.log(`[driveway] DMV ${year} (${id}): ${totalVehicles.toLocaleString()} vehicles`);
	return withSuccessfulScrapeMetadata({
		timestamp: new Date().toISOString(),
		dataYear: year,
		totalVehicles,
		topMakes: topMakes.slice(0, 20),
		fuelBreakdown,
		funStats: extractFunStats(topMakes, fuelBreakdown)
	});
}
