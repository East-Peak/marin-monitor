import { put } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { scrapeHousing } from '$lib/server/scrapers/housing';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

export const GET: RequestHandler = async ({ request }) => {
	if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
		return new Response('Unauthorized', { status: 401 });
	}

	const data = await scrapeHousing();
	await put('marin-housing.json', JSON.stringify(data), {
		access: 'public',
		contentType: 'application/json',
		addRandomSuffix: false,
		token: env.BLOB_READ_WRITE_TOKEN
	});

	return new Response(JSON.stringify({ ok: true, count: data.length }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
