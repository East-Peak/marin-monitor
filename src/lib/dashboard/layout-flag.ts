/**
 * Which dashboard layout a request renders (spec §13.6).
 *
 * Resolved on the server from the URL, never from storage, so SSR, hydration
 * and client navigation agree and exactly one layout mounts.
 */
export type DashboardLayout = 'legacy' | 'v2';

/** The layout a request renders, and whether `?layout` chose it rather than the default. */
export interface DashboardLayoutChoice {
	layout: DashboardLayout;
	explicit: boolean;
}

/** The D1 default flip (PR 15, DASH-FLIP2). Rollback: set this back to 'legacy'. */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = 'v2';

export const PUBLIC_DASHBOARD_CACHE = 's-maxage=120, stale-while-revalidate=300';
export const PUBLIC_V2_DASHBOARD_CACHE = 's-maxage=60, stale-while-revalidate=300';
export const PRIVATE_DASHBOARD_CACHE = 'private, no-store';

const CANONICAL_URL = 'https://marinmonitor.com/';

export function resolveDashboardLayout(
	url: URL,
	defaultLayout: DashboardLayout = DEFAULT_DASHBOARD_LAYOUT
): DashboardLayoutChoice {
	const requested = url.searchParams.get('layout')?.trim().toLowerCase();
	if (requested === 'v2') return { layout: 'v2', explicit: true };
	// `legacy` is the post-flip rollback override; `edit` is the legacy-only layout editor.
	if (requested === 'legacy' || requested === 'edit') return { layout: 'legacy', explicit: true };
	return { layout: defaultLayout, explicit: false };
}

/**
 * Only the default layout is publicly cached, so rolling the default back is one constant.
 * Its SSR is identical for everyone (the town applies after mount, DASH-FLIP1). A v2 page
 * whose snapshot read failed is never cached, so an empty first paint can't stick at the edge.
 * An explicit `?layout` is an override for one visitor and is never cached.
 */
export function dashboardCacheControl(choice: DashboardLayoutChoice, seeded = false): string {
	if (choice.explicit) return PRIVATE_DASHBOARD_CACHE;
	if (choice.layout === 'legacy') return PUBLIC_DASHBOARD_CACHE;
	return seeded ? PUBLIC_V2_DASHBOARD_CACHE : PRIVATE_DASHBOARD_CACHE;
}

/** The default is the indexable page; an override is noindex, and v2's points at the root. */
export function dashboardRobots(choice: DashboardLayoutChoice): {
	noindex: boolean;
	canonical: string | null;
} {
	if (!choice.explicit) return { noindex: false, canonical: null };
	return { noindex: true, canonical: choice.layout === 'v2' ? CANONICAL_URL : null };
}
