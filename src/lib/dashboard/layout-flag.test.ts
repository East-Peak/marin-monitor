import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DASHBOARD_LAYOUT,
	PRIVATE_DASHBOARD_CACHE,
	PUBLIC_DASHBOARD_CACHE,
	dashboardCacheControl,
	resolveDashboardLayout
} from './layout-flag';

const at = (path: string) => new URL(path, 'https://marinmonitor.com');

describe('resolveDashboardLayout', () => {
	it('defaults to legacy before the flip', () => {
		expect(DEFAULT_DASHBOARD_LAYOUT).toBe('legacy');
		expect(resolveDashboardLayout(at('/'))).toBe('legacy');
	});
	it('?layout=v2 selects the preview, case- and whitespace-insensitively', () => {
		expect(resolveDashboardLayout(at('/?layout=v2'))).toBe('v2');
		expect(resolveDashboardLayout(at('/?layout=V2'))).toBe('v2');
		expect(resolveDashboardLayout(at('/?layout=%20v2%20'))).toBe('v2');
	});
	it('?layout=legacy is the rollback override: it wins even when the default is v2', () => {
		expect(resolveDashboardLayout(at('/?layout=legacy'), 'v2')).toBe('legacy');
	});
	it('?layout=edit (the legacy layout editor) always renders legacy', () => {
		expect(resolveDashboardLayout(at('/?layout=edit'), 'v2')).toBe('legacy');
	});
	it('unknown values fall back to the default', () => {
		expect(resolveDashboardLayout(at('/?layout=v3'))).toBe('legacy');
		expect(resolveDashboardLayout(at('/?layout=v3'), 'v2')).toBe('v2');
		expect(resolveDashboardLayout(at('/?layout='))).toBe('legacy');
	});
	it('ignores other params and the fragment', () => {
		expect(resolveDashboardLayout(at('/?cb=1&layout=v2#news'))).toBe('v2');
	});
});

describe('dashboardCacheControl', () => {
	it('keeps the public edge cache for legacy', () => {
		expect(dashboardCacheControl('legacy')).toBe(PUBLIC_DASHBOARD_CACHE);
		expect(PUBLIC_DASHBOARD_CACHE).toBe('s-maxage=120, stale-while-revalidate=300');
	});
	it('never puts v2 preview HTML or data under the public cache', () => {
		expect(dashboardCacheControl('v2')).toBe(PRIVATE_DASHBOARD_CACHE);
		expect(PRIVATE_DASHBOARD_CACHE).toBe('private, no-store');
	});
});
