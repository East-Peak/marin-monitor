import { CAPPUCCINO_BLOB_KEY } from '$lib/config/coffee';
import { serveBlobJson } from '$lib/server/blob-endpoint';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	serveBlobJson({
		blobKey: CAPPUCCINO_BLOB_KEY,
		successCacheControl: 'public, s-maxage=3600, stale-while-revalidate=7200'
	});
