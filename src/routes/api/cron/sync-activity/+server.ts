import { put } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeActivity } from '$lib/server/scrapers/activity';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) => {
	if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
		return new Response('Unauthorized', { status: 401 });
	}

	try {
		const items = await scrapeActivity();
		await put('marin-activity.json', JSON.stringify(items), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		return new Response(JSON.stringify({ ok: true, count: items.length }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[sync-activity]', message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
