import { describe, it, expect, vi, beforeEach } from 'vitest';

// Module-level mocks (must precede dynamic imports)
const mockHead = vi.fn();
const mockFetchWithTimeout = vi.fn();
const mockEnv: Record<string, string | undefined> = { BLOB_READ_WRITE_TOKEN: 'test-token' };

vi.mock('@vercel/blob', () => ({ head: mockHead }));
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout: mockFetchWithTimeout }));

const { serveBlobJson } = await import('./blob-endpoint');

beforeEach(() => {
	mockHead.mockReset();
	mockFetchWithTimeout.mockReset();
	mockEnv.BLOB_READ_WRITE_TOKEN = 'test-token';
});

describe('serveBlobJson — happy path', () => {
	it('returns blob body with success cache headers when blob exists and fetch succeeds', async () => {
		mockHead.mockResolvedValueOnce({ downloadUrl: 'https://blob.test/data.json' });
		mockFetchWithTimeout.mockResolvedValueOnce(
			new Response('{"hello":"world"}', { status: 200, headers: { 'Content-Type': 'application/json' } })
		);

		const response = await serveBlobJson({
			blobKey: 'marin-test.json',
			successCacheControl: 'public, s-maxage=3600, stale-while-revalidate=7200'
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/json');
		expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600, stale-while-revalidate=7200');
		expect(await response.text()).toBe('{"hello":"world"}');
	});

	it('passes blob token in Authorization header to fetch', async () => {
		mockHead.mockResolvedValueOnce({ downloadUrl: 'https://blob.test/data.json' });
		mockFetchWithTimeout.mockResolvedValueOnce(new Response('{}', { status: 200 }));

		await serveBlobJson({ blobKey: 'marin-test.json', successCacheControl: 'public, s-maxage=60' });

		expect(mockFetchWithTimeout).toHaveBeenCalledWith(
			'https://blob.test/data.json',
			expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
			8000
		);
	});

	it('uses configured timeout when provided', async () => {
		mockHead.mockResolvedValueOnce({ downloadUrl: 'https://blob.test/data.json' });
		mockFetchWithTimeout.mockResolvedValueOnce(new Response('{}', { status: 200 }));

		await serveBlobJson({ blobKey: 'marin-test.json', successCacheControl: 'public, s-maxage=60', timeoutMs: 15000 });

		expect(mockFetchWithTimeout).toHaveBeenCalledWith(expect.anything(), expect.anything(), 15000);
	});
});

describe('serveBlobJson — failure modes return 503 with structured error body', () => {
	it('returns 503 when BLOB_READ_WRITE_TOKEN is missing', async () => {
		mockEnv.BLOB_READ_WRITE_TOKEN = undefined;

		const response = await serveBlobJson({
			blobKey: 'marin-test.json',
			successCacheControl: 'public, s-maxage=60'
		});

		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.error).toBe('misconfigured');
		expect(body.message).toContain('BLOB_READ_WRITE_TOKEN');
		expect(mockHead).not.toHaveBeenCalled();
	});

	it('returns 503 when head() throws (blob does not exist yet)', async () => {
		mockHead.mockRejectedValueOnce(new Error('blob not found'));

		const response = await serveBlobJson({
			blobKey: 'marin-test.json',
			successCacheControl: 'public, s-maxage=60'
		});

		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.error).toBe('blob_unavailable');
		expect(body.blobKey).toBe('marin-test.json');
	});

	it('returns 503 when fetch throws', async () => {
		mockHead.mockResolvedValueOnce({ downloadUrl: 'https://blob.test/data.json' });
		mockFetchWithTimeout.mockRejectedValueOnce(new Error('network unreachable'));

		const response = await serveBlobJson({
			blobKey: 'marin-test.json',
			successCacheControl: 'public, s-maxage=60'
		});

		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.error).toBe('blob_fetch_failed');
	});

	it('returns 503 when fetch returns a non-OK response', async () => {
		mockHead.mockResolvedValueOnce({ downloadUrl: 'https://blob.test/data.json' });
		mockFetchWithTimeout.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));

		const response = await serveBlobJson({
			blobKey: 'marin-test.json',
			successCacheControl: 'public, s-maxage=60'
		});

		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.error).toBe('blob_fetch_failed');
		expect(body.upstreamStatus).toBe(500);
	});

	it('error responses use a short cache so transient failures clear quickly', async () => {
		mockHead.mockRejectedValueOnce(new Error('boom'));

		const response = await serveBlobJson({
			blobKey: 'marin-test.json',
			successCacheControl: 'public, s-maxage=3600, stale-while-revalidate=7200'
		});

		const cc = response.headers.get('Cache-Control') ?? '';
		expect(cc).toContain('s-maxage=10');
		expect(cc).not.toContain('s-maxage=3600');
	});

	it('error responses include a timestamp for operator triage', async () => {
		mockHead.mockRejectedValueOnce(new Error('boom'));

		const response = await serveBlobJson({
			blobKey: 'marin-test.json',
			successCacheControl: 'public, s-maxage=60'
		});

		const body = await response.json();
		expect(typeof body.timestamp).toBe('string');
		expect(() => new Date(body.timestamp)).not.toThrow();
	});
});
