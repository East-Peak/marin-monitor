// Strava's public data routes and its cron syncs answer 404 while the Strava
// switch is off, without touching blob storage, and behave as before when it is on.
/* eslint-disable @typescript-eslint/no-explicit-any -- SvelteKit RequestEvent mocks; handlers use a subset of the full interface */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const flag = vi.hoisted(() => ({ enabled: false }));
const mockHead = vi.fn();
const mockPut = vi.fn();
const mockFetchWithTimeout = vi.fn();

vi.mock('$lib/config/strava', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/config/strava')>()),
	get STRAVA_ENABLED() {
		return flag.enabled;
	}
}));
vi.mock('@vercel/blob', () => ({ head: mockHead, put: mockPut }));
vi.mock('$env/dynamic/private', () => ({
	env: { BLOB_READ_WRITE_TOKEN: 'test-token', CRON_SECRET: 'test-cron-secret' }
}));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout: mockFetchWithTimeout }));

const dataRoutes = {
	'strava-segments': (await import('./data/strava-segments/+server')).GET,
	'strava-events': (await import('./data/strava-events/+server')).GET,
	'strava-leaderboards': (await import('./data/strava-leaderboards/+server')).GET,
	'strava-leaderboard/[id]': (await import('./data/strava-leaderboard/[id]/+server')).GET
};
const cronRoutes = {
	'sync-strava-segments': (await import('./cron/sync-strava-segments/+server')).GET,
	'sync-strava-leaderboards': (await import('./cron/sync-strava-leaderboards/+server')).GET
};

const dataEvent = { params: { id: '123' } } as any;
const cronEvent = () =>
	({
		request: new Request('https://localhost/api/cron/x', {
			headers: { authorization: 'Bearer test-cron-secret' }
		})
	}) as any;

function blobServes(payload: unknown) {
	mockHead.mockResolvedValue({ downloadUrl: 'https://blob.test/x.json' });
	mockFetchWithTimeout.mockResolvedValue(
		new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('with Strava off', () => {
	beforeEach(() => {
		flag.enabled = false;
	});

	for (const [name, GET] of Object.entries(dataRoutes)) {
		it(`/api/data/${name} answers 404 and never reads blob storage`, async () => {
			blobServes({ lastUpdated: '2026-10-01T00:00:00Z' });
			const response = await GET(dataEvent);
			expect(response.status).toBe(404);
			expect(mockHead).not.toHaveBeenCalled();
		});
	}

	for (const [name, GET] of Object.entries(cronRoutes)) {
		it(`/api/cron/${name} answers 404 and writes nothing`, async () => {
			const response = await GET(cronEvent());
			expect(response.status).toBe(404);
			expect(mockHead).not.toHaveBeenCalled();
			expect(mockPut).not.toHaveBeenCalled();
		});
	}

	it('still refuses an unauthenticated cron call first', async () => {
		const response = await cronRoutes['sync-strava-segments']({
			request: new Request('https://localhost/api/cron/x')
		} as any);
		expect(response.status).toBe(401);
	});
});

describe('with Strava on', () => {
	beforeEach(() => {
		flag.enabled = true;
	});

	for (const name of ['strava-events', 'strava-leaderboards', 'strava-leaderboard/[id]'] as const) {
		it(`/api/data/${name} serves the blob as before`, async () => {
			blobServes({ lastUpdated: '2026-10-01T00:00:00Z' });
			const response = await dataRoutes[name](dataEvent);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ lastUpdated: '2026-10-01T00:00:00Z' });
		});
	}

	it('/api/data/strava-segments falls back to the curated catalog as before', async () => {
		mockHead.mockRejectedValue(new Error('blob not found'));
		const response = await dataRoutes['strava-segments'](dataEvent);
		expect(response.status).toBe(200);
		expect(response.headers.get('X-Data-Source')).toBe('local-fallback');
		expect((await response.json()).segments.length).toBeGreaterThan(0);
	});
});
