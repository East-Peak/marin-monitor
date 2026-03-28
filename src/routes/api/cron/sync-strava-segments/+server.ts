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
		// Diagnostic: also try one direct fetch to see if Strava API works from this runtime
		let diagResult = 'not run';
		try {
			// Direct token refresh test from this runtime
			const cid = env.STRAVA_CLIENT_ID;
			const cs = env.STRAVA_CLIENT_SECRET;
			const rt = env.STRAVA_REFRESH_TOKEN;
			const tr = await fetch('https://www.strava.com/oauth/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: `client_id=${cid}&client_secret=${cs}&grant_type=refresh_token&refresh_token=${rt}`
			});
			if (!tr.ok) {
				const tb = await tr.text();
				diagResult = `token_refresh: ${tr.status} — ${tb} — cid_len=${cid?.length} cs_len=${cs?.length} rt_len=${rt?.length}`;
			} else {
				const td = await tr.json() as Record<string, string>;
				const sr = await fetch('https://www.strava.com/api/v3/segments/229781', { headers: { Authorization: `Bearer ${td.access_token}` } });
				const sd = await sr.json() as Record<string, unknown>;
				const m = sd.map as Record<string, unknown> | undefined;
				diagResult = `token=ok segment=${sr.status} name=${sd.name} polyline=${m?.polyline ? 'yes' : 'no'}`;
			}
		} catch (e) {
			diagResult = `error: ${e instanceof Error ? e.message : String(e)}`;
		}

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
		return new Response(JSON.stringify({ ok: true, segmentCount, withPolylines, hasOAuth, diagResult }), {
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
