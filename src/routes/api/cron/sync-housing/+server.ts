import { put } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeHousing } from '$lib/server/scrapers/housing';
import { verifyCronAuth } from '$lib/server/cron-auth';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 120 };

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const data = await scrapeHousing();
		await put('marin-housing.json', JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log(`[sync-housing] OK: ${data.length} items in ${Date.now() - start}ms`);
		return new Response(JSON.stringify({ ok: true, count: data.length }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-housing] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
