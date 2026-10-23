/**
 * Golden Gate's own alert list (vercel.json: every 15 minutes; GGALERT1).
 * GET /api/cron/sync-gg-alerts — CRON_SECRET bearer auth.
 *
 * 200 read and written · 502 the page read failed (the failure is written, the last good read
 * kept) · 202 superseded (another run wrote first) · 500 an unexpected failure (generic body).
 */
import { env } from '$env/dynamic/private';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { cronErrorResponse } from '$lib/server/cron-response';
import { runGgAlertsSync } from '$lib/server/gg-alerts/sync';
import { boundedFetch } from '$lib/server/news/bounded-fetch';
import { vercelBlobApi } from '$lib/server/news/vercel-blob-api';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 30 };
/** The page read has its own 10 s deadline (boundedFetch); this bounds the run, blob calls included. */
const RUN_BUDGET_MS = 25_000;
const STATUS = { read: 200, failed: 502, superseded: 202 } as const;

const PAGE_HEADERS = {
	'User-Agent': 'MarinMonitor/1.0 (+https://marinmonitor.com)',
	Accept: 'text/html'
};
const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['www.goldengate.org']);

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const token = env.BLOB_READ_WRITE_TOKEN;
		if (!token) throw new Error('BLOB_READ_WRITE_TOKEN not set');
		const result = await runGgAlertsSync({
			api: vercelBlobApi(token),
			fetchPage: (url, signal) =>
				boundedFetch(url, { allowedHosts: ALLOWED_HOSTS, headers: PAGE_HEADERS, signal }),
			now: () => new Date(),
			signal: AbortSignal.timeout(RUN_BUDGET_MS)
		});
		console.log(`[sync-gg-alerts] ${JSON.stringify(result)} in ${Date.now() - start}ms`);
		return new Response(JSON.stringify(result), {
			status: STATUS[result.outcome],
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	} catch (err) {
		return cronErrorResponse('sync-gg-alerts', err, start);
	}
};
