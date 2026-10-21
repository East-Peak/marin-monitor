/**
 * The Lifestyle Index (vercel.json: Mondays 14:30 UTC, after the old composite).
 * GET /api/cron/sync-lifestyle — CRON_SECRET bearer auth.
 *
 * 200 written · 202 superseded (lost the CAS) · 500 aborted (history
 * unreadable: nothing written) or an unexpected failure (generic body).
 */
import { env } from '$env/dynamic/private';
import { SHEETS } from '$lib/lifestyle/sheets';
import { tryReadBlobText } from '$lib/server/blob-endpoint';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { abortable } from '$lib/server/news/abortable';
import { cronErrorResponse } from '$lib/server/cron-response';
import { runLifestyle } from '$lib/server/lifestyle/producer';
import { vercelBlobApi } from '$lib/server/news/vercel-blob-api';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };
const BUDGET_MS = 50_000;

const STATUS = { written: 200, conflict: 202, aborted: 500 } as const;

/** A live input's JSON, or null; never outlives the run's deadline. */
async function readInput(key: string, signal: AbortSignal): Promise<unknown> {
	const read = await abortable(tryReadBlobText(key), signal);
	return read.ok ? JSON.parse(read.text) : null;
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const token = env.BLOB_READ_WRITE_TOKEN;
		if (!token) throw new Error('BLOB_READ_WRITE_TOKEN not set');
		const now = new Date(start);
		const result = await runLifestyle({
			api: vercelBlobApi(token),
			readInput,
			sheets: SHEETS,
			now,
			// One run a day: a retry of the same day's run replaces its entries.
			runId: now.toISOString().slice(0, 10),
			signal: AbortSignal.timeout(BUDGET_MS)
		});
		console.log(`[sync-lifestyle] ${JSON.stringify(result)} in ${Date.now() - start}ms`);
		return new Response(JSON.stringify(result), {
			status: STATUS[result.outcome],
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	} catch (err) {
		return cronErrorResponse('sync-lifestyle', err, start);
	}
};
