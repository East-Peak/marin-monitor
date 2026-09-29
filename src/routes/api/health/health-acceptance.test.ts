// Accepted exceptions: /api/health answers 200 when the only failures are
// covered by active, exact-condition exceptions — and still shows them.
// check-freshness keeps failing whenever anything is degraded.
/* eslint-disable @typescript-eslint/no-explicit-any -- SvelteKit RequestEvent mock */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadBlobFreshnessTimestamp = vi.fn();

vi.mock('@vercel/blob', () => ({ head: vi.fn(), BlobNotFoundError: class extends Error {} }));
vi.mock('$env/dynamic/private', () => ({
	env: { BLOB_READ_WRITE_TOKEN: 'test-token', CRON_SECRET: 'test-cron-secret' }
}));
vi.mock('$lib/server/blob-freshness', () => ({
	readBlobFreshnessTimestamp: mockReadBlobFreshnessTimestamp
}));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout: vi.fn() }));
vi.mock('$lib/server/health/inventory', async (importOriginal) => {
	const accept = (name: string, condition: 'stale' | 'unavailable') => ({
		name,
		condition,
		reason: 'test',
		approvedBy: 'test',
		approvedAt: '2026-09-29T00:00:00.000Z',
		expiresAt: '2999-01-01T00:00:00.000Z'
	});
	return {
		...(await importOriginal<typeof import('$lib/server/health/inventory')>()),
		KNOWN_SUBSOURCE_FAILURES: [
			{ name: 'Fairfax Police', parent: 'Police Logs', problem: '403', disposition: 'accepted' }
		],
		ACCEPTED_EXCEPTIONS: [
			accept('Strava Segments', 'stale'),
			accept('Strava Events', 'stale'),
			accept('Fairfax Police', 'unavailable')
		]
	};
});

const { GET: getHealth } = await import('./+server');
const { GET: getFreshness } = await import('../cron/check-freshness/+server');

const STRAVA = new Set(['strava-segments.json', 'strava-events.json']);
const health = () => getHealth({ request: new Request('https://localhost/api/health') } as any);
const freshness = () =>
	getFreshness({
		request: new Request('https://localhost/api/cron/check-freshness', {
			headers: { authorization: 'Bearer test-cron-secret' }
		})
	} as any);

function stravaAt(stravaTs: string | null) {
	const now = new Date().toISOString();
	mockReadBlobFreshnessTimestamp.mockImplementation(async (key: string) =>
		STRAVA.has(key)
			? { uploadedAt: stravaTs, lastUpdated: stravaTs }
			: { uploadedAt: now, lastUpdated: now }
	);
}

beforeEach(() => {
	mockReadBlobFreshnessTimestamp.mockReset();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('/api/health with accepted exceptions', () => {
	it('returns 200 while still reporting the accepted failures factually', async () => {
		stravaAt('2026-06-01T00:00:00.000Z');
		const response = await health();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.acceptable).toBe(true);
		expect(body.summary.stale).toBe(2);
		for (const name of ['Strava Segments', 'Strava Events']) {
			const source = body.sources.find((s: { name: string }) => s.name === name);
			expect(source.status).toBe('stale');
			expect(source.accepted.expiresAt).toBe('2999-01-01T00:00:00.000Z');
		}
		expect(body.subsources).toEqual([
			{
				name: 'Fairfax Police',
				parent: 'Police Logs',
				status: 'unavailable',
				acceptedUntil: '2999-01-01T00:00:00.000Z'
			}
		]);
	});

	it('returns 503 when an accepted source fails in a way that was not accepted', async () => {
		stravaAt(null);
		const response = await health();
		expect(response.status).toBe(503);
		expect((await response.json()).acceptable).toBe(false);
	});

	it('check-freshness keeps failing while anything is degraded, accepted or not', async () => {
		stravaAt('2026-06-01T00:00:00.000Z');
		const response = await freshness();
		expect(response.status).toBe(503);
		expect((await response.json()).status).toBe('degraded');
	});
});
