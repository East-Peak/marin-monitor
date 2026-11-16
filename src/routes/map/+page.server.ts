import type { ServerLoadEvent } from '@sveltejs/kit';
import { dashboardCacheControl } from '$lib/dashboard/cache';
import { readSnapshotForFirstPaint } from '$lib/server/news/first-paint';

/**
 * Explore mode (MAPX3): the shell plus the seeded news, read exactly as / reads it. The view,
 * layers and selection live in the URL's hash and query and apply after mount, so the HTML is
 * the same for everyone and caches like /; a failed read is never edge-cached.
 */
export async function load({ setHeaders }: ServerLoadEvent) {
	const snapshot = await readSnapshotForFirstPaint();
	setHeaders({ 'Cache-Control': dashboardCacheControl(snapshot !== null) });
	return { snapshot, renderedAt: Date.now() };
}
