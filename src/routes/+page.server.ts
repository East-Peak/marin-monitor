import type { ServerLoadEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { loadLegacyBootstrap } from '$lib/dashboard/bootstrap';
import { dashboardCacheControl, resolveDashboardLayout } from '$lib/dashboard/layout-flag';
import { lifestyleOn } from '$lib/server/lifestyle/read';
import { readSnapshotForFirstPaint } from '$lib/server/news/first-paint';
import { readAdvisoriesForFirstPaint } from '$lib/server/advisories/first-paint';

export async function load({ url, setHeaders }: ServerLoadEvent) {
	// Reading url.searchParams makes SvelteKit re-run this load when ?layout changes
	// during client navigation, so the page data always matches the URL.
	const choice = resolveDashboardLayout(url);
	const { layout, explicit } = choice;

	// v2 never starts the legacy prefetch (spec §13.6). Its news and advisories arrive in the
	// HTML when they read in time (MOBILE1 for advisories); otherwise the client loads them.
	if (layout === 'v2') {
		const [snapshot, advisories] = await Promise.all([
			readSnapshotForFirstPaint(),
			readAdvisoriesForFirstPaint(env)
		]);
		// Headers follow the read: a failed read is never edge-cached as an empty first paint.
		// A missed read of either is never edge-cached: the next visitor's client would add it
		// later, and the page would move (MOBILE1 for advisories).
		setHeaders({
			'Cache-Control': dashboardCacheControl(choice, snapshot !== null && advisories !== null)
		});
		return {
			layout,
			explicit,
			bootstrap: null,
			snapshot,
			advisories,
			renderedAt: Date.now(),
			lifestyle: lifestyleOn(env)
		};
	}
	setHeaders({ 'Cache-Control': dashboardCacheControl(choice) });
	return { layout, explicit, bootstrap: await loadLegacyBootstrap() };
}
