import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { STRAVA_EVENTS_BLOB } from '$lib/config/strava';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const blob = await head(STRAVA_EVENTS_BLOB, {
			token: env.BLOB_READ_WRITE_TOKEN
		});
		const response = await fetchWithTimeout(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
		}, 8000);
		if (response.ok) {
			return new Response(await response.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
				}
			});
		}
	} catch {
		// Blob not available — return empty data
	}

	return new Response(JSON.stringify({ events: [], lastUpdated: '' }), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};
