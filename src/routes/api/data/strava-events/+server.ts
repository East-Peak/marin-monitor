import { STRAVA_EVENTS_BLOB } from '$lib/config/strava';
import { serveBlobJson } from '$lib/server/blob-endpoint';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	serveBlobJson({
		blobKey: STRAVA_EVENTS_BLOB,
		successCacheControl: 'public, s-maxage=300, stale-while-revalidate=600'
	});
