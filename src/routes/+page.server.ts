import type { ServerLoadEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { loadLegacyBootstrap } from '$lib/dashboard/bootstrap';
import { dashboardCacheControl, resolveDashboardLayout } from '$lib/dashboard/layout-flag';
import { lifestyleOn } from '$lib/server/lifestyle/read';
import { readSnapshotForFirstPaint } from '$lib/server/news/first-paint';

export async function load({ url, setHeaders }: ServerLoadEvent) {
	// Reading url.searchParams makes SvelteKit re-run this load when ?layout changes
	// during client navigation, so the page data always matches the URL.
	const choice = resolveDashboardLayout(url);
	const { layout, explicit } = choice;

	// v2 never starts the legacy prefetch (spec §13.6). Its news arrives in the
	// HTML when the snapshot reads in time; otherwise the client loads it, as before.
	if (layout === 'v2') {
		const snapshot = await readSnapshotForFirstPaint();
		// Headers follow the read: a failed read is never edge-cached as an empty first paint.
		setHeaders({ 'Cache-Control': dashboardCacheControl(choice, snapshot !== null) });
		return {
			layout,
			explicit,
			bootstrap: null,
			snapshot,
			renderedAt: Date.now(),
			lifestyle: lifestyleOn(env)
		};
	}
	setHeaders({ 'Cache-Control': dashboardCacheControl(choice) });
	return { layout, explicit, bootstrap: await loadLegacyBootstrap() };
}
