import { describe, expect, it, vi, beforeEach } from 'vitest';

// Module-level mocks for readBlobFreshnessTimestamp tests
const mockHead = vi.fn();
const mockFetchWithTimeout = vi.fn();

vi.mock('@vercel/blob', () => ({ head: mockHead }));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout: mockFetchWithTimeout }));

const { extractBlobFreshnessTimestamp, readBlobFreshnessTimestamp } =
	await import('./blob-freshness');

beforeEach(() => {
	mockHead.mockReset();
	mockFetchWithTimeout.mockReset();
});

describe('extractBlobFreshnessTimestamp', () => {
	it('reads standardized freshness metadata from current snapshots', () => {
		expect(
			extractBlobFreshnessTimestamp({
				current: {
					timestamp: '2026-03-30T12:00:00.000Z',
					lastSuccessfulScrapeAt: '2026-03-29T12:00:00.000Z'
				}
			})
		).toBe('2026-03-29T12:00:00.000Z');
	});

	it('falls back to direct-object lastUpdated metadata', () => {
		expect(
			extractBlobFreshnessTimestamp({
				lastUpdated: '2026-03-28T12:00:00.000Z'
			})
		).toBe('2026-03-28T12:00:00.000Z');
	});

	it('returns null for array-backed blobs without embedded metadata', () => {
		expect(extractBlobFreshnessTimestamp([{ timestamp: '2026-03-30T12:00:00.000Z' }])).toBeNull();
	});
});

describe('readBlobFreshnessTimestamp — manual datasets (preferContent=false)', () => {
	it('returns uploadedAt as lastUpdated for snapshot-style blobs', async () => {
		const uploadedAt = new Date('2026-03-30T12:00:00.000Z');
		mockHead.mockResolvedValueOnce({ uploadedAt, downloadUrl: 'https://blob.test/x.json' });

		const result = await readBlobFreshnessTimestamp('marin-test.json', 'tok');

		expect(result.uploadedAt).toBe(uploadedAt.toISOString());
		expect(result.lastUpdated).toBe(uploadedAt.toISOString());
		expect(mockFetchWithTimeout).not.toHaveBeenCalled();
	});
});

describe('readBlobFreshnessTimestamp — live-scrape datasets (preferContent=true)', () => {
	const uploadedAt = new Date('2026-03-30T12:00:00.000Z');

	it('returns content lastSuccessfulScrapeAt when present', async () => {
		mockHead.mockResolvedValueOnce({ uploadedAt, downloadUrl: 'https://blob.test/x.json' });
		mockFetchWithTimeout.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					current: {
						timestamp: '2026-03-30T12:00:00.000Z',
						lastSuccessfulScrapeAt: '2026-03-25T08:00:00.000Z'
					}
				}),
				{ status: 200 }
			)
		);

		const result = await readBlobFreshnessTimestamp('marin-test.json', 'tok', {
			preferContent: true
		});

		expect(result.uploadedAt).toBe(uploadedAt.toISOString());
		expect(result.lastUpdated).toBe('2026-03-25T08:00:00.000Z');
	});

	it('returns null lastUpdated when content has no scrape metadata (does NOT fall back to uploadedAt)', async () => {
		mockHead.mockResolvedValueOnce({ uploadedAt, downloadUrl: 'https://blob.test/x.json' });
		mockFetchWithTimeout.mockResolvedValueOnce(
			new Response(JSON.stringify({ current: { timestamp: '2026-03-30T12:00:00.000Z' } }), {
				status: 200
			})
		);

		const result = await readBlobFreshnessTimestamp('marin-test.json', 'tok', {
			preferContent: true
		});

		expect(result.uploadedAt).toBe(uploadedAt.toISOString());
		expect(result.lastUpdated).toBeNull();
	});

	it('returns null lastUpdated when content fetch returns non-OK (does NOT fall back to uploadedAt)', async () => {
		mockHead.mockResolvedValueOnce({ uploadedAt, downloadUrl: 'https://blob.test/x.json' });
		mockFetchWithTimeout.mockResolvedValueOnce(new Response('Internal Error', { status: 500 }));

		const result = await readBlobFreshnessTimestamp('marin-test.json', 'tok', {
			preferContent: true
		});

		expect(result.uploadedAt).toBe(uploadedAt.toISOString());
		expect(result.lastUpdated).toBeNull();
	});

	it('returns null lastUpdated when content fetch throws (does NOT fall back to uploadedAt)', async () => {
		mockHead.mockResolvedValueOnce({ uploadedAt, downloadUrl: 'https://blob.test/x.json' });
		mockFetchWithTimeout.mockRejectedValueOnce(new Error('network unreachable'));

		const result = await readBlobFreshnessTimestamp('marin-test.json', 'tok', {
			preferContent: true
		});

		expect(result.uploadedAt).toBe(uploadedAt.toISOString());
		expect(result.lastUpdated).toBeNull();
	});
});
