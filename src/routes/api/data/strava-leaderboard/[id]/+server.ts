import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { stravaLeaderboardBlob } from '$lib/config/strava';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const segmentId = parseInt(params.id, 10);
	if (!Number.isInteger(segmentId) || segmentId <= 0) {
		return new Response(JSON.stringify({ error: 'Invalid segment id' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const blob = await head(stravaLeaderboardBlob(segmentId), {
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

	return new Response(
		JSON.stringify({
			segmentId: 0,
			segmentName: '',
			cr: null,
			qom: null,
			rows: [],
			totalAttempts: 0,
			totalAthletes: 0,
			scrapedAt: ''
		}),
		{
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, s-maxage=60'
			}
		}
	);
};
