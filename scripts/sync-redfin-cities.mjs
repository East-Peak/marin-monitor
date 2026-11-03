#!/usr/bin/env node
/**
 * Redfin's city medians for the three towns: the Cost pages' market trackers,
 * context only (COSTDATA Q3). all_cities.csv is ~1.1 GB, too big for a Vercel
 * function, so this streams it here and keeps the header and the towns' rows.
 * The measure is Redfin's: all residential, rolling 3 months, with its sale
 * count; its period end is what ages it.
 */
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { REDFIN_CITIES_URL, REDFIN_TOWNS, parseRedfinCities } from './shared/published-prices.mjs';
import { run, writePublished } from './shared/published-sync.mjs';

const BLOB_KEY = 'marin-redfin-cities.json';
const quoted = Object.keys(REDFIN_TOWNS).map((t) => `"${t}"`);

run('sync-redfin-cities', async () => {
	const response = await fetch(REDFIN_CITIES_URL, { signal: AbortSignal.timeout(900_000) });
	if (!response.ok || !response.body)
		throw new Error(`${REDFIN_CITIES_URL} returned ${response.status}`);
	const kept = [];
	for await (const line of createInterface({ input: Readable.fromWeb(response.body) })) {
		if (kept.length === 0 || quoted.some((q) => line.includes(q))) kept.push(line);
	}
	return writePublished(BLOB_KEY, { url: REDFIN_CITIES_URL, ...parseRedfinCities(kept) });
});
