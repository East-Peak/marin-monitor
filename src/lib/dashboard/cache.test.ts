import { describe, expect, it } from 'vitest';
import { PRIVATE_DASHBOARD_CACHE, PUBLIC_DASHBOARD_CACHE, dashboardCacheControl } from './cache';

describe('dashboardCacheControl', () => {
	it('a seeded page is public for a minute at the edge', () => {
		expect(PUBLIC_DASHBOARD_CACHE).toBe('s-maxage=60, stale-while-revalidate=300');
		expect(dashboardCacheControl(true)).toBe(PUBLIC_DASHBOARD_CACHE);
	});

	it('an unseeded page is private and never stored', () => {
		expect(PRIVATE_DASHBOARD_CACHE).toBe('private, no-store');
		expect(dashboardCacheControl(false)).toBe(PRIVATE_DASHBOARD_CACHE);
	});
});
