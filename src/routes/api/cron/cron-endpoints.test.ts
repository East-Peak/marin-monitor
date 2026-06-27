// src/routes/api/cron/cron-endpoints.test.ts
//
// Integration-style tests for the 5 most critical /api/cron/* server-route
// endpoints.  Each endpoint follows the same pattern:
//   1. verifyCronAuth() checks the Authorization header against CRON_SECRET
/* eslint-disable @typescript-eslint/no-explicit-any -- SvelteKit RequestEvent mocks; handlers use a subset of the full interface */
//   2. Call a scraper / external API to get fresh data
//   3. Write result to Vercel Blob via put()
//   4. Return { ok: true, ... } on success, { ok: false, error } on failure
//
// We mock @vercel/blob, $env/dynamic/private, scrapers, fetch-utils, and
// config modules so tests run without network or Vercel credentials.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────
// Module-level mocks (must precede dynamic imports)
// ──────────────────────────────────────────────────────────

const mockPut = vi.fn();
const mockHead = vi.fn();
const mockFetchWithTimeout = vi.fn();
const mockScrapeGroceryBasket = vi.fn();
const mockScrapeWineIndex = vi.fn();
const mockScrapeSegmentLeaderboardResult = vi.fn();
const mockMergeCatalogWithFallback = vi.fn();
const mockCatalogHasAllSeedSegments = vi.fn();
const mockReadLocalCuratedCatalog = vi.fn();
const mockBuildCompositeSnapshot = vi.fn();
const mockReadSuccessfulScrapeAt = vi.fn();
const mockWithPreservedSuccessfulScrapeMetadata = vi.fn();
const mockReadBlobFreshnessTimestamp = vi.fn();

vi.mock('@vercel/blob', () => ({
	put: mockPut,
	head: mockHead
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		CRON_SECRET: 'test-cron-secret',
		BLOB_READ_WRITE_TOKEN: 'test-blob-token'
	}
}));

vi.mock('$lib/server/fetch-utils', () => ({
	fetchWithTimeout: mockFetchWithTimeout
}));

vi.mock('$lib/server/scrapers/grocery-basket', () => ({
	scrapeGroceryBasket: mockScrapeGroceryBasket
}));

vi.mock('$lib/server/scrapers/wine-index', () => ({
	scrapeWineIndex: mockScrapeWineIndex
}));

vi.mock('$lib/server/scrapers/strava-leaderboards', () => ({
	scrapeSegmentLeaderboardResult: mockScrapeSegmentLeaderboardResult
}));

vi.mock('$lib/server/scrapers/strava-segments', () => ({
	mergeCatalogWithFallback: mockMergeCatalogWithFallback,
	catalogHasAllSeedSegments: mockCatalogHasAllSeedSegments,
	readLocalCuratedCatalog: mockReadLocalCuratedCatalog
}));

vi.mock('$lib/server/scrapers/composite', () => ({
	buildCompositeSnapshot: mockBuildCompositeSnapshot
}));

vi.mock('$lib/server/scrape-metadata', () => ({
	readSuccessfulScrapeAt: mockReadSuccessfulScrapeAt,
	withPreservedSuccessfulScrapeMetadata: mockWithPreservedSuccessfulScrapeMetadata
}));

vi.mock('$lib/server/blob-freshness', () => ({
	readBlobFreshnessTimestamp: mockReadBlobFreshnessTimestamp
}));

vi.mock('$lib/config/strava', () => ({
	STRAVA_ENABLED: true,
	STRAVA_SEGMENTS_BLOB: 'strava-segments.json',
	STRAVA_EVENTS_BLOB: 'strava-events.json',
	STRAVA_LEADERBOARDS_BLOB: 'strava-leaderboards-all.json',
	STRAVA_EVENT_MAX_AGE_MS: 30 * 24 * 60 * 60 * 1000,
	stravaLeaderboardBlob: (id: number) => `strava-leaderboard-${id}.json`
}));

vi.mock('$lib/config/composite', () => ({
	COMPOSITE_BLOB_KEY: 'marin-composite.json',
	MAX_COMPOSITE_HISTORY: 52
}));

vi.mock('$lib/config/coffee', () => ({
	CAPPUCCINO_BLOB_KEY: 'marin-cappuccino.json',
	COFFEE_INDEX_BLOB_KEY: 'marin-coffee-index.json'
}));

vi.mock('$lib/config/wine', () => ({
	WINE_INDEX_BLOB_KEY: 'marin-wine-index.json',
	MAX_WINE_HISTORY: 52
}));

vi.mock('$lib/config/fitness', () => ({
	FITNESS_BLOB_KEY: 'marin-fitness.json'
}));

vi.mock('$lib/config/schools', () => ({
	SCHOOL_TUITION_BLOB_KEY: 'marin-school-tuition.json'
}));

// ──────────────────────────────────────────────────────────
// Dynamic imports (resolved after mocks are wired)
// ──────────────────────────────────────────────────────────

const { GET: get311 } = await import('./sync-311/+server');
const { GET: getStravaLeaderboards } = await import('./sync-strava-leaderboards/+server');
const { GET: getComposite } = await import('./sync-composite/+server');
const { GET: getGroceryBasket } = await import('./sync-grocery-basket/+server');
const { GET: getWineIndex } = await import('./sync-wine-index/+server');

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

/** Build a minimal RequestEvent-like object for SvelteKit GET handlers. */
function makeEvent(authHeader?: string) {
	const headers = new Headers();
	if (authHeader) {
		headers.set('authorization', authHeader);
	}
	return { request: new Request('https://localhost/api/cron/test', { headers }) } as any;
}

/** Shorthand: event with valid cron auth. */
function authedEvent() {
	return makeEvent('Bearer test-cron-secret');
}

/** Shorthand: event with wrong cron auth. */
function badAuthEvent() {
	return makeEvent('Bearer wrong-secret');
}

/** Shorthand: event with no auth header. */
function noAuthEvent() {
	return makeEvent();
}

/** Build a mock Response that returns JSON. */
function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

// ──────────────────────────────────────────────────────────
// Reset all mocks before each test
// ──────────────────────────────────────────────────────────

beforeEach(() => {
	mockPut.mockReset();
	mockHead.mockReset();
	mockFetchWithTimeout.mockReset();
	mockScrapeGroceryBasket.mockReset();
	mockScrapeWineIndex.mockReset();
	mockScrapeSegmentLeaderboardResult.mockReset();
	mockMergeCatalogWithFallback.mockReset();
	mockCatalogHasAllSeedSegments.mockReset();
	mockReadLocalCuratedCatalog.mockReset();
	mockBuildCompositeSnapshot.mockReset();
	mockReadSuccessfulScrapeAt.mockReset();
	mockWithPreservedSuccessfulScrapeMetadata.mockReset();

	// Default: put always resolves
	mockPut.mockResolvedValue({ url: 'https://blob.test/result.json' });
});

// ══════════════════════════════════════════════════════════
// /api/cron/sync-311
// ══════════════════════════════════════════════════════════

describe('/api/cron/sync-311', () => {
	const sampleApiResponse = {
		issues: [
			{ id: 101, summary: 'Pothole on Miller Ave', status: 'open' },
			{ id: 102, summary: 'Graffiti downtown', status: 'acknowledged' }
		]
	};

	function mockSeeClickFixSuccess() {
		mockFetchWithTimeout.mockResolvedValue(jsonResponse(sampleApiResponse));
	}

	it('returns 401 when Authorization header is missing', async () => {
		const response = await get311(noAuthEvent());
		expect(response.status).toBe(401);
	});

	it('returns 401 when CRON_SECRET is wrong', async () => {
		const response = await get311(badAuthEvent());
		expect(response.status).toBe(401);
	});

	it('returns 200 on successful sync', async () => {
		mockSeeClickFixSuccess();

		const response = await get311(authedEvent());
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.ok).toBe(true);
		expect(data.count).toBe(2);
	});

	it('writes to blob storage with correct key', async () => {
		mockSeeClickFixSuccess();

		await get311(authedEvent());

		expect(mockPut).toHaveBeenCalledWith(
			'marin-311.json',
			expect.any(String),
			expect.objectContaining({
				access: 'private',
				contentType: 'application/json',
				token: 'test-blob-token'
			})
		);
	});

	it('handles scraper failure gracefully (returns 500, does not crash)', async () => {
		mockFetchWithTimeout.mockRejectedValue(new Error('SeeClickFix API timeout'));

		const response = await get311(authedEvent());
		expect(response.status).toBe(500);

		const data = await response.json();
		expect(data.ok).toBe(false);
		expect(data.error).toBe('sync failed');
	});

	it('handles non-OK API response gracefully', async () => {
		mockFetchWithTimeout.mockResolvedValue(new Response('Service Unavailable', { status: 503 }));

		const response = await get311(authedEvent());
		expect(response.status).toBe(500);

		const data = await response.json();
		expect(data.ok).toBe(false);
		expect(data.error).toBe('sync failed');
	});
});

// ══════════════════════════════════════════════════════════
// /api/cron/sync-strava-leaderboards
// ══════════════════════════════════════════════════════════

describe('/api/cron/sync-strava-leaderboards', () => {
	const testSegments = [
		{ id: 1, name: 'Hawk Hill', distance: 2800, elevationGain: 200, avgGrade: 7.1 },
		{ id: 2, name: 'Camino Alto', distance: 1600, elevationGain: 120, avgGrade: 6.5 }
	];

	const testCatalog = {
		segments: testSegments,
		lastUpdated: '2026-03-30T00:00:00Z'
	};

	function mockStravaSuccess() {
		mockReadLocalCuratedCatalog.mockReturnValue(testCatalog);
		mockMergeCatalogWithFallback.mockReturnValue(testCatalog);
		mockCatalogHasAllSeedSegments.mockReturnValue(true);
		// head() for reading existing blobs — return null (no existing data)
		mockHead.mockRejectedValue(new Error('not found'));
		// Each segment scrape returns a leaderboard
		mockScrapeSegmentLeaderboardResult.mockResolvedValue({
			kind: 'ok',
			leaderboard: {
				segmentId: 1,
				segmentName: 'Test Segment',
				cr: null,
				qom: null,
				rows: [],
				totalAttempts: 100,
				totalAthletes: 50,
				distance: 2800,
				elevationGain: 200,
				avgGrade: 7.1,
				scrapedAt: '2026-04-01T00:00:00Z'
			}
		});
		mockReadSuccessfulScrapeAt.mockReturnValue(null);
	}

	it('returns 401 when Authorization header is missing', async () => {
		const response = await getStravaLeaderboards(noAuthEvent());
		expect(response.status).toBe(401);
	});

	it('returns 401 when CRON_SECRET is wrong', async () => {
		const response = await getStravaLeaderboards(badAuthEvent());
		expect(response.status).toBe(401);
	});

	it('returns 200 on successful sync', async () => {
		mockStravaSuccess();

		const response = await getStravaLeaderboards(authedEvent());
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.ok).toBe(true);
		expect(data.scraped).toBeGreaterThanOrEqual(0);
	});

	it('writes leaderboard blobs via put()', async () => {
		mockStravaSuccess();

		await getStravaLeaderboards(authedEvent());

		// At minimum, the combined leaderboards blob and events blob should be written
		const putCalls = mockPut.mock.calls;
		const blobKeys = putCalls.map((call: unknown[]) => call[0]);
		expect(blobKeys).toContain('strava-leaderboards-all.json');
		expect(blobKeys).toContain('strava-events.json');
	});

	it('handles scraper failure gracefully (returns 500, does not crash)', async () => {
		mockReadLocalCuratedCatalog.mockImplementation(() => {
			throw new Error('Catalog file corrupted');
		});

		const response = await getStravaLeaderboards(authedEvent());
		expect(response.status).toBe(500);

		const data = await response.json();
		expect(data.ok).toBe(false);
		expect(data.error).toBe('sync failed');
	});
});

// ══════════════════════════════════════════════════════════
// /api/cron/sync-composite
// ══════════════════════════════════════════════════════════

describe('/api/cron/sync-composite', () => {
	const mockSnapshot = {
		timestamp: '2026-04-01T00:00:00Z',
		tiers: [],
		compositeScore: 72,
		marinNumber: {
			total: 245000,
			items: [
				{ name: 'Grocery', source: 'live', value: 87 },
				{ name: 'Wine', source: 'live', value: 42 }
			],
			annualized: 2940000
		}
	};

	function mockCompositeSuccess() {
		// head() for reading individual index blobs — all "not found" is fine
		mockHead.mockRejectedValue(new Error('not found'));
		mockBuildCompositeSnapshot.mockReturnValue(mockSnapshot);
	}

	it('returns 401 when Authorization header is missing', async () => {
		const response = await getComposite(noAuthEvent());
		expect(response.status).toBe(401);
	});

	it('returns 401 when CRON_SECRET is wrong', async () => {
		const response = await getComposite(badAuthEvent());
		expect(response.status).toBe(401);
	});

	it('returns 200 on successful sync', async () => {
		mockCompositeSuccess();

		const response = await getComposite(authedEvent());
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.ok).toBe(true);
		expect(data.compositeScore).toBe(72);
		expect(data.marinNumber).toBe(245000);
	});

	it('writes composite blob via put()', async () => {
		mockCompositeSuccess();

		await getComposite(authedEvent());

		expect(mockPut).toHaveBeenCalledWith(
			'marin-composite.json',
			expect.any(String),
			expect.objectContaining({
				access: 'private',
				contentType: 'application/json',
				token: 'test-blob-token'
			})
		);
	});

	it('handles builder failure gracefully (returns 500, does not crash)', async () => {
		mockHead.mockRejectedValue(new Error('not found'));
		mockBuildCompositeSnapshot.mockImplementation(() => {
			throw new Error('Missing required inputs');
		});

		const response = await getComposite(authedEvent());
		expect(response.status).toBe(500);

		const data = await response.json();
		expect(data.ok).toBe(false);
		expect(data.error).toBe('sync failed');
	});
});

// ══════════════════════════════════════════════════════════
// /api/cron/sync-grocery-basket
// ══════════════════════════════════════════════════════════

describe('/api/cron/sync-grocery-basket', () => {
	const mockSnapshot = {
		timestamp: '2026-04-01T00:00:00Z',
		totalCheapest: 87.42,
		totalExpensive: 112.55,
		itemsFound: 12,
		lastSuccessfulScrapeAt: '2026-04-01T00:00:00Z',
		items: [
			{
				itemId: 'eggs',
				itemName: 'Large Eggs (dozen)',
				cheapest: 4.99,
				cheapestStore: "Trader Joe's",
				mostExpensive: 7.49,
				mostExpensiveStore: 'Whole Foods',
				storePrices: []
			}
		]
	};

	function mockGrocerySuccess() {
		mockScrapeGroceryBasket.mockResolvedValue(mockSnapshot);
		mockWithPreservedSuccessfulScrapeMetadata.mockReturnValue(mockSnapshot);
		// head() for reading existing blob — not found (first sync)
		mockHead.mockRejectedValue(new Error('not found'));
	}

	it('returns 401 when Authorization header is missing', async () => {
		const response = await getGroceryBasket(noAuthEvent());
		expect(response.status).toBe(401);
	});

	it('returns 401 when CRON_SECRET is wrong', async () => {
		const response = await getGroceryBasket(badAuthEvent());
		expect(response.status).toBe(401);
	});

	it('returns 200 on successful sync', async () => {
		mockGrocerySuccess();

		const response = await getGroceryBasket(authedEvent());
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.ok).toBe(true);
		expect(data.itemsFound).toBe(12);
		expect(data.totalCheapest).toBe(87.42);
	});

	it('writes grocery blob via put()', async () => {
		mockGrocerySuccess();

		await getGroceryBasket(authedEvent());

		expect(mockPut).toHaveBeenCalledWith(
			'marin-grocery-basket.json',
			expect.any(String),
			expect.objectContaining({
				access: 'private',
				contentType: 'application/json',
				token: 'test-blob-token'
			})
		);
	});

	it('handles scraper failure gracefully (returns 500, does not crash)', async () => {
		mockScrapeGroceryBasket.mockRejectedValue(new Error('Store website changed layout'));

		const response = await getGroceryBasket(authedEvent());
		expect(response.status).toBe(500);

		const data = await response.json();
		expect(data.ok).toBe(false);
		expect(data.error).toBe('sync failed');
	});

	it('does not write to blob when scraper throws', async () => {
		mockScrapeGroceryBasket.mockRejectedValue(new Error('Network error'));

		await getGroceryBasket(authedEvent());

		expect(mockPut).not.toHaveBeenCalled();
	});
});

// ══════════════════════════════════════════════════════════
// /api/cron/sync-wine-index
// ══════════════════════════════════════════════════════════

describe('/api/cron/sync-wine-index', () => {
	const mockSnapshot = {
		timestamp: '2026-04-01T00:00:00Z',
		categories: [
			{ category: 'cab-sauv', label: 'Cabernet Sauvignon', medianPrice: 38.99, productCount: 45 },
			{ category: 'pinot-noir', label: 'Pinot Noir', medianPrice: 29.99, productCount: 62 }
		],
		staffPicks: [{ name: 'Ridge Monte Bello', price: 185 }],
		allocatedWines: [{ name: 'Opus One', price: 425 }]
	};

	function mockWineSuccess() {
		mockScrapeWineIndex.mockResolvedValue(mockSnapshot);
		// head() for reading existing blob — not found (first sync)
		mockHead.mockRejectedValue(new Error('not found'));
	}

	it('returns 401 when Authorization header is missing', async () => {
		const response = await getWineIndex(noAuthEvent());
		expect(response.status).toBe(401);
	});

	it('returns 401 when CRON_SECRET is wrong', async () => {
		const response = await getWineIndex(badAuthEvent());
		expect(response.status).toBe(401);
	});

	it('returns 200 on successful sync', async () => {
		mockWineSuccess();

		const response = await getWineIndex(authedEvent());
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.ok).toBe(true);
		expect(data.categories).toHaveLength(2);
		expect(data.staffPickCount).toBe(1);
		expect(data.allocatedCount).toBe(1);
	});

	it('writes wine index blob via put()', async () => {
		mockWineSuccess();

		await getWineIndex(authedEvent());

		expect(mockPut).toHaveBeenCalledWith(
			'marin-wine-index.json',
			expect.any(String),
			expect.objectContaining({
				access: 'private',
				contentType: 'application/json',
				token: 'test-blob-token'
			})
		);
	});

	it('handles scraper failure gracefully (returns 500, does not crash)', async () => {
		mockScrapeWineIndex.mockRejectedValue(new Error('Wine shop returned 403'));

		const response = await getWineIndex(authedEvent());
		expect(response.status).toBe(500);

		const data = await response.json();
		expect(data.ok).toBe(false);
		expect(data.error).toBe('sync failed');
	});

	it('does not write to blob when scraper throws', async () => {
		mockScrapeWineIndex.mockRejectedValue(new Error('Scrape failed'));

		await getWineIndex(authedEvent());

		expect(mockPut).not.toHaveBeenCalled();
	});
});
