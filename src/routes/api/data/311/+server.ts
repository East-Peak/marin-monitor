import { serveBlobJson } from '$lib/server/blob-endpoint';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	serveBlobJson({
		blobKey: 'marin-311.json',
		successCacheControl: 'public, s-maxage=300, stale-while-revalidate=3600'
	});
