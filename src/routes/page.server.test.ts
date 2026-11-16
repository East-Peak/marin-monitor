import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsSnapshotResponse, NewsSnapshotView } from '$lib/news/snapshot';

const { readNewsSnapshot, readAdvisoriesForFirstPaint, env } = vi.hoisted(() => ({
	readNewsSnapshot: vi.fn(),
	readAdvisoriesForFirstPaint: vi.fn(),
	env: {} as Record<string, string | undefined>
}));
vi.mock('$lib/server/news/read-snapshot', () => ({ readNewsSnapshot }));
vi.mock('$lib/server/advisories/first-paint', () => ({ readAdvisoriesForFirstPaint }));
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
	readAdvisoriesForFirstPaint.mockReset();
	readAdvisoriesForFirstPaint.mockResolvedValue({
		advisories: [],
		unreadable: 0,
		lastAttemptAt: 1,
		lastSuccessAt: 1,
		lastError: null
	});
});
afterEach(() => vi.useRealTimers());

describe('dashboard page load', () => {
	it('renders the dashboard, publicly cacheable once seeded', async () => {
		const { ev, headers } = event('/');
		expect(await load(ev)).toMatchObject({ snapshot: VIEW });
		expect(headers['Cache-Control']).toBe('s-maxage=60, stale-while-revalidate=300');
	});
	it('carries the server’s advisory read to the first paint (MOBILE1)', async () => {
		const ADV = {
			advisories: [],
			unreadable: 0,
			lastAttemptAt: 1,
			lastSuccessAt: 1,
			lastError: null
		};
		readAdvisoriesForFirstPaint.mockResolvedValue(ADV);
		expect(await load(event('/').ev)).toMatchObject({ advisories: ADV });
		expect(readAdvisoriesForFirstPaint).toHaveBeenCalledWith(env);
	});
	it('a missed advisory read is never edge-cached, like a missed snapshot (MOBILE1)', async () => {
		const ADV = {
			advisories: [],
			unreadable: 0,
			lastAttemptAt: 1,
			lastSuccessAt: 1,
			lastError: null
		};
		readAdvisoriesForFirstPaint.mockResolvedValue(ADV);
		const seeded = event('/');
		await load(seeded.ev);
		expect(seeded.headers['Cache-Control']).toBe('s-maxage=60, stale-while-revalidate=300');
		readAdvisoriesForFirstPaint.mockResolvedValue(null);
		const missed = event('/');
		await load(missed.ev);
		expect(missed.headers['Cache-Control']).toBe('private, no-store');
	});
	it('carries the Lifestyle Index flag: off unless LIFESTYLE_INDEX is on', async () => {
		expect(await load(event('/').ev)).toMatchObject({ lifestyle: false });
		env.LIFESTYLE_INDEX = 'on';
		try {
			expect(await load(event('/').ev)).toMatchObject({ lifestyle: true });
		} finally {
			delete env.LIFESTYLE_INDEX;
		}
	});
	it('without a snapshot it is private, no-store', async () => {
		readNewsSnapshot.mockResolvedValue({ status: 'unavailable', reason: 'missing' });
		const { ev, headers } = event('/');
		expect(await load(ev)).toMatchObject({ snapshot: null });
		expect(headers['Cache-Control']).toBe('private, no-store');
	});
	it('a stale ?layout= link, legacy and edit included, serves the dashboard under the same rules', async () => {
		for (const path of ['/?layout=v2', '/?layout=legacy', '/?layout=edit', '/?layout=nonsense']) {
			const { ev, headers } = event(path);
			expect(await load(ev)).toMatchObject({ snapshot: VIEW });
			expect(headers['Cache-Control']).toBe('s-maxage=60, stale-while-revalidate=300');
		}
		readNewsSnapshot.mockResolvedValue({ status: 'unavailable', reason: 'missing' });
		const { ev, headers } = event('/?layout=legacy');
		expect(await load(ev)).toMatchObject({ snapshot: null });
		expect(headers['Cache-Control']).toBe('private, no-store');
	});
});

describe('server-rendered first paint (DASH-FLIP1)', () => {
	it('returns the reader’s view on ok, with the render time', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(Date.parse('2026-10-17T12:03:00.000Z'));
		const { ev } = event('/');
		expect(await load(ev)).toEqual({
			snapshot: VIEW,
			advisories: {
				advisories: [],
				unreadable: 0,
				lastAttemptAt: 1,
				lastSuccessAt: 1,
				lastError: null
			},
			renderedAt: Date.parse('2026-10-17T12:03:00.000Z'),
			lifestyle: false
		});
		// A 1,200 ms bound passed to the reader too, so its Blob read is aborted.
		expect(readNewsSnapshot.mock.calls[0][1]).toBe(1_200);
	});

	it('a read still pending at 1,201 ms → null and private, no-store', async () => {
		vi.useFakeTimers();
		readNewsSnapshot.mockReturnValue(new Promise(() => {}));
		const { ev, headers } = event('/');
		let data: Awaited<ReturnType<typeof load>> | undefined;
		void load(ev).then((d) => (data = d));
		await vi.advanceTimersByTimeAsync(1_199);
		expect(data).toBeUndefined();
		expect(headers['Cache-Control']).toBeUndefined();
		await vi.advanceTimersByTimeAsync(2);
		expect(data).toMatchObject({ snapshot: null });
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
			const { ev, headers } = event('/');
			expect(await load(ev)).toMatchObject({ snapshot: null });
			expect(headers['Cache-Control']).toBe('private, no-store');
		}
	});
});
