#!/usr/bin/env node
/**
 * Extract Marin County housing data from Redfin's national county file.
 * Run: curl -s ".../county_market_tracker.tsv000.gz" | gunzip | node scripts/extract-housing.mjs
 */
import { createInterface } from 'readline';
import { writeFileSync } from 'fs';

const rl = createInterface({ input: process.stdin });
const rows = [];
let headers;

rl.on('line', (line) => {
	const cols = line.split('\t').map((c) => c.replace(/^"|"$/g, ''));
	if (headers === undefined) {
		headers = cols;
		return;
	}
	const row = {};
	headers.forEach((h, i) => (row[h] = cols[i]));
	// Filter: Marin County, All Residential only
	if (row.REGION === 'Marin County, CA' && row.PROPERTY_TYPE === 'All Residential') {
		rows.push(row);
	}
});

rl.on('close', () => {
	rows.sort((a, b) => a.PERIOD_BEGIN.localeCompare(b.PERIOD_BEGIN));
	const recent = rows.slice(-24);
	const data = recent.map((r) => ({
		month: r.PERIOD_BEGIN,
		medianPrice: r.MEDIAN_SALE_PRICE ? parseFloat(r.MEDIAN_SALE_PRICE) : null,
		medianPpsf: r.MEDIAN_PPSF ? parseFloat(r.MEDIAN_PPSF) : null,
		inventory: r.INVENTORY ? parseInt(r.INVENTORY) : null,
		daysOnMarket: r.MEDIAN_DOM ? parseInt(r.MEDIAN_DOM) : null,
		homesSold: r.HOMES_SOLD ? parseInt(r.HOMES_SOLD) : null
	}));

	const outPath = 'static/data/marin-housing.json';
	writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');
	console.log(`Wrote ${data.length} months to ${outPath}`);
});
