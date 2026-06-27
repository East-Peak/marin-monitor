/**
 * Diagnostic endpoint: triggers all 5 cron scrapers sequentially and reports results.
 * Does NOT write to Blob — just tests if the scrapers work.
 * Protected by CRON_SECRET auth.
 */
import { verifyCronAuth } from '$lib/server/cron-auth';
import { scrapePolice } from '$lib/server/scrapers/police';
import { scrapeActivity } from '$lib/server/scrapers/activity';
import { scrapeHousing } from '$lib/server/scrapers/housing';
import { scrapeGasPrices } from '$lib/server/scrapers/gas-prices';
import { scrapeEvCharging } from '$lib/server/scrapers/ev-charging';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 300 };

interface CronResult {
	name: string;
	ok: boolean;
	count: number | null;
	durationMs: number;
	error?: string;
}

async function runScraper(
	name: string,
	fn: () => Promise<{ length: number } | Array<unknown>>
): Promise<CronResult> {
	const start = Date.now();
	try {
		const result = await fn();
		const count = Array.isArray(result) ? result.length : 0;
		return { name, ok: true, count, durationMs: Date.now() - start };
	} catch (err) {
		// Log the full error (incl. stack) server-side; return a generic message so
		// internal error strings are never echoed in the response (CodeQL stack-trace-exposure).
		console.error(
			`[run-all] ${name} FAILED after ${Date.now() - start}ms:`,
			err instanceof Error ? err : String(err)
		);
		return { name, ok: false, count: null, durationMs: Date.now() - start, error: 'sync failed' };
	}
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const totalStart = Date.now();
	const results: CronResult[] = [];

	results.push(await runScraper('police', scrapePolice));
	results.push(await runScraper('activity', scrapeActivity));
	results.push(await runScraper('housing', scrapeHousing));
	results.push(
		await runScraper('gas-prices', async () => {
			const snapshot = await scrapeGasPrices();
			return { length: snapshot.stationCount };
		})
	);
	results.push(
		await runScraper('ev-charging', async () => {
			const snapshot = await scrapeEvCharging();
			return { length: snapshot.stationCount };
		})
	);

	const allOk = results.every((r) => r.ok);
	const summary = {
		ok: allOk,
		totalDurationMs: Date.now() - totalStart,
		results
	};

	for (const r of results) {
		if (r.ok) {
			console.log(`[run-all] ${r.name}: OK (${r.count} items, ${r.durationMs}ms)`);
		} else {
			console.error(`[run-all] ${r.name}: FAILED (${r.durationMs}ms)`);
		}
	}

	return new Response(JSON.stringify(summary, null, 2), {
		status: allOk ? 200 : 207,
		headers: { 'Content-Type': 'application/json' }
	});
};
