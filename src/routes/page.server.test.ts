import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsSnapshotResponse, NewsSnapshotView } from '$lib/news/snapshot';

const { loadLegacyBootstrap, readNewsSnapshot, env } = vi.hoisted(() => ({
	loadLegacyBootstrap: vi.fn(),
	readNewsSnapshot: vi.fn(),
	env: {} as Record<string, string | undefined>
}));
vi.mock('$lib/dashboard/bootstrap', () => ({ loadLegacyBootstrap }));
vi.mock('$lib/server/news/read-snapshot', () => ({ readNewsSnapshot }));
vi.mock('$env/dynamic/private', () => ({ env }));

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

const VIEW = { revision: 3, generatedAt: '2026-10-17T12:00:00.000Z' } as NewsSnapshotView;
const OK: NewsSnapshotResponse = { status: 'ok', snapshot: VIEW };

beforeEach(() => {
	loadLegacyBootstrap.mockReset();
	loadLegacyBootstrap.mockResolvedValue(BOOT);
	readNewsSnapshot.mockReset();
	readNewsSnapshot.mockResolvedValue(OK);
});
afterEach(() => vi.useRealTimers());

describe('dashboard page load', () => {
	it('renders legacy by default, publicly cacheable, with the legacy prefetch', async () => {
		const { ev, headers } = event('/');
		const data = await load(ev);
		expect(data).toEqual({ layout: 'legacy', explicit: false, bootstrap: BOOT });
		expect(headers['Cache-Control']).toBe('s-maxage=120, stale-while-revalidate=300');
		expect(loadLegacyBootstrap).toHaveBeenCalledOnce();
	});
	it('?layout=v2 is private and never starts the legacy prefetch', async () => {
		const { ev, headers } = event('/?layout=v2');
		const data = await load(ev);
		expect(data).toMatchObject({ layout: 'v2', bootstrap: null });
		expect(headers['Cache-Control']).toBe('private, no-store');
		expect(loadLegacyBootstrap).not.toHaveBeenCalled();
	});
	it('?layout=legacy and ?layout=edit render legacy, explicit and private', async () => {
		for (const path of ['/?layout=legacy', '/?layout=edit']) {
			const { ev, headers } = event(path);
			expect(await load(ev)).toMatchObject({ layout: 'legacy', explicit: true });
			expect(headers['Cache-Control']).toBe('private, no-store');
		}
	});
	it('a failed prefetch still renders legacy (bootstrap null)', async () => {
		loadLegacyBootstrap.mockResolvedValue(null);
		const { ev } = event('/');
		expect(await load(ev)).toEqual({ layout: 'legacy', explicit: false, bootstrap: null });
	});
});

describe('v2 server-rendered first paint (DASH-FLIP1)', () => {
	it('returns the reader’s view on ok, with the render time', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(Date.parse('2026-10-17T12:03:00.000Z'));
		const { ev } = event('/?layout=v2');
		expect(await load(ev)).toEqual({
			layout: 'v2',
			explicit: true,
			bootstrap: null,
			snapshot: VIEW,
			renderedAt: Date.parse('2026-10-17T12:03:00.000Z')
		});
		// A 1,200 ms bound passed to the reader too, so its Blob read is aborted.
		expect(readNewsSnapshot.mock.calls[0][1]).toBe(1_200);
	});

	it('a read still pending at 1,201 ms → null and private, no-store', async () => {
		vi.useFakeTimers();
		readNewsSnapshot.mockReturnValue(new Promise(() => {}));
		const { ev, headers } = event('/?layout=v2');
		let data: Awaited<ReturnType<typeof load>> | undefined;
		void load(ev).then((d) => (data = d));
		await vi.advanceTimersByTimeAsync(1_199);
		expect(data).toBeUndefined();
		expect(headers['Cache-Control']).toBeUndefined();
		await vi.advanceTimersByTimeAsync(2);
		expect(data).toMatchObject({ layout: 'v2', snapshot: null });
		expect(headers['Cache-Control']).toBe('private, no-store');
	});

	it('unavailable, unknown and a throw → null and private, no-store', async () => {
		const outcomes = [
			() => readNewsSnapshot.mockResolvedValue({ status: 'unavailable', reason: 'missing' }),
			() => readNewsSnapshot.mockResolvedValue({ status: 'unknown', reason: 'invalid' }),
			() => readNewsSnapshot.mockRejectedValue(new Error('boom'))
		];
		for (const set of outcomes) {
			set();
			const { ev, headers } = event('/?layout=v2');
			expect(await load(ev)).toMatchObject({ layout: 'v2', snapshot: null });
			expect(headers['Cache-Control']).toBe('private, no-store');
		}
	});

	it('the legacy layout never reads the snapshot', async () => {
		await load(event('/').ev);
		expect(readNewsSnapshot).not.toHaveBeenCalled();
	});
});
