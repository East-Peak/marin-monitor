// src/routes/api/health/health.test.ts
//
// Contract for /api/health and /api/cron/check-freshness. Both classify via the
// shared evaluator over the frozen source inventory, so they must agree.
/* eslint-disable @typescript-eslint/no-explicit-any -- SvelteKit RequestEvent mock; handlers use a subset of the full interface */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadBlobFreshnessTimestamp = vi.fn();
const mockFetchWithTimeout = vi.fn();
const mockReadNewsHealthFromBlob = vi.fn();

class MockBlobNotFoundError extends Error {}

vi.mock('@vercel/blob', () => ({
	head: vi.fn(),
	BlobNotFoundError: MockBlobNotFoundError
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		BLOB_READ_WRITE_TOKEN: 'test-token',
		CRON_SECRET: 'test-cron-secret',
		GOOGLE_PLACES_API_KEY: 'gp-key',
		NREL_API_KEY: '',
		OPEN_CHARGE_MAP_API_KEY: 'ocm-key',
		API_511_KEY: '511-key',
		SCRAPE_PROXY_URL: '',
		SCRAPE_PROXY_SECRET: ''
	}
}));

vi.mock('$lib/server/blob-freshness', () => ({
	readBlobFreshnessTimestamp: mockReadBlobFreshnessTimestamp
}));

vi.mock('$lib/server/fetch-utils', () => ({
	fetchWithTimeout: mockFetchWithTimeout
}));

vi.mock('$lib/server/news/health', () => ({
	NEWS_SNAPSHOT_SOURCE: 'News Snapshot',
	readNewsHealthFromBlob: mockReadNewsHealthFromBlob
}));

const freshNews = (failures: unknown[] = []) => ({
	observation: { kind: 'found', uploadedAt: null, contentTimestamp: new Date().toISOString() },
	failures
});

const staleFeed = (name: string) => ({
	name,
	parent: 'News feeds',
	problem: 'no successful fetch since 2026-09-28T00:00:00.000Z (last error: http-status: HTTP 404)',
	disposition: 'Repair or retire the feed in src/lib/config/feeds.ts'
});

const { GET: getHealth } = await import('./+server');
const { GET: getFreshness } = await import('../cron/check-freshness/+server');
const { SOURCE_INVENTORY } = await import('$lib/server/health/inventory');
const { mergeSubsourceFailures } = await import('$lib/server/health/report');

function makeEvent(path: string, authHeader?: string) {
	const headers = new Headers();
	if (authHeader) headers.set('authorization', authHeader);
	return { request: new Request(`https://localhost${path}`, { headers }) } as any;
}

const publicHealth = () => makeEvent('/api/health');
const authedHealth = () => makeEvent('/api/health', 'Bearer test-cron-secret');
const authedFreshness = () => makeEvent('/api/cron/check-freshness', 'Bearer test-cron-secret');

function allFresh() {
	const now = new Date().toISOString();
	mockReadBlobFreshnessTimestamp.mockResolvedValue({ uploadedAt: now, lastUpdated: now });
}

/** Every source fresh except the named one, whose content is 99 days old. */
function freshExcept(staleBlobKey: string) {
	const now = new Date().toISOString();
	const old = new Date(Date.now() - 99 * 86_400_000).toISOString();
	mockReadBlobFreshnessTimestamp.mockImplementation(async (blobKey: string) =>
		blobKey === staleBlobKey
			? { uploadedAt: now, lastUpdated: old }
			: { uploadedAt: now, lastUpdated: now }
	);
}

beforeEach(() => {
	mockReadBlobFreshnessTimestamp.mockReset();
	mockFetchWithTimeout.mockReset();
	mockReadNewsHealthFromBlob.mockReset();
	mockReadNewsHealthFromBlob.mockResolvedValue(freshNews());
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('/api/health', () => {
	it('lists every inventory source', async () => {
		allFresh();
		const data = await (await getHealth(publicHealth())).json();
		expect(data.sources.map((s: { name: string }) => s.name)).toEqual(
			SOURCE_INVENTORY.map((s) => s.name)
		);
		expect(data.summary.total).toBe(SOURCE_INVENTORY.length);
	});

	it('is healthy with 200 when every source is fresh and no subsource fails', async () => {
		allFresh();
		const response = await getHealth(publicHealth());
		const data = await response.json();
		expect(data.status).toBe('healthy');
		expect(data.subsources).toEqual([]);
		expect(response.status).toBe(200);
	});

	it('returns 503 while an unaccepted subsource fails', async () => {
		allFresh();
		mockReadNewsHealthFromBlob.mockResolvedValue(freshNews([staleFeed('KQED News')]));
		const response = await getHealth(publicHealth());
		expect((await response.json()).status).toBe('degraded');
		expect(response.status).toBe(503);
	});

	it('returns 503 when one source is stale despite a fresh upload', async () => {
		freshExcept('marin-coffee-index.json');
		const response = await getHealth(publicHealth());
		const data = await response.json();
		expect(response.status).toBe(503);
		const coffee = data.sources.find((s: { name: string }) => s.name === 'Marin Coffee Index');
		expect(coffee.status).toBe('stale');
	});

	it('reports a missing blob as unavailable and an unreadable one as unknown', async () => {
		mockReadBlobFreshnessTimestamp.mockImplementation(async (blobKey: string) => {
			if (blobKey === 'marin-ikon-pass.json') throw new MockBlobNotFoundError('missing');
			if (blobKey === 'marin-rivian-lease.json') throw new Error('network down');
			const now = new Date().toISOString();
			return { uploadedAt: now, lastUpdated: now };
		});
		const data = await (await getHealth(publicHealth())).json();
		const statusOf = (name: string) =>
			data.sources.find((s: { name: string }) => s.name === name).status;
		expect(statusOf('Ikon Pass')).toBe('unavailable');
		expect(statusOf('Rivian Lease')).toBe('unknown');
	});

	it('returns JSON with no-cache', async () => {
		allFresh();
		const response = await getHealth(publicHealth());
		expect(response.headers.get('Content-Type')).toBe('application/json');
		expect(response.headers.get('Cache-Control')).toBe('no-cache');
	});

	it('excludes internal diagnostics, blob keys and error detail without cron auth', async () => {
		allFresh();
		const body = await (await getHealth(publicHealth())).text();
		const data = JSON.parse(body);
		expect(data.internal).toBeUndefined();
		expect(body).not.toContain('.json');
		expect(body).not.toContain('API_KEY');
	});

	it('includes internal diagnostics with cron auth', async () => {
		allFresh();
		mockReadNewsHealthFromBlob.mockResolvedValue(freshNews([staleFeed('KQED News')]));
		const data = await (await getHealth(authedHealth())).json();
		expect(data.internal.apiKeys).toContainEqual({ name: 'GOOGLE_PLACES_API_KEY', set: true });
		expect(data.internal.apiKeys).toContainEqual({ name: 'NREL_API_KEY', set: false });
		expect(data.internal.blobKeys['Cappuccino']).toBe('marin-cappuccino.json');
		expect(data.internal.subsources[0]).toHaveProperty('problem');
		expect(data.internal.subsources[0]).toHaveProperty('disposition');
	});

	it('publishes subsources as name, parent, status (and acceptedUntil when accepted) only', async () => {
		allFresh();
		mockReadNewsHealthFromBlob.mockResolvedValue(freshNews([staleFeed('KQED News')]));
		const data = await (await getHealth(publicHealth())).json();
		expect(data.subsources).toHaveLength(1);
		for (const subsource of data.subsources) {
			const expected = ['name', 'parent', 'status'];
			if ('acceptedUntil' in subsource) expected.unshift('acceptedUntil');
			expect(Object.keys(subsource).sort()).toEqual(expected);
		}
	});
});

describe('/api/cron/check-freshness', () => {
	it('rejects unauthorized calls', async () => {
		allFresh();
		const response = await getFreshness(makeEvent('/api/cron/check-freshness'));
		expect(response.status).toBe(401);
		expect(mockReadBlobFreshnessTimestamp).not.toHaveBeenCalled();
	});

	it('returns non-2xx when degraded', async () => {
		freshExcept('marin-grocery-basket.json');
		const response = await getFreshness(authedFreshness());
		expect(response.status).toBe(503);
		expect((await response.json()).status).toBe('degraded');
	});

	it('classifies every source identically to /api/health', async () => {
		freshExcept('strava-events.json');
		const health = await (await getHealth(publicHealth())).json();
		const freshness = await (await getFreshness(authedFreshness())).json();
		const statuses = (report: { sources: { name: string; status: string }[] }) =>
			report.sources.map(({ name, status }) => ({ name, status }));
		expect(statuses(freshness)).toEqual(statuses(health));
		expect(freshness.status).toBe(health.status);
	});
});

describe('/api/health — live news feed failures', () => {
	it('adds a stale producer feed to the subsources', async () => {
		allFresh();
		mockReadNewsHealthFromBlob.mockResolvedValue(freshNews([staleFeed('KQED News')]));
		const data = await (await getHealth(publicHealth())).json();
		expect(data.subsources).toContainEqual({
			name: 'KQED News',
			parent: 'News feeds',
			status: 'unavailable'
		});
	});

	it('does not repeat a feed already declared as a known failure', () => {
		const declared = [{ ...staleFeed('Fairfax Police'), parent: 'Police Logs' }];
		const merged = mergeSubsourceFailures(declared, [
			staleFeed('Fairfax Police'),
			staleFeed('KQED News')
		]);
		expect(merged.map((f) => [f.name, f.parent])).toEqual([
			['Fairfax Police', 'Police Logs'],
			['KQED News', 'News feeds']
		]);
	});
});

describe('/api/health — News Snapshot comes from the validated read', () => {
	it.each([
		['missing', { kind: 'missing' }, 'unavailable'],
		['unreadable, invalid or unsupported', { kind: 'error' }, 'unknown']
	])(
		'a %s snapshot makes News Snapshot %s and the report degraded',
		async (_l, observation, status) => {
			allFresh();
			mockReadNewsHealthFromBlob.mockResolvedValue({ observation, failures: [] });
			const response = await getHealth(publicHealth());
			const data = await response.json();
			expect(data.sources.find((s: { name: string }) => s.name === 'News Snapshot').status).toBe(
				status
			);
			expect(response.status).toBe(503);
		}
	);

	it('never reads the snapshot through the timestamp-only path', async () => {
		allFresh();
		await getHealth(publicHealth());
		expect(mockReadBlobFreshnessTimestamp).not.toHaveBeenCalledWith(
			'news/v1/snapshot.json',
			expect.anything(),
			expect.anything()
		);
	});
});
