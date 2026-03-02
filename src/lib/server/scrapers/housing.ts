/**
 * Server-side housing data scraper.
 * Ported from scripts/extract-housing.mjs — fetches Redfin TSV via HTTP instead of stdin pipe.
 */
import { gunzipSync } from 'node:zlib';
import type { HousingMetric } from '$lib/api/marin/housing';

const REDFIN_URL =
	'https://redfin-public-data.s3-us-west-2.amazonaws.com/redfin_market_tracker/county_market_tracker.tsv000.gz';

export async function scrapeHousing(): Promise<HousingMetric[]> {
	const response = await fetch(REDFIN_URL, {
		headers: { 'User-Agent': 'Mozilla/5.0' }
	});
	if (!response.ok) {
		throw new Error(`Redfin fetch failed: ${response.status}`);
	}

	const compressed = Buffer.from(await response.arrayBuffer());
	const decompressed = gunzipSync(compressed).toString('utf-8');

	const lines = decompressed.split('\n');
	if (lines.length === 0) throw new Error('Empty TSV from Redfin');

	const headers = lines[0].split('\t').map((c) => c.replace(/^"|"$/g, ''));

	interface Row {
		[key: string]: string;
	}

	const rows: Row[] = [];
	for (let i = 1; i < lines.length; i++) {
		if (!lines[i].trim()) continue;
		const cols = lines[i].split('\t').map((c) => c.replace(/^"|"$/g, ''));
		const row: Row = {};
		headers.forEach((h, idx) => (row[h] = cols[idx]));
		if (row.REGION === 'Marin County, CA' && row.PROPERTY_TYPE === 'All Residential') {
			rows.push(row);
		}
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
