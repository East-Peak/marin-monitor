/**
 * Which dashboard layout a request renders (spec §13.6).
 *
 * Resolved on the server from the URL, never from storage, so SSR, hydration
 * and client navigation agree and exactly one layout mounts.
 */
export type DashboardLayout = 'legacy' | 'v2';

/** Pre-flip default. The D1 default flip (PR 15) changes this one constant. */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = 'legacy';

export const PUBLIC_DASHBOARD_CACHE = 's-maxage=120, stale-while-revalidate=300';
export const PRIVATE_DASHBOARD_CACHE = 'private, no-store';

export function resolveDashboardLayout(
	url: URL,
	defaultLayout: DashboardLayout = DEFAULT_DASHBOARD_LAYOUT
): DashboardLayout {
	const requested = url.searchParams.get('layout')?.trim().toLowerCase();
	if (requested === 'v2') return 'v2';
	// `legacy` is the post-flip rollback override; `edit` is the legacy-only layout editor.
	if (requested === 'legacy' || requested === 'edit') return 'legacy';
	return defaultLayout;
}

/**
 * The legacy HTML is identical for everyone, so it keeps the public edge cache.
 * The v2 preview is never publicly cached (§13.6: no personalized HTML under s-maxage).
 * The flip (PR 15) revisits this once v2 SSR is non-personalized.
 */
export function dashboardCacheControl(layout: DashboardLayout): string {
	return layout === 'legacy' ? PUBLIC_DASHBOARD_CACHE : PRIVATE_DASHBOARD_CACHE;
}
