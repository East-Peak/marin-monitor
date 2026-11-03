#!/usr/bin/env node
/**
 * USDA's monthly Cost of Food report: the Liberal plan's monthly cost per
 * age-sex group, the sheets' grocery lines (COSTDATA-1). Month M's report is
 * issued mid M+1, so this tries last month's, then the two before, and keeps
 * the newest that exists. Its period is the report's month, never our read.
 */
import { parseUsdaCostOfFood, usdaReportUrl } from './shared/published-prices.mjs';
import { get, pdfText, run, writePublished } from './shared/published-sync.mjs';

const BLOB_KEY = 'marin-usda-food-plans.json';

run('sync-usda-food-plans', async () => {
	const now = new Date();
	for (let back = 1; back <= 3; back++) {
		const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
		const url = usdaReportUrl(d.getUTCFullYear(), d.getUTCMonth() + 1);
		const response = await get(url);
		if (response.status === 404) continue;
		if (!response.ok) throw new Error(`${url} returned ${response.status}`);
		const report = parseUsdaCostOfFood(await pdfText(response));
		const expected = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
		if (report.period !== expected) throw new Error(`${url} is the ${report.period} report`);
		return writePublished(BLOB_KEY, { url, ...report });
	}
	throw new Error('no USDA Cost of Food report in the last three months');
});
