import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { buildSegmentCatalog } from '$lib/server/scrapers/strava-segments';
import { verifyCronAuth } from '$lib/server/cron-auth';
import {
	STRAVA_ENABLED,
	STRAVA_SEGMENTS_BLOB
} from '$lib/config/strava';
import type { RequestHandler } from './$types';
import type { StravaSegmentCatalog } from '$lib/types/strava';

export const config = { maxDuration: 60 };

/** Read a JSON blob by key, returning null if it doesn't exist or fails to parse. */
async function readBlob<T>(key: string): Promise<T | null> {
	try {
		const blob = await head(key, { token: env.BLOB_READ_WRITE_TOKEN });
		const res = await fetch(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	if (!STRAVA_ENABLED) {
		return new Response(JSON.stringify({ ok: false, error: 'Strava disabled' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const start = Date.now();
	try {
		// Read existing catalog to preserve polylines
		const existing = await readBlob<StravaSegmentCatalog>(STRAVA_SEGMENTS_BLOB);

		const catalog = await buildSegmentCatalog(existing);

		await put(STRAVA_SEGMENTS_BLOB, JSON.stringify(catalog), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		const segmentCount = catalog.segments.length;
		const withPolylines = catalog.segments.filter((s) => s.polyline !== null).length;

		// Check if env vars are present (for diagnostics)
		const hasOAuth = Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET && env.STRAVA_REFRESH_TOKEN);

		console.log(
			`[sync-strava-segments] OK: ${segmentCount} segments (${withPolylines} with polylines) hasOAuth=${hasOAuth} in ${Date.now() - start}ms`
		);
		return new Response(JSON.stringify({ ok: true, segmentCount, withPolylines, hasOAuth }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-strava-segments] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
