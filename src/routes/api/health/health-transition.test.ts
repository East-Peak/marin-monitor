// The healthy ↔ degraded transition, with no outstanding subsource failures:
// 200 when every source is fresh, 503 as soon as any single one is not.
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
vi.mock('$lib/server/health/inventory', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/health/inventory')>()),
	KNOWN_SUBSOURCE_FAILURES: []
}));

const { GET: getHealth } = await import('./+server');
const { SOURCE_INVENTORY } = await import('$lib/server/health/inventory');

const event = () => ({ request: new Request('https://localhost/api/health') }) as any;

beforeEach(() => {
	mockReadBlobFreshnessTimestamp.mockReset();
	const now = new Date().toISOString();
	mockReadBlobFreshnessTimestamp.mockResolvedValue({ uploadedAt: now, lastUpdated: now });
});

describe('/api/health status transition', () => {
	it('returns 200 healthy when every source is fresh', async () => {
		const response = await getHealth(event());
		expect(response.status).toBe(200);
		expect((await response.json()).status).toBe('healthy');
	});

	it.each(SOURCE_INVENTORY.map((s) => [s.name, s.blobKey]))(
		'returns 503 when only %s has no observation',
		async (_name, blobKey) => {
			const now = new Date().toISOString();
			mockReadBlobFreshnessTimestamp.mockImplementation(async (key: string) =>
				key === blobKey
					? { uploadedAt: null, lastUpdated: null }
					: { uploadedAt: now, lastUpdated: now }
			);
			expect((await getHealth(event())).status).toBe(503);
		}
	);
});
