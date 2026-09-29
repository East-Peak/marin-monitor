/**
 * Scheduled news producer (vercel.json: every 15 minutes).
 * GET /api/cron/produce-news — CRON_SECRET bearer auth.
 *
 * 200 published · 202 skipped (lease held) or superseded (lost the CAS) ·
 * 500 on an unexpected failure (generic body; detail in the function log).
 */
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { cronErrorResponse } from '$lib/server/cron-response';
import { boundedFetch } from '$lib/server/news/bounded-fetch';
import { runNewsProducer } from '$lib/server/news/producer';
import { createSnapshotStore } from '$lib/server/news/snapshot-store';
import { NEWS_ALLOWED_HOSTS, NEWS_SOURCES } from '$lib/server/news/sources';
import { vercelBlobApi } from '$lib/server/news/vercel-blob-api';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };
/** Whole-run budget, release included; leaves headroom under maxDuration for cold start and the response. */
const INVOCATION_BUDGET_MS = 50_000;

const FEED_HEADERS = {
	'User-Agent': 'Mozilla/5.0 (compatible; MarinMonitor/1.0; +https://marinmonitor.com)',
	Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5'
};

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const token = env.BLOB_READ_WRITE_TOKEN;
		if (!token) throw new Error('BLOB_READ_WRITE_TOKEN not set');
		const result = await runNewsProducer({
			sources: NEWS_SOURCES,
			store: createSnapshotStore(vercelBlobApi(token)),
			fetchFeed: (url, signal) =>
				boundedFetch(url, { allowedHosts: NEWS_ALLOWED_HOSTS, headers: FEED_HEADERS, signal }),
			now: Date.now,
			deadlineAt: start + INVOCATION_BUDGET_MS,
			runId: randomUUID()
		});
		console.log(`[produce-news] ${JSON.stringify(result)}`);
		return new Response(JSON.stringify(result), {
			status: result.outcome === 'published' ? 200 : 202,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	} catch (err) {
		return cronErrorResponse('produce-news', err, start);
	}
};
