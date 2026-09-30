/**
 * The news snapshot read path: one bounded, validated Blob read → the public
 * view, or an honest failure. Shared by GET /api/news/snapshot (TV slice 3)
 * and, later, the dashboard's SSR preview (dashboard spec §13.11 #15).
 *
 * §13.2 / G0a mapping: no blob → unavailable; unreadable, invalid or
 * unsupported → unknown. A blob that fails parseNewsSnapshot, or whose public
 * view fails parseNewsSnapshotView (the browser's reader), is never served.
 *
 * Caching (vercel.com/docs/caching/cdn-cache, read 2026-09-29): browsers get a
 * Cache-Control that always revalidates; Vercel's CDN alone gets a TTL through
 * Vercel-CDN-Cache-Control, which is never returned to the browser. 503 is
 * not a cacheable status on Vercel, and failures say no-store regardless: in
 * an outage every TV poll reaches this function (stated, not hidden).
 */
import {
	parseNewsSnapshotView,
	toNewsSnapshotView,
	type NewsSnapshotResponse
} from '$lib/news/snapshot';
import { createSnapshotStore, type BlobApi } from './snapshot-store';

export const SNAPSHOT_READ_TIMEOUT_MS = 8_000;
export const SNAPSHOT_BROWSER_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
/** ~1 origin read per region per minute while a TV is open (best-effort; the producer publishes every 15 min). */
export const SNAPSHOT_CDN_CACHE_CONTROL = 'max-age=60, stale-while-revalidate=240';
export const SNAPSHOT_ERROR_CACHE_CONTROL = 'no-store';

export async function readNewsSnapshot(
	api: BlobApi | null,
	timeoutMs = SNAPSHOT_READ_TIMEOUT_MS
): Promise<NewsSnapshotResponse> {
	if (api === null) return { status: 'unknown', reason: 'not-configured' };
	try {
		const { snapshot, etag } = await createSnapshotStore(api).read(AbortSignal.timeout(timeoutMs));
		if (etag === null) return { status: 'unavailable', reason: 'missing' };
		// The view is held to the browser's reader too: the full reader cannot check
		// every public-view invariant, and a 200 the TVs reject would be cached.
		const view = snapshot && parseNewsSnapshotView(toNewsSnapshotView(snapshot));
		if (!view) return { status: 'unknown', reason: 'invalid' };
		return { status: 'ok', snapshot: view };
	} catch {
		return { status: 'unknown', reason: 'read-failed' };
	}
}

export function snapshotHttp(body: NewsSnapshotResponse): {
	status: number;
	headers: Record<string, string>;
} {
	return body.status === 'ok'
		? {
				status: 200,
				headers: {
					'Cache-Control': SNAPSHOT_BROWSER_CACHE_CONTROL,
					'Vercel-CDN-Cache-Control': SNAPSHOT_CDN_CACHE_CONTROL
				}
			}
		: { status: 503, headers: { 'Cache-Control': SNAPSHOT_ERROR_CACHE_CONTROL } };
}
