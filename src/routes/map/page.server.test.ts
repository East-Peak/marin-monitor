import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsSnapshotResponse, NewsSnapshotView } from '$lib/news/snapshot';

const { readNewsSnapshot, env } = vi.hoisted(() => ({
	readNewsSnapshot: vi.fn(),
	env: {} as Record<string, string | undefined>
}));
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

const VIEW = { revision: 3, generatedAt: '2026-10-17T12:00:00.000Z' } as NewsSnapshotView;
const OK: NewsSnapshotResponse = { status: 'ok', snapshot: VIEW };

beforeEach(() => {
	readNewsSnapshot.mockReset();
	readNewsSnapshot.mockResolvedValue(OK);
});

describe('/map page load (MAPX3)', () => {
	it('seeds the news snapshot like /, and is publicly cacheable once seeded', async () => {
		const { ev, headers } = event('/map');
		expect(await load(ev)).toMatchObject({ snapshot: VIEW });
		expect(headers['Cache-Control']).toBe('s-maxage=60, stale-while-revalidate=300');
	});

	it('a null seed is private, no-store, so an empty first paint never sticks at the edge', async () => {
		for (const fail of [
			() => readNewsSnapshot.mockResolvedValue({ status: 'unavailable', reason: 'missing' }),
			() => readNewsSnapshot.mockRejectedValue(new Error('blob down'))
		]) {
			fail();
			const { ev, headers } = event('/map');
			expect(await load(ev)).toMatchObject({ snapshot: null });
			expect(headers['Cache-Control']).toBe('private, no-store');
		}
	});

	it('gives up on the read at the same 1,200 ms deadline as /', async () => {
		vi.useFakeTimers();
		readNewsSnapshot.mockReturnValue(new Promise(() => {}));
		const { ev, headers } = event('/map');
		const pending = load(ev);
		await vi.advanceTimersByTimeAsync(1_200);
		expect(await pending).toMatchObject({ snapshot: null });
		expect(headers['Cache-Control']).toBe('private, no-store');
		vi.useRealTimers();
	});
});
