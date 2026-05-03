/**
 * Tests for load-all orchestrator
 *
 * Verifies the orchestration logic: parallel fetching, partial failure
 * handling, category merging, 311 direct injection, and error aggregation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NewsItem, NewsCategory, EarthquakeData } from '$lib/types';
import type { CategoryFetchResult } from './rss';

// ── Helpers ────────────────────────────────────────────────────────────

function makeNewsItem(overrides: Partial<NewsItem> = {}): NewsItem {
	return {
		id: overrides.id ?? `item-${Math.random().toString(36).slice(2, 8)}`,
		title: overrides.title ?? 'Test item',
		link: overrides.link ?? 'https://example.com',
		timestamp: overrides.timestamp ?? Date.now(),
		source: overrides.source ?? 'Test Source',
		category: overrides.category ?? 'local',
		verification: overrides.verification ?? 'local_media',
		...overrides
	};
}

function makeEarthquake(overrides: Partial<EarthquakeData> = {}): EarthquakeData {
	return {
		id: overrides.id ?? `eq-${Math.random().toString(36).slice(2, 8)}`,
		magnitude: overrides.magnitude ?? 3.2,
		place: overrides.place ?? '5km NE of San Rafael, CA',
		time: overrides.time ?? Date.now(),
		lat: overrides.lat ?? 37.97,
		lon: overrides.lon ?? -122.53,
		depth: overrides.depth ?? 8,
		url: overrides.url ?? 'https://earthquake.usgs.gov/earthquakes/eventpage/test',
		...overrides
	};
}

function makeCategoryResult(category: NewsCategory, items: NewsItem[] = [], errors: string[] = []): CategoryFetchResult {
	return { category, items, errors };
}

// ── Mocks ──────────────────────────────────────────────────────────────

// Mock the news store — track all calls to setItems, setLoading, enrichLocations, getItems
const mockSetItems = vi.fn();
const mockSetLoading = vi.fn();
const mockEnrichLocations = vi.fn();
const mockGetItems = vi.fn().mockReturnValue([]);

vi.mock('$lib/stores', () => ({
	news: {
		setItems: (...args: unknown[]) => mockSetItems(...args),
		setLoading: (...args: unknown[]) => mockSetLoading(...args),
		enrichLocations: (...args: unknown[]) => mockEnrichLocations(...args),
		getItems: (...args: unknown[]) => mockGetItems(...args)
	}
}));

// Mock all adapter functions from $lib/api/marin
const mockFetchAllFeeds = vi.fn();
const mockFetchNpsAlerts = vi.fn();
const mockFetchEarthquakes = vi.fn();
const mockEarthquakesToNewsItems = vi.fn();
const mockFetchTransitAlerts = vi.fn();
const mockFetchSheriffCrimeBlotter = vi.fn();
const mockFetchSupplementalPoliceLogs = vi.fn();
const mockFetchSupplementalActivityFeeds = vi.fn();
const mockFetchSeeClickFixIssues = vi.fn();
const mockEnrichItemsForRelevance = vi.fn();

vi.mock('$lib/api/marin', () => ({
	fetchAllFeeds: (...args: unknown[]) => mockFetchAllFeeds(...args),
	fetchNpsAlerts: (...args: unknown[]) => mockFetchNpsAlerts(...args),
	fetchEarthquakes: (...args: unknown[]) => mockFetchEarthquakes(...args),
	earthquakesToNewsItems: (...args: unknown[]) => mockEarthquakesToNewsItems(...args),
	fetchTransitAlerts: (...args: unknown[]) => mockFetchTransitAlerts(...args),
	fetchSheriffCrimeBlotter: (...args: unknown[]) => mockFetchSheriffCrimeBlotter(...args),
	fetchSupplementalPoliceLogs: (...args: unknown[]) => mockFetchSupplementalPoliceLogs(...args),
	fetchSupplementalActivityFeeds: (...args: unknown[]) => mockFetchSupplementalActivityFeeds(...args),
	fetchSeeClickFixIssues: (...args: unknown[]) => mockFetchSeeClickFixIssues(...args),
	enrichItemsForRelevance: (...args: unknown[]) => mockEnrichItemsForRelevance(...args)
}));

// ── Setup defaults ─────────────────────────────────────────────────────

function setupHappyPath() {
	mockFetchAllFeeds.mockResolvedValue([
		makeCategoryResult('local', [makeNewsItem({ id: 'local-1', category: 'local' })]),
		makeCategoryResult('safety', [makeNewsItem({ id: 'safety-1', category: 'safety' })]),
		makeCategoryResult('outdoors', [makeNewsItem({ id: 'outdoors-1', category: 'outdoors' })]),
		makeCategoryResult('311', [])
	]);
	mockFetchNpsAlerts.mockResolvedValue([makeNewsItem({ id: 'nps-1', category: 'outdoors' })]);
	mockFetchEarthquakes.mockResolvedValue([makeEarthquake({ id: 'eq-1' })]);
	mockEarthquakesToNewsItems.mockImplementation((eqs: EarthquakeData[]) =>
		eqs.length > 0 ? [makeNewsItem({ id: 'eq-news-1', category: 'safety' })] : []
	);
	mockFetchTransitAlerts.mockResolvedValue({ items: [makeNewsItem({ id: 'transit-1', category: 'safety' })], errors: [] });
	mockFetchSheriffCrimeBlotter.mockResolvedValue([makeNewsItem({ id: 'blotter-1', category: 'safety' })]);
	mockFetchSupplementalPoliceLogs.mockResolvedValue([makeNewsItem({ id: 'police-1', category: 'safety' })]);
	mockFetchSupplementalActivityFeeds.mockResolvedValue([]);
	mockFetchSeeClickFixIssues.mockResolvedValue([makeNewsItem({ id: 'scf-1', category: '311' })]);
	mockEnrichItemsForRelevance.mockImplementation((items: NewsItem[]) => Promise.resolve(items));
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('loadAllNews orchestrator', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetItems.mockReturnValue([]);
		setupHappyPath();
	});

	// ---------- Happy path ----------

	it('returns earthquake news items and raw earthquake data', async () => {
		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		expect(result.earthquakeNews).toHaveLength(1);
		expect(result.earthquakeNews[0].id).toBe('eq-news-1');
		expect(result.earthquakesRaw).toHaveLength(1);
		expect(result.earthquakesRaw[0].id).toBe('eq-1');
	});

	it('calls all eight data adapters in parallel', async () => {
		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		expect(mockFetchAllFeeds).toHaveBeenCalledOnce();
		expect(mockFetchNpsAlerts).toHaveBeenCalledOnce();
		expect(mockFetchEarthquakes).toHaveBeenCalledOnce();
		expect(mockFetchTransitAlerts).toHaveBeenCalledOnce();
		expect(mockFetchSheriffCrimeBlotter).toHaveBeenCalledOnce();
		expect(mockFetchSupplementalPoliceLogs).toHaveBeenCalledOnce();
		expect(mockFetchSupplementalActivityFeeds).toHaveBeenCalledOnce();
		expect(mockFetchSeeClickFixIssues).toHaveBeenCalledOnce();
	});

	it('populates the news store for each RSS category returned', async () => {
		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		// setItems should be called for each category from fetchAllFeeds + once for 311
		const setItemsCalls = mockSetItems.mock.calls;
		const categoriesSet = setItemsCalls.map((c: unknown[]) => c[0] as string);
		expect(categoriesSet).toContain('local');
		expect(categoriesSet).toContain('safety');
		expect(categoriesSet).toContain('outdoors');
	});

	// ---------- Category merging ----------

	it('merges earthquake + transit + blotter + police items into safety category', async () => {
		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		// Find the enrichItemsForRelevance call for safety category.
		// The function is called with merged items for each category.
		const safetyCalls = mockEnrichItemsForRelevance.mock.calls.filter((call: unknown[][]) => {
			const items = call[0] as NewsItem[];
			return items.some((i: NewsItem) => i.id === 'safety-1');
		});
		expect(safetyCalls.length).toBe(1);

		const safetyItems = safetyCalls[0][0] as NewsItem[];
		const ids = safetyItems.map((i: NewsItem) => i.id);
		expect(ids).toContain('safety-1');      // RSS item
		expect(ids).toContain('eq-news-1');      // earthquake
		expect(ids).toContain('transit-1');       // transit
		expect(ids).toContain('blotter-1');       // blotter
		expect(ids).toContain('police-1');        // police logs
	});

	it('merges NPS alerts into outdoors category', async () => {
		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		const outdoorsCalls = mockEnrichItemsForRelevance.mock.calls.filter((call: unknown[][]) => {
			const items = call[0] as NewsItem[];
			return items.some((i: NewsItem) => i.id === 'outdoors-1');
		});
		expect(outdoorsCalls.length).toBe(1);

		const outdoorsItems = outdoorsCalls[0][0] as NewsItem[];
		const ids = outdoorsItems.map((i: NewsItem) => i.id);
		expect(ids).toContain('outdoors-1');  // RSS item
		expect(ids).toContain('nps-1');       // NPS alert
	});

	it('does not merge extra sources into plain categories like local', async () => {
		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		const localCalls = mockEnrichItemsForRelevance.mock.calls.filter((call: unknown[][]) => {
			const items = call[0] as NewsItem[];
			return items.some((i: NewsItem) => i.id === 'local-1');
		});
		expect(localCalls.length).toBe(1);

		const localItems = localCalls[0][0] as NewsItem[];
		expect(localItems.length).toBe(1);
		expect(localItems[0].id).toBe('local-1');
	});

	// ---------- 311 / SeeClickFix integration ----------

	it('merges SeeClickFix issues into 311 category from RSS results', async () => {
		// If fetchAllFeeds returns a result for '311' category
		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('311', [makeNewsItem({ id: 'rss-311-1', category: '311' })])
		]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		// The enrichItemsForRelevance call for the '311' RSS result should include SeeClickFix items
		const calls311 = mockEnrichItemsForRelevance.mock.calls.filter((call: unknown[][]) => {
			const items = call[0] as NewsItem[];
			return items.some((i: NewsItem) => i.id === 'rss-311-1');
		});
		expect(calls311.length).toBe(1);
		const items311 = calls311[0][0] as NewsItem[];
		const ids = items311.map((i: NewsItem) => i.id);
		expect(ids).toContain('rss-311-1');
		expect(ids).toContain('scf-1');
	});

	it('sets 311 items directly when SeeClickFix has data and no RSS 311 results', async () => {
		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('local', [makeNewsItem({ id: 'local-1', category: 'local' })])
		]);
		mockFetchSeeClickFixIssues.mockResolvedValue([
			makeNewsItem({ id: 'scf-direct-1', category: '311' }),
			makeNewsItem({ id: 'scf-direct-2', category: '311' })
		]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		// The direct 311 fallback should call setItems('311', ...)
		const setItems311 = mockSetItems.mock.calls.filter((c: unknown[]) => c[0] === '311');
		expect(setItems311.length).toBeGreaterThanOrEqual(1);
	});

	// FIX-10 — 311 stale pinning. Old behavior: when fetchSeeClickFixIssues
	// returned [] (failure or legitimate empty) AND the store already had
	// items, the 311 store was never rewritten. Outages looked like "fresh
	// 311 reports still present"; legitimate empty refreshes left stale data
	// pinned forever. Correct semantics:
	//   success → always rewrite (even with [])
	//   failure → leave existing data intact (preserve last known good)

	it('rewrites 311 store with empty array when SeeClickFix succeeds with no items', async () => {
		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('local', [makeNewsItem({ id: 'local-1', category: 'local' })])
		]);
		mockFetchSeeClickFixIssues.mockResolvedValue([]); // success, but no current issues
		mockGetItems.mockReturnValue([
			makeNewsItem({ id: 'stale-311-1', category: '311' }) // store had stale items
		]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		// setItems must have been called for 311 with an empty list — old data cleared.
		const setItems311 = mockSetItems.mock.calls.filter((c: unknown[]) => c[0] === '311');
		expect(setItems311.length).toBe(1);
		expect(setItems311[0][1]).toEqual([]);
	});

	it('does NOT rewrite the 311 store when SeeClickFix fetch fails (preserves last known good)', async () => {
		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('local', [makeNewsItem({ id: 'local-1', category: 'local' })])
		]);
		mockFetchSeeClickFixIssues.mockRejectedValue(new Error('upstream 503'));
		mockGetItems.mockReturnValue([
			makeNewsItem({ id: 'previous-311-1', category: '311' })
		]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		const setItems311 = mockSetItems.mock.calls.filter((c: unknown[]) => c[0] === '311');
		expect(setItems311.length).toBe(0);
	});

	// R2 #7 — when the RSS pipeline returns a '311' category result, the
	// per-category loop already writes the merged store; the direct rewrite
	// must not run, otherwise it overwrites RSS-merged 311 items with
	// SeeClickFix-only data.
	it('does NOT do the direct 311 rewrite when fetchAllFeeds returned a 311 RSS result', async () => {
		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('311', [makeNewsItem({ id: 'rss-311-1', category: '311' })])
		]);
		mockFetchSeeClickFixIssues.mockResolvedValue([
			makeNewsItem({ id: 'scf-1', category: '311' })
		]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		// Exactly one setItems('311', ...) call — from the per-category merge
		// loop, not the direct rewrite.
		const setItems311 = mockSetItems.mock.calls.filter((c: unknown[]) => c[0] === '311');
		expect(setItems311.length).toBe(1);
	});

	// R2 #2 — `loadAllNews` returns per-adapter errors so refresh callers
	// (TV, dashboard) can pass them to `refresh.endRefresh(errors)` and have
	// the refresh history correctly record degraded vs. clean cycles.

	it('returns empty errors when every adapter succeeded', async () => {
		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();
		expect(result.errors).toEqual([]);
	});

	it('returns labeled errors for each rejected adapter', async () => {
		mockFetchNpsAlerts.mockRejectedValue(new Error('NPS down'));
		mockFetchSeeClickFixIssues.mockRejectedValue(new Error('311 503'));

		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		expect(result.errors).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^nps: NPS down/),
				expect.stringMatching(/^seeclickfix: 311 503/)
			])
		);
		expect(result.errors).toHaveLength(2);
	});

	it('surfaces per-feed RSS errors from CategoryFetchResult.errors', async () => {
		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('local', [], ['feed-1: timeout', 'feed-2: 502'])
		]);

		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		expect(result.errors).toEqual(
			expect.arrayContaining([
				'rss:local: feed-1: timeout',
				'rss:local: feed-2: 502'
			])
		);
	});

	// ---------- Sorting ----------

	it('sorts merged items by timestamp descending before enrichment', async () => {
		const now = Date.now();
		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('safety', [
				makeNewsItem({ id: 'old', category: 'safety', timestamp: now - 10000 }),
				makeNewsItem({ id: 'newest', category: 'safety', timestamp: now })
			])
		]);
		mockEarthquakesToNewsItems.mockReturnValue([
			makeNewsItem({ id: 'mid', category: 'safety', timestamp: now - 5000 })
		]);
		mockFetchTransitAlerts.mockResolvedValue({ items: [], errors: [] });
		mockFetchSheriffCrimeBlotter.mockResolvedValue([]);
		mockFetchSupplementalPoliceLogs.mockResolvedValue([]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		const safetyCalls = mockEnrichItemsForRelevance.mock.calls.filter((call: unknown[][]) => {
			const items = call[0] as NewsItem[];
			return items.some((i: NewsItem) => i.id === 'newest');
		});
		const safetyItems = safetyCalls[0][0] as NewsItem[];
		expect(safetyItems[0].id).toBe('newest');
		expect(safetyItems[1].id).toBe('mid');
		expect(safetyItems[2].id).toBe('old');
	});

	// ---------- Partial failure handling ----------

	it('continues loading when fetchNpsAlerts rejects', async () => {
		mockFetchNpsAlerts.mockRejectedValue(new Error('NPS API down'));

		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		// Should still return earthquake data
		expect(result.earthquakesRaw.length).toBe(1);
		// Other adapters still called
		expect(mockFetchAllFeeds).toHaveBeenCalledOnce();
		expect(mockFetchSeeClickFixIssues).toHaveBeenCalledOnce();
	});

	it('continues loading when fetchEarthquakes rejects', async () => {
		mockFetchEarthquakes.mockRejectedValue(new Error('USGS unreachable'));

		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		// Earthquakes default to empty array on rejection
		expect(result.earthquakesRaw).toEqual([]);
		expect(result.earthquakeNews).toEqual([]);
		// RSS still loaded
		expect(mockFetchAllFeeds).toHaveBeenCalledOnce();
	});

	it('continues loading when fetchAllFeeds rejects', async () => {
		mockFetchAllFeeds.mockRejectedValue(new Error('RSS parsing explosion'));

		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		// Should still return earthquakes
		expect(result.earthquakesRaw.length).toBe(1);
		// earthquakesToNewsItems still called with the resolved earthquakes
		expect(mockEarthquakesToNewsItems).toHaveBeenCalledOnce();
	});

	it('continues loading when fetchSheriffCrimeBlotter rejects', async () => {
		mockFetchSheriffCrimeBlotter.mockRejectedValue(new Error('Blotter endpoint 500'));

		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		expect(result.earthquakesRaw.length).toBe(1);
		expect(mockSetItems).toHaveBeenCalled();
	});

	it('continues loading when fetchTransitAlerts rejects', async () => {
		mockFetchTransitAlerts.mockRejectedValue(new Error('511 API timeout'));

		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		expect(result.earthquakesRaw.length).toBe(1);
	});

	it('continues loading when fetchSeeClickFixIssues rejects', async () => {
		mockFetchSeeClickFixIssues.mockRejectedValue(new Error('SeeClickFix down'));

		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		expect(result.earthquakesRaw.length).toBe(1);
		expect(mockFetchAllFeeds).toHaveBeenCalledOnce();
	});

	it('handles multiple simultaneous adapter failures gracefully', async () => {
		mockFetchNpsAlerts.mockRejectedValue(new Error('NPS down'));
		mockFetchEarthquakes.mockRejectedValue(new Error('USGS down'));
		mockFetchSheriffCrimeBlotter.mockRejectedValue(new Error('Blotter down'));
		mockFetchTransitAlerts.mockRejectedValue(new Error('Transit down'));
		mockFetchSupplementalPoliceLogs.mockRejectedValue(new Error('Police logs down'));

		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		// Should not throw
		expect(result.earthquakesRaw).toEqual([]);
		expect(result.earthquakeNews).toEqual([]);
		// RSS still loaded
		expect(mockSetItems).toHaveBeenCalled();
	});

	it('returns empty results when all adapters fail', async () => {
		mockFetchAllFeeds.mockRejectedValue(new Error('all down'));
		mockFetchNpsAlerts.mockRejectedValue(new Error('all down'));
		mockFetchEarthquakes.mockRejectedValue(new Error('all down'));
		mockFetchTransitAlerts.mockRejectedValue(new Error('all down'));
		mockFetchSheriffCrimeBlotter.mockRejectedValue(new Error('all down'));
		mockFetchSupplementalPoliceLogs.mockRejectedValue(new Error('all down'));
		mockFetchSupplementalActivityFeeds.mockRejectedValue(new Error('all down'));
		mockFetchSeeClickFixIssues.mockRejectedValue(new Error('all down'));

		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		expect(result.earthquakesRaw).toEqual([]);
		expect(result.earthquakeNews).toEqual([]);
	});

	// ---------- Error aggregation (console.warn for feed errors) ----------

	it('logs warnings for RSS categories that have feed errors', async () => {
		const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('local', [makeNewsItem({ id: 'l-1', category: 'local' })], ['Feed X timed out', 'Feed Y 404'])
		]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining('[local]'),
			expect.arrayContaining(['Feed X timed out', 'Feed Y 404'])
		);

		consoleWarnSpy.mockRestore();
	});

	it('does not log warnings for categories with no feed errors', async () => {
		const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('local', [makeNewsItem({ id: 'l-1', category: 'local' })], [])
		]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		const feedErrorCalls = consoleWarnSpy.mock.calls.filter(
			(c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('Feed errors')
		);
		expect(feedErrorCalls.length).toBe(0);

		consoleWarnSpy.mockRestore();
	});

	// ---------- Loading spinners ----------

	it('sets loading state on empty categories when showLoadingSpinners is true', async () => {
		mockGetItems.mockReturnValue([]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews(true);

		// Should call setLoading for each of the 12 RSS categories
		expect(mockSetLoading).toHaveBeenCalled();
		const loadingCalls = mockSetLoading.mock.calls;
		// Each call sets loading = true
		loadingCalls.forEach((call: unknown[]) => {
			expect(call[1]).toBe(true);
		});
	});

	it('does not set loading spinners when showLoadingSpinners is false (default)', async () => {
		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		expect(mockSetLoading).not.toHaveBeenCalled();
	});

	it('skips loading state for categories that already have items', async () => {
		// First call returns empty, then returns items for 'local'
		mockGetItems.mockImplementation((cat: NewsCategory) => {
			if (cat === 'local') return [makeNewsItem({ id: 'existing', category: 'local' })];
			return [];
		});

		const { loadAllNews } = await import('./load-all');
		await loadAllNews(true);

		const loadingCategories = mockSetLoading.mock.calls.map((c: unknown[]) => c[0] as string);
		expect(loadingCategories).not.toContain('local');
	});

	// ---------- enrichLocations ----------

	it('calls enrichLocations for categories with items', async () => {
		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		// Categories with items should trigger enrichLocations
		expect(mockEnrichLocations).toHaveBeenCalled();
	});

	it('does not call enrichLocations for categories with zero enriched items', async () => {
		// Make enrichItemsForRelevance return empty arrays for all categories
		mockEnrichItemsForRelevance.mockResolvedValue([]);
		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('local', [makeNewsItem({ id: 'l-1', category: 'local' })])
		]);
		mockFetchSeeClickFixIssues.mockResolvedValue([]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		// enrichLocations should NOT be called when enrichedItems is empty
		expect(mockEnrichLocations).not.toHaveBeenCalled();
	});

	// ---------- Supplemental activity routing ----------

	it('routes supplemental activity items to their respective categories', async () => {
		const safetyActivity = makeNewsItem({ id: 'supp-safety', category: 'safety' });
		const outdoorsActivity = makeNewsItem({ id: 'supp-outdoors', category: 'outdoors' });
		const localActivity = makeNewsItem({ id: 'supp-local', category: 'local' });

		mockFetchSupplementalActivityFeeds.mockResolvedValue([safetyActivity, outdoorsActivity, localActivity]);
		mockFetchAllFeeds.mockResolvedValue([
			makeCategoryResult('safety', [makeNewsItem({ id: 's-1', category: 'safety' })]),
			makeCategoryResult('outdoors', [makeNewsItem({ id: 'o-1', category: 'outdoors' })]),
			makeCategoryResult('local', [makeNewsItem({ id: 'l-1', category: 'local' })])
		]);

		const { loadAllNews } = await import('./load-all');
		await loadAllNews();

		// Safety should include safety supplemental
		const safetyCalls = mockEnrichItemsForRelevance.mock.calls.filter((call: unknown[][]) => {
			const items = call[0] as NewsItem[];
			return items.some((i: NewsItem) => i.id === 's-1');
		});
		const safetyIds = (safetyCalls[0][0] as NewsItem[]).map((i: NewsItem) => i.id);
		expect(safetyIds).toContain('supp-safety');

		// Outdoors should include outdoors supplemental
		const outdoorsCalls = mockEnrichItemsForRelevance.mock.calls.filter((call: unknown[][]) => {
			const items = call[0] as NewsItem[];
			return items.some((i: NewsItem) => i.id === 'o-1');
		});
		const outdoorsIds = (outdoorsCalls[0][0] as NewsItem[]).map((i: NewsItem) => i.id);
		expect(outdoorsIds).toContain('supp-outdoors');

		// Local should include local supplemental
		const localCalls = mockEnrichItemsForRelevance.mock.calls.filter((call: unknown[][]) => {
			const items = call[0] as NewsItem[];
			return items.some((i: NewsItem) => i.id === 'l-1');
		});
		const localIds = (localCalls[0][0] as NewsItem[]).map((i: NewsItem) => i.id);
		expect(localIds).toContain('supp-local');
	});

	// ---------- Return shape ----------

	it('always returns an object with earthquakeNews and earthquakesRaw', async () => {
		const { loadAllNews } = await import('./load-all');
		const result = await loadAllNews();

		expect(result).toHaveProperty('earthquakeNews');
		expect(result).toHaveProperty('earthquakesRaw');
		expect(Array.isArray(result.earthquakeNews)).toBe(true);
		expect(Array.isArray(result.earthquakesRaw)).toBe(true);
	});
});
