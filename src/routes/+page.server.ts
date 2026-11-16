import type { ServerLoadEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dashboardCacheControl } from '$lib/dashboard/cache';
import { lifestyleOn } from '$lib/server/lifestyle/read';
import { readSnapshotForFirstPaint } from '$lib/server/news/first-paint';
import { readAdvisoriesForFirstPaint } from '$lib/server/advisories/first-paint';

export async function load({ setHeaders }: ServerLoadEvent) {
	// News and advisories arrive in the HTML when they read in time (MOBILE1 for advisories);
	// otherwise the client loads them.
	const [snapshot, advisories] = await Promise.all([
		readSnapshotForFirstPaint(),
		readAdvisoriesForFirstPaint(env)
	]);
	// Headers follow the read. A missed read of either is never edge-cached: the next visitor's
	// client would add it later, and the page would move (MOBILE1 for advisories).
	setHeaders({ 'Cache-Control': dashboardCacheControl(snapshot !== null && advisories !== null) });
	return {
		snapshot,
		advisories,
		renderedAt: Date.now(),
		lifestyle: lifestyleOn(env)
	};
}
