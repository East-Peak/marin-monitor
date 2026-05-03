import { WINE_INDEX_BLOB_KEY } from '$lib/config/wine';
import { serveBlobJson } from '$lib/server/blob-endpoint';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	serveBlobJson({
		blobKey: WINE_INDEX_BLOB_KEY,
		successCacheControl: 'public, s-maxage=3600, stale-while-revalidate=7200'
	});
