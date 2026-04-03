// src/routes/api/data/data-endpoints.test.ts
//
// Integration-style tests for the 5 most critical /api/data/* server-route
// endpoints.  Each endpoint follows the same pattern:
//   1. head() from @vercel/blob to locate the blob
//   2. fetchWithTimeout() to download its contents
//   3. Return JSON with cache headers on success
//   4. Return fallback empty JSON on failure (blob missing / fetch error)
//
// We mock @vercel/blob, $env/dynamic/private, and $lib/server/fetch-utils so
// that the tests run without network access or Vercel credentials.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────
// Module-level mocks (must precede dynamic imports)
// ──────────────────────────────────────────────────────────

const mockHead = vi.fn();
const mockFetchWithTimeout = vi.fn();

vi.mock('@vercel/blob', () => ({
	head: mockHead
}));

vi.mock('$env/dynamic/private', () => ({
	env: { BLOB_READ_WRITE_TOKEN: 'test-token' }
}));

vi.mock('$lib/server/fetch-utils', () => ({
	fetchWithTimeout: mockFetchWithTimeout
}));

// ──────────────────────────────────────────────────────────
// Dynamic imports (resolved after mocks are wired)
// ──────────────────────────────────────────────────────────

const { GET: get311 } = await import('./311/+server');
const { GET: getComposite } = await import('./composite/+server');
const { GET: getStravaLeaderboards } = await import('./strava-leaderboards/+server');
const { GET: getCappuccino } = await import('./cappuccino/+server');
const { GET: getGroceryBasket } = await import('./grocery-basket/+server');

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

/** Simulate a successful blob lookup + fetch cycle. */
function mockBlobSuccess(payload: unknown) {
	mockHead.mockResolvedValueOnce({ downloadUrl: 'https://blob.test/data.json' });
	mockFetchWithTimeout.mockResolvedValueOnce(jsonResponse(payload));
}

/** Simulate blob head() throwing (blob doesn't exist yet). */
function mockBlobMissing() {
	mockHead.mockRejectedValueOnce(new Error('blob not found'));
}

/** Simulate blob found but fetch returns non-OK. */
function mockBlobFetchFail() {
	mockHead.mockResolvedValueOnce({ downloadUrl: 'https://blob.test/data.json' });
	mockFetchWithTimeout.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
}

// ──────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────

beforeEach(() => {
	mockHead.mockReset();
	mockFetchWithTimeout.mockReset();
});

// ── /api/data/311 ──────────────────────────────────────

describe('/api/data/311', () => {
	const samplePayload = {
		issues: [{ id: 1, title: 'Pothole', status: 'open' }],
		lastUpdated: '2026-04-01T00:00:00Z',
		count: 1
	};

	it('returns blob data with correct cache headers on success', async () => {
		mockBlobSuccess(samplePayload);

		const response = await get311({} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual(samplePayload);

		const cc = response.headers.get('Cache-Control');
		expect(cc).toContain('s-maxage=300');
		expect(cc).toContain('stale-while-revalidate=3600');
	});

	it('returns Content-Type application/json', async () => {
		mockBlobSuccess(samplePayload);
		const response = await get311({} as any);
		expect(response.headers.get('Content-Type')).toBe('application/json');
	});

	it('returns fallback data when blob is missing', async () => {
		mockBlobMissing();

		const response = await get311({} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({ issues: [], lastUpdated: '', count: 0 });
	});

	it('returns fallback data when blob fetch fails', async () => {
		mockBlobFetchFail();

		const response = await get311({} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual({ issues: [], lastUpdated: '', count: 0 });
	});

	it('sets short cache on fallback responses', async () => {
		mockBlobMissing();
		const response = await get311({} as any);
		expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=60');
	});

	it('passes blob token to head()', async () => {
		mockBlobSuccess(samplePayload);
		await get311({} as any);
		expect(mockHead).toHaveBeenCalledWith('marin-311.json', { token: 'test-token' });
	});
});

// ── /api/data/composite ────────────────────────────────

describe('/api/data/composite', () => {
	const samplePayload = {
		current: { score: 72, timestamp: '2026-04-01T00:00:00Z' },
		history: [{ score: 70, timestamp: '2026-03-31T00:00:00Z' }]
	};

	it('returns blob data with long cache on success', async () => {
		mockBlobSuccess(samplePayload);

		const response = await getComposite({} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual(samplePayload);

		const cc = response.headers.get('Cache-Control');
		expect(cc).toContain('s-maxage=3600');
		expect(cc).toContain('stale-while-revalidate=7200');
	});

	it('returns fallback { current: null, history: [] } when blob missing', async () => {
		mockBlobMissing();

		const response = await getComposite({} as any);
		const data = await response.json();
		expect(data).toEqual({ current: null, history: [] });
	});

	it('returns fallback when fetch returns non-OK', async () => {
		mockBlobFetchFail();

		const response = await getComposite({} as any);
		const data = await response.json();
		expect(data).toEqual({ current: null, history: [] });
	});

	it('sets short cache on fallback', async () => {
		mockBlobMissing();
		const response = await getComposite({} as any);
		expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=60');
	});
});

// ── /api/data/strava-leaderboards ──────────────────────

describe('/api/data/strava-leaderboards', () => {
	const samplePayload = {
		leaderboards: {
			'hawk-hill': { segmentName: 'Hawk Hill', entries: [] }
		},
		lastUpdated: '2026-04-01T00:00:00Z'
	};

	it('returns blob data with cache headers on success', async () => {
		mockBlobSuccess(samplePayload);

		const response = await getStravaLeaderboards({} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual(samplePayload);

		const cc = response.headers.get('Cache-Control');
		expect(cc).toContain('s-maxage=300');
		expect(cc).toContain('stale-while-revalidate=600');
	});

	it('returns fallback { leaderboards: {}, lastUpdated: "" } when blob missing', async () => {
		mockBlobMissing();

		const response = await getStravaLeaderboards({} as any);
		const data = await response.json();
		expect(data).toEqual({ leaderboards: {}, lastUpdated: '' });
	});

	it('returns fallback when fetch returns non-OK', async () => {
		mockBlobFetchFail();

		const response = await getStravaLeaderboards({} as any);
		const data = await response.json();
		expect(data).toEqual({ leaderboards: {}, lastUpdated: '' });
	});

	it('uses 15-second timeout for fetch', async () => {
		mockBlobSuccess(samplePayload);
		await getStravaLeaderboards({} as any);

		expect(mockFetchWithTimeout).toHaveBeenCalledWith(
			'https://blob.test/data.json',
			expect.objectContaining({
				headers: { Authorization: 'Bearer test-token' }
			}),
			15000
		);
	});
});

// ── /api/data/cappuccino ───────────────────────────────

describe('/api/data/cappuccino', () => {
	const samplePayload = {
		current: {
			medianPrice: 5.25,
			shopCount: 12,
			timestamp: '2026-04-01T00:00:00Z'
		},
		history: [{ medianPrice: 5.20, timestamp: '2026-03-31T00:00:00Z' }]
	};

	it('returns blob data with long cache on success', async () => {
		mockBlobSuccess(samplePayload);

		const response = await getCappuccino({} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual(samplePayload);

		const cc = response.headers.get('Cache-Control');
		expect(cc).toContain('s-maxage=3600');
		expect(cc).toContain('stale-while-revalidate=7200');
	});

	it('returns fallback { current: null, history: [] } when blob missing', async () => {
		mockBlobMissing();

		const response = await getCappuccino({} as any);
		const data = await response.json();
		expect(data).toEqual({ current: null, history: [] });
	});

	it('returns fallback when fetch returns non-OK', async () => {
		mockBlobFetchFail();

		const response = await getCappuccino({} as any);
		const data = await response.json();
		expect(data).toEqual({ current: null, history: [] });
	});

	it('sets short cache on fallback', async () => {
		mockBlobMissing();
		const response = await getCappuccino({} as any);
		expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=60');
	});
});

// ── /api/data/grocery-basket ───────────────────────────

describe('/api/data/grocery-basket', () => {
	const samplePayload = {
		current: {
			totalCost: 87.42,
			stores: ['Whole Foods', 'Trader Joe\'s'],
			timestamp: '2026-04-01T00:00:00Z'
		},
		history: [{ totalCost: 86.30, timestamp: '2026-03-31T00:00:00Z' }]
	};

	it('returns blob data with cache headers on success', async () => {
		mockBlobSuccess(samplePayload);

		const response = await getGroceryBasket({} as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toEqual(samplePayload);

		const cc = response.headers.get('Cache-Control');
		expect(cc).toContain('s-maxage=300');
		expect(cc).toContain('stale-while-revalidate=600');
	});

	it('returns fallback { current: null, history: [] } when blob missing', async () => {
		mockBlobMissing();

		const response = await getGroceryBasket({} as any);
		const data = await response.json();
		expect(data).toEqual({ current: null, history: [] });
	});

	it('returns fallback when fetch returns non-OK', async () => {
		mockBlobFetchFail();

		const response = await getGroceryBasket({} as any);
		const data = await response.json();
		expect(data).toEqual({ current: null, history: [] });
	});

	it('passes blob token in Authorization header', async () => {
		mockBlobSuccess(samplePayload);
		await getGroceryBasket({} as any);

		expect(mockFetchWithTimeout).toHaveBeenCalledWith(
			'https://blob.test/data.json',
			expect.objectContaining({
				headers: { Authorization: 'Bearer test-token' }
			}),
			8000
		);
	});

	it('uses correct blob key', async () => {
		mockBlobSuccess(samplePayload);
		await getGroceryBasket({} as any);
		expect(mockHead).toHaveBeenCalledWith('marin-grocery-basket.json', { token: 'test-token' });
	});
});
