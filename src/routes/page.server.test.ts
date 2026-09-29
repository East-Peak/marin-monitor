import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadLegacyBootstrap } = vi.hoisted(() => ({ loadLegacyBootstrap: vi.fn() }));
vi.mock('$lib/dashboard/bootstrap', () => ({ loadLegacyBootstrap }));

import { load } from './+page.server';

function event(path: string) {
	const headers: Record<string, string> = {};
	const ev = {
		url: new URL(path, 'https://marinmonitor.com'),
		setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
	} as unknown as Parameters<typeof load>[0];
	return { ev, headers };
}

const BOOT = {
	weather: null,
	earthquakes: [],
	hourly: [],
	locationId: 'central-marin',
	timestamp: 1
};

beforeEach(() => {
	loadLegacyBootstrap.mockReset();
	loadLegacyBootstrap.mockResolvedValue(BOOT);
});

describe('dashboard page load', () => {
	it('renders legacy by default, publicly cacheable, with the legacy prefetch', async () => {
		const { ev, headers } = event('/');
		const data = await load(ev);
		expect(data).toEqual({ layout: 'legacy', bootstrap: BOOT });
		expect(headers['Cache-Control']).toBe('s-maxage=120, stale-while-revalidate=300');
		expect(loadLegacyBootstrap).toHaveBeenCalledOnce();
	});
	it('?layout=v2 is private and never starts the legacy prefetch', async () => {
		const { ev, headers } = event('/?layout=v2');
		const data = await load(ev);
		expect(data).toEqual({ layout: 'v2', bootstrap: null });
		expect(headers['Cache-Control']).toBe('private, no-store');
		expect(loadLegacyBootstrap).not.toHaveBeenCalled();
	});
	it('?layout=legacy and ?layout=edit render legacy', async () => {
		for (const path of ['/?layout=legacy', '/?layout=edit']) {
			const { ev } = event(path);
			expect((await load(ev)).layout).toBe('legacy');
		}
	});
	it('a failed prefetch still renders legacy (bootstrap null)', async () => {
		loadLegacyBootstrap.mockResolvedValue(null);
		const { ev } = event('/');
		expect(await load(ev)).toEqual({ layout: 'legacy', bootstrap: null });
	});
});
