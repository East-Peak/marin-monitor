import type { ServerLoadEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { loadLegacyBootstrap } from '$lib/dashboard/bootstrap';
import {
	dashboardCacheControl,
	PRIVATE_DASHBOARD_CACHE,
	resolveDashboardLayout
} from '$lib/dashboard/layout-flag';
import type { NewsSnapshotView } from '$lib/news/snapshot';
import { snapshotBlobApi } from '$lib/server/news/fixture-blob-api';
import { readNewsSnapshot } from '$lib/server/news/read-snapshot';

/** The first paint never waits longer than this for news (DASH-FLIP1). */
const SNAPSHOT_DEADLINE_MS = 1_200;

/** The reader's validated view, or null for a timeout, unavailable, unknown or a throw. */
async function readSnapshotForFirstPaint(): Promise<NewsSnapshotView | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), SNAPSHOT_DEADLINE_MS);
	});
	try {
		const body = await Promise.race([
			readNewsSnapshot(snapshotBlobApi(env), SNAPSHOT_DEADLINE_MS),
			deadline
		]);
		return body?.status === 'ok' ? body.snapshot : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export async function load({ url, setHeaders }: ServerLoadEvent) {
	// Reading url.searchParams makes SvelteKit re-run this load when ?layout changes
	// during client navigation, so the page data always matches the URL.
	const layout = resolveDashboardLayout(url);

	// The v2 preview never starts the legacy prefetch (spec §13.6). Its news arrives in the
	// HTML when the snapshot reads in time; otherwise the client loads it, as before.
	if (layout === 'v2') {
		const snapshot = await readSnapshotForFirstPaint();
		// Headers follow the read: a failed read is never edge-cached as an empty first paint.
		setHeaders({
			'Cache-Control': snapshot ? dashboardCacheControl(layout) : PRIVATE_DASHBOARD_CACHE
		});
		return { layout, bootstrap: null, snapshot, renderedAt: Date.now() };
	}
	setHeaders({ 'Cache-Control': dashboardCacheControl(layout) });
	return { layout, bootstrap: await loadLegacyBootstrap() };
}
