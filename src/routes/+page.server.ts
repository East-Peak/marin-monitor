import type { ServerLoadEvent } from '@sveltejs/kit';
import { loadLegacyBootstrap } from '$lib/dashboard/bootstrap';
import { dashboardCacheControl, resolveDashboardLayout } from '$lib/dashboard/layout-flag';

export async function load({ url, setHeaders }: ServerLoadEvent) {
	// Reading url.searchParams makes SvelteKit re-run this load when ?layout changes
	// during client navigation, so the page data always matches the URL.
	const layout = resolveDashboardLayout(url);
	setHeaders({ 'Cache-Control': dashboardCacheControl(layout) });

	// The v2 preview never starts the legacy prefetch (spec §13.6).
	if (layout === 'v2') return { layout, bootstrap: null };
	return { layout, bootstrap: await loadLegacyBootstrap() };
}
