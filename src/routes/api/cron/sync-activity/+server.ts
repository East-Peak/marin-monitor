import { put } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeActivity } from '$lib/server/scrapers/activity';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { cronErrorResponse } from '$lib/server/cron-response';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 120 };

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const items = await scrapeActivity();
		await put('marin-activity.json', JSON.stringify(items), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log(`[sync-activity] OK: ${items.length} items in ${Date.now() - start}ms`);
		return new Response(JSON.stringify({ ok: true, count: items.length }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return cronErrorResponse('sync-activity', err, start);
	}
};
