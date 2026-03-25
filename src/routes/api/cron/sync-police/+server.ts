import { put } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapePolice } from '$lib/server/scrapers/police';
import { verifyCronAuth } from '$lib/server/cron-auth';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 120 };

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const items = await scrapePolice();
		await put('marin-police-logs.json', JSON.stringify(items), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log(`[sync-police] OK: ${items.length} items in ${Date.now() - start}ms`);
		return new Response(JSON.stringify({ ok: true, count: items.length }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-police] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
