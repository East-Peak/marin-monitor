#!/usr/bin/env node
/**
 * PG&E Schedule EV2's winter total bundled rates, the sheets' electricity and
 * home-charging lines (COSTDATA-1). A tariff is the rate in effect, so our
 * weekly check ages it; the sheet's own effective date rides along.
 */
import { PGE_EV2_URL, parsePgeEv2 } from './shared/published-prices.mjs';
import { get, pdfText, run, writePublished } from './shared/published-sync.mjs';

const BLOB_KEY = 'marin-pge-ev2.json';

run('sync-pge-ev2', async () => {
	const response = await get(PGE_EV2_URL);
	if (!response.ok) throw new Error(`${PGE_EV2_URL} returned ${response.status}`);
	const { effective, values } = parsePgeEv2(await pdfText(response));
	const day = new Date(`${effective}T00:00:00Z`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
	return writePublished(BLOB_KEY, {
		url: PGE_EV2_URL,
		period: `effective ${day}`,
		effective,
		values
	});
});
