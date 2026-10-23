import { serveBlobJson } from '$lib/server/blob-endpoint';
import { GG_ALERTS_BLOB_KEY } from '$lib/server/gg-alerts/sync';
import type { RequestHandler } from './$types';

/** Golden Gate's alert list as sync-gg-alerts last wrote it (every 15 min; GGALERT1). */
export const GET: RequestHandler = () =>
	serveBlobJson({
		blobKey: GG_ALERTS_BLOB_KEY,
		successCacheControl: 'public, s-maxage=60, stale-while-revalidate=300'
	});
