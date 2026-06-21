import { STRAVA_SEGMENTS_BLOB } from '$lib/config/strava';
import { blobErrorResponse, tryReadBlobText } from '$lib/server/blob-endpoint';
import {
	mergeCatalogWithFallback,
	readLocalCuratedCatalog
} from '$lib/server/scrapers/strava-segments';
import type { StravaSegmentCatalog } from '$lib/types/strava';
import type { RequestHandler } from './$types';

/**
 * Strava segment catalog endpoint.
 *
 * Composes two data sources:
 *   1. Live blob (`marin-strava-segments.json`) — refreshed by cron.
 *   2. Local curated catalog committed to the repo as a build-time fallback.
 *
 * On blob failure we still return 200 with the local fallback (and an
 * `X-Data-Source: local-fallback` header so callers can distinguish). Only
 * when BOTH the live blob and the local catalog are unavailable do we
 * surface 503 — matching the activity/housing/police-logs contract.
 */
export const GET: RequestHandler = async () => {
	const blob = await tryReadBlobText(STRAVA_SEGMENTS_BLOB);
	let blobCatalog: StravaSegmentCatalog | null = null;
	if (blob.ok) {
		try {
			blobCatalog = JSON.parse(blob.text) as StravaSegmentCatalog;
		} catch {
			// Treat parse failure as blob unavailable — fall through to local.
			blobCatalog = null;
		}
	}

	const localCatalog = readLocalCuratedCatalog();

	if (!blobCatalog && !localCatalog) {
		return blobErrorResponse(
			blob.ok
				? {
						error: 'blob_fetch_failed',
						message: 'Strava segments blob parse failed and no local catalog available',
						timestamp: new Date().toISOString(),
						blobKey: STRAVA_SEGMENTS_BLOB
					}
				: blob.error
		);
	}

	const catalog = mergeCatalogWithFallback(blobCatalog, localCatalog);
	const usedFallback = !blobCatalog && Boolean(localCatalog);

	return new Response(JSON.stringify(catalog), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
			...(usedFallback ? { 'X-Data-Source': 'local-fallback' } : {})
		}
	});
};
