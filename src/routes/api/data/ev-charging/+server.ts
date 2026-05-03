import { serveBlobJson } from '$lib/server/blob-endpoint';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	serveBlobJson({
		blobKey: 'marin-ev-charging.json',
		successCacheControl: 'public, s-maxage=900, stale-while-revalidate=1800'
	});
