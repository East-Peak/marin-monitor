import { stravaLeaderboardBlob } from '$lib/config/strava';
import { serveBlobJson } from '$lib/server/blob-endpoint';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const segmentId = parseInt(params.id, 10);
	if (!Number.isInteger(segmentId) || segmentId <= 0) {
		return Promise.resolve(
			new Response(JSON.stringify({ error: 'Invalid segment id' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		);
	}

	return serveBlobJson({
		blobKey: stravaLeaderboardBlob(segmentId),
		successCacheControl: 'public, s-maxage=300, stale-while-revalidate=600'
	});
};
