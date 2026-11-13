#!/usr/bin/env node
/**
 * SF-area grocery inflation (COSTDATA-2): BLS CPI-U food at home, San
 * Francisco area, through the public v1 API (no key). The blob holds the
 * series as BLS published it, one observation per reference month. Fetching
 * again never makes a new observation or refreshes an old period: the blob is
 * dated by its newest month. A failed read replaces the blob with a failure
 * marker, so the endpoint stops serving the last good figure as current. The index is context only and never enters a
 * household's dollars.
 */
import {
	BLS_SERIES_ID,
	BLS_SOURCE_URL,
	BLS_URL,
	blsRequestBody,
	parseBlsSeries
} from './shared/bls-series.mjs';
import { run, writeFailure, writePublished } from './shared/published-sync.mjs';

const BLOB_KEY = 'marin-bls-food-at-home.json';
const USER_AGENT = 'MarinMonitor/1.0 (+https://marinmonitor.com)';

run('sync-bls-food-at-home', async () => {
	try {
		return await sync();
	} catch (err) {
		await writeFailure(BLOB_KEY, BLS_SOURCE_URL, err).catch(() => {});
		throw err;
	}
});

async function sync() {
	const response = await fetch(BLS_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
		body: JSON.stringify(blsRequestBody(new Date())),
		signal: AbortSignal.timeout(60_000)
	});
	if (!response.ok) throw new Error(`${BLS_URL} returned ${response.status}`);
	const read = parseBlsSeries(await response.json());
	const current = await writePublished(BLOB_KEY, { url: BLS_SOURCE_URL, ...read });
	return {
		series: BLS_SERIES_ID,
		period: current.period,
		observations: read.observations.length,
		gaps: read.gaps.map((g) => g.period)
	};
}
