/**
 * Server-side housing data scraper.
 * Fetches Redfin TSV via HTTP and extracts Marin County housing metrics.
 * Uses streaming decompression to avoid loading the entire ~500MB file into memory.
 */
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { HousingMetric } from '$lib/api/marin/housing';

const REDFIN_URL =
	'https://redfin-public-data.s3-us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz';

export async function scrapeHousing(): Promise<HousingMetric[]> {
	const response = await fetchWithTimeout(
		REDFIN_URL,
		{
			headers: { 'User-Agent': 'Mozilla/5.0' }
		},
		30000
	);
	if (!response.ok) {
		throw new Error(`Redfin fetch failed: ${response.status}`);
	}
	if (!response.body) {
		throw new Error('Redfin response has no body');
	}

	const gunzip = createGunzip();
	// Pipe the compressed response stream through gunzip
	const readable = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
	const decompressed = readable.pipe(gunzip);

	const rl = createInterface({ input: decompressed });

	let headers: string[] | undefined;
	const rows: Record<string, string>[] = [];

	for await (const line of rl) {
		const cols = line.split('\t').map((c: string) => c.replace(/^"|"$/g, ''));
		if (headers === undefined) {
			headers = cols;
			continue;
		}
		// Early filter: only process Marin County rows to save memory
		// REGION is typically one of the first columns
		const regionIdx = headers.indexOf('REGION');
		const typeIdx = headers.indexOf('PROPERTY_TYPE');
		if (regionIdx >= 0 && cols[regionIdx] !== 'Marin County, CA') continue;
		if (typeIdx >= 0 && cols[typeIdx] !== 'All Residential') continue;

		const row: Record<string, string> = {};
		headers.forEach((h, i) => (row[h] = cols[i]));
		rows.push(row);
	}

	rows.sort((a, b) => a.PERIOD_BEGIN.localeCompare(b.PERIOD_BEGIN));
	const recent = rows.slice(-24);

	return recent.map((r) => ({
		month: r.PERIOD_BEGIN,
		medianPrice: r.MEDIAN_SALE_PRICE ? parseFloat(r.MEDIAN_SALE_PRICE) : null,
		medianPpsf: r.MEDIAN_PPSF ? parseFloat(r.MEDIAN_PPSF) : null,
		inventory: r.INVENTORY ? parseInt(r.INVENTORY) : null,
		daysOnMarket: r.MEDIAN_DOM ? parseInt(r.MEDIAN_DOM) : null,
		homesSold: r.HOMES_SOLD ? parseInt(r.HOMES_SOLD) : null
	}));
}
