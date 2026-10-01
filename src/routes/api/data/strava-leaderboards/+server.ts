import { STRAVA_LEADERBOARDS_BLOB } from '$lib/config/strava';
import { serveBlobJson } from '$lib/server/blob-endpoint';
import { stravaMothballed } from '$lib/server/strava-gate';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	stravaMothballed() ??
	serveBlobJson({
		blobKey: STRAVA_LEADERBOARDS_BLOB,
		successCacheControl: 'public, s-maxage=300, stale-while-revalidate=600',
		timeoutMs: 15000
	});
