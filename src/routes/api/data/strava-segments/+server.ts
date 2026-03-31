import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { STRAVA_SEGMENTS_BLOB } from '$lib/config/strava';
import {
	mergeCatalogWithFallback,
	readLocalCuratedCatalog
} from '$lib/server/scrapers/strava-segments';
import type { StravaSegmentCatalog } from '$lib/types/strava';
import type { RequestHandler } from './$types';

async function readBlobCatalog(): Promise<StravaSegmentCatalog | null> {
	try {
		const blob = await head(STRAVA_SEGMENTS_BLOB, {
			token: env.BLOB_READ_WRITE_TOKEN
		});
		const response = await fetchWithTimeout(
			blob.downloadUrl,
			{
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			},
			8000
		);
		if (!response.ok) {
			return null;
		}

		return (await response.json()) as StravaSegmentCatalog;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async () => {
	const blobCatalog = await readBlobCatalog();
	const localCatalog = readLocalCuratedCatalog();
	const catalog = mergeCatalogWithFallback(blobCatalog, localCatalog);
	const hasFallbackData = Boolean(blobCatalog || localCatalog);

	return new Response(JSON.stringify(catalog), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': hasFallbackData
				? 'public, s-maxage=300, stale-while-revalidate=3600'
				: 'public, s-maxage=60'
		}
	});
};
