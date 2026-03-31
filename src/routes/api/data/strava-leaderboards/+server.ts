import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { STRAVA_LEADERBOARDS_BLOB } from '$lib/config/strava';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const blob = await head(STRAVA_LEADERBOARDS_BLOB, {
			token: env.BLOB_READ_WRITE_TOKEN
		});
		const response = await fetchWithTimeout(
			blob.downloadUrl,
			{ headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` } },
			15000
		);
		if (response.ok) {
			return new Response(await response.text(), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
				}
			});
		}
	} catch {
		// Blob not available yet
	}

	return new Response(JSON.stringify({ leaderboards: {}, lastUpdated: '' }), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};
