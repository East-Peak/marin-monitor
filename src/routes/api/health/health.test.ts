// src/routes/api/health/health.test.ts
//
// Contract for /api/health and /api/cron/check-freshness. Both classify via the
// shared evaluator over the frozen source inventory, so they must agree.
/* eslint-disable @typescript-eslint/no-explicit-any -- SvelteKit RequestEvent mock; handlers use a subset of the full interface */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadBlobFreshnessTimestamp = vi.fn();
const mockFetchWithTimeout = vi.fn();

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

const { GET: getHealth } = await import('./+server');
const { GET: getFreshness } = await import('../cron/check-freshness/+server');
const { SOURCE_INVENTORY } = await import('$lib/server/health/inventory');

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

	it('returns 503 and degraded while known subsource failures are unrepaired', async () => {
		allFresh();
		const response = await getHealth(publicHealth());
		const data = await response.json();
		expect(response.status).toBe(503);
		expect(data.status).toBe('degraded');
		expect(data.subsources.length).toBeGreaterThan(0);
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
		const data = await (await getHealth(authedHealth())).json();
		expect(data.internal.apiKeys).toContainEqual({ name: 'GOOGLE_PLACES_API_KEY', set: true });
		expect(data.internal.apiKeys).toContainEqual({ name: 'NREL_API_KEY', set: false });
		expect(data.internal.blobKeys['Cappuccino']).toBe('marin-cappuccino.json');
		expect(data.internal.subsources[0]).toHaveProperty('problem');
		expect(data.internal.subsources[0]).toHaveProperty('disposition');
	});

	it('publishes subsources as name, parent and status only', async () => {
		allFresh();
		const data = await (await getHealth(publicHealth())).json();
		for (const subsource of data.subsources) {
			expect(Object.keys(subsource).sort()).toEqual(['name', 'parent', 'status']);
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
