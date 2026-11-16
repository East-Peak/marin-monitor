/**
 * How the dashboard's HTML (`/` and `/map`) is edge-cached.
 *
 * The SSR is identical for every visitor (the town applies after mount, DASH-FLIP1), so a seeded
 * page is public. One whose first-paint read failed is never cached, so an empty first paint
 * can't stick at the edge.
 */
export const PUBLIC_DASHBOARD_CACHE = 's-maxage=60, stale-while-revalidate=300';
export const PRIVATE_DASHBOARD_CACHE = 'private, no-store';

export function dashboardCacheControl(seeded: boolean): string {
	return seeded ? PUBLIC_DASHBOARD_CACHE : PRIVATE_DASHBOARD_CACHE;
}
