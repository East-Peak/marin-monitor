import { describe, expect, it } from 'vitest';
import {
	PRIVATE_DASHBOARD_CACHE,
	PUBLIC_DASHBOARD_CACHE,
	PUBLIC_V2_DASHBOARD_CACHE,
	dashboardCacheControl,
	dashboardRobots,
	resolveDashboardLayout,
	type DashboardLayout
} from './layout-flag';

const at = (path: string) => new URL(path, 'https://marinmonitor.com');
const layoutOf = (path: string, d?: DashboardLayout) => resolveDashboardLayout(at(path), d).layout;

describe('resolveDashboardLayout', () => {
	it('?layout=v2 selects v2, case- and whitespace-insensitively, under either default', () => {
		for (const d of ['legacy', 'v2'] as const) {
			expect(resolveDashboardLayout(at('/?layout=v2'), d)).toEqual({
				layout: 'v2',
				explicit: true
			});
			expect(layoutOf('/?layout=V2', d)).toBe('v2');
			expect(layoutOf('/?layout=%20v2%20', d)).toBe('v2');
		}
	});
	it('?layout=legacy is the rollback override: it wins even when the default is v2', () => {
		expect(resolveDashboardLayout(at('/?layout=legacy'), 'v2')).toEqual({
			layout: 'legacy',
			explicit: true
		});
	});
	it('?layout=edit (the legacy layout editor) always renders legacy', () => {
		expect(resolveDashboardLayout(at('/?layout=edit'), 'v2')).toEqual({
			layout: 'legacy',
			explicit: true
		});
	});
	it('no or an unknown ?layout is the default, not an explicit choice', () => {
		for (const d of ['legacy', 'v2'] as const) {
			for (const path of ['/', '/?layout=v3', '/?layout=']) {
				expect(resolveDashboardLayout(at(path), d)).toEqual({ layout: d, explicit: false });
			}
		}
	});
	it('ignores other params and the fragment', () => {
		expect(layoutOf('/?cb=1&layout=v2#news', 'legacy')).toBe('v2');
	});
});

describe('dashboardCacheControl', () => {
	it('the default layout is publicly cached: legacy as before, v2 once its first paint is seeded', () => {
		expect(PUBLIC_DASHBOARD_CACHE).toBe('s-maxage=120, stale-while-revalidate=300');
		expect(PUBLIC_V2_DASHBOARD_CACHE).toBe('s-maxage=60, stale-while-revalidate=300');
		const legacy = resolveDashboardLayout(at('/'), 'legacy');
		const v2 = resolveDashboardLayout(at('/'), 'v2');
		expect(dashboardCacheControl(legacy)).toBe(PUBLIC_DASHBOARD_CACHE);
		expect(dashboardCacheControl(v2, true)).toBe(PUBLIC_V2_DASHBOARD_CACHE);
	});
	it('a default v2 without a seeded snapshot is never edge-cached (DASH-FLIP1)', () => {
		expect(dashboardCacheControl(resolveDashboardLayout(at('/'), 'v2'), false)).toBe(
			PRIVATE_DASHBOARD_CACHE
		);
		expect(PRIVATE_DASHBOARD_CACHE).toBe('private, no-store');
	});
	it('an explicit ?layout is private under either default, seeded or not', () => {
		for (const d of ['legacy', 'v2'] as const) {
			for (const path of ['/?layout=v2', '/?layout=legacy', '/?layout=edit']) {
				const choice = resolveDashboardLayout(at(path), d);
				expect(dashboardCacheControl(choice, true), `${path} default ${d}`).toBe(
					PRIVATE_DASHBOARD_CACHE
				);
			}
		}
	});
});

describe('dashboardRobots', () => {
	it('the default layout is indexable, whichever it is', () => {
		for (const d of ['legacy', 'v2'] as const) {
			expect(dashboardRobots(resolveDashboardLayout(at('/'), d))).toEqual({
				noindex: false,
				canonical: null
			});
		}
	});
	it('?layout=v2 is noindex and canonical to the root, under either default', () => {
		for (const d of ['legacy', 'v2'] as const) {
			expect(dashboardRobots(resolveDashboardLayout(at('/?layout=v2'), d))).toEqual({
				noindex: true,
				canonical: 'https://marinmonitor.com/'
			});
		}
	});
	it('?layout=legacy and ?layout=edit are noindex, without a canonical', () => {
		for (const path of ['/?layout=legacy', '/?layout=edit']) {
			expect(dashboardRobots(resolveDashboardLayout(at(path), 'v2'))).toEqual({
				noindex: true,
				canonical: null
			});
		}
	});
});
