import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock $lib/config (detectTown)
vi.mock('$lib/config', () => ({
	detectTown: vi.fn((text: string) => {
		if (text.toLowerCase().includes('san rafael')) return { name: 'San Rafael', slug: 'san-rafael' };
		if (text.toLowerCase().includes('mill valley')) return { name: 'Mill Valley', slug: 'mill-valley' };
		if (text.toLowerCase().includes('novato')) return { name: 'Novato', slug: 'novato' };
		return null;
	})
}));

// Mock $lib/config/api (logger)
vi.mock('$lib/config/api', () => ({
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

interface TestIssue {
	id: number;
	status: string;
	summary: string;
	description: string;
	lat: number | null;
	lng: number | null;
	address: string;
	created_at: string;
	updated_at: string;
	request_type?: { title?: string; organization?: string };
	media?: { image_full?: string | null; image_square_100x100?: string | null };
	html_url?: string;
}

function makeIssue(overrides: Partial<TestIssue> = {}): TestIssue {
	return {
		id: 12345,
		status: 'Open',
		summary: 'Pothole',
		description: 'Large pothole on the road',
		lat: 37.97,
		lng: -122.53,
		address: '123 Lincoln Ave, San Rafael, CA',
		created_at: '2026-03-15T10:00:00Z',
		updated_at: '2026-03-15T10:00:00Z',
		request_type: { title: 'Pothole', organization: 'City of San Rafael' },
		html_url: 'https://seeclickfix.com/issues/12345',
		...overrides
	};
}

function makeBlobResponse(issues: TestIssue[]) {
	return {
		issues,
		lastUpdated: '2026-03-15T12:00:00Z',
		count: issues.length
	};
}

function mockFetchSuccess(data: unknown) {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve(data)
	});
}

function mockFetchFailure(status = 500) {
	global.fetch = vi.fn().mockResolvedValue({
		ok: false,
		status
	});
}

// ────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────

describe('fetchSeeClickFixIssues', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('parses a valid SeeClickFix API response into NewsItem[]', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [makeIssue()];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result).toHaveLength(1);

		const item = result[0];
		expect(item.id).toBe('seeclickfix-12345');
		expect(item.source).toBe('Fix It Marin');
		expect(item.category).toBe('311');
		expect(item.verification).toBe('official');
		expect(item.pubDate).toBe('2026-03-15T10:00:00Z');
		expect(item.timestamp).toBe(new Date('2026-03-15T10:00:00Z').getTime());
		expect(item.link).toBe('https://seeclickfix.com/issues/12345');
		expect(item.topics).toEqual(['311', 'seeclickfix']);
	});

	it('rewrites external CDN image URLs to proxy format', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({
				media: {
					image_full: 'https://seeclickfix.com/cdn/images/12345-full.jpg',
					image_square_100x100: 'https://seeclickfix.com/cdn/images/12345-thumb.jpg'
				}
			})
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].imageUrl).toBe('/api/data/311-image?id=12345&size=full');
		expect(result[0].thumbnailUrl).toBe('/api/data/311-image?id=12345&size=thumb');
	});

	it('preserves already-proxied image URLs', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({
				media: {
					image_full: '/api/data/311-image?id=12345&size=full',
					image_square_100x100: '/api/data/311-image?id=12345&size=thumb'
				}
			})
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].imageUrl).toBe('/api/data/311-image?id=12345&size=full');
		expect(result[0].thumbnailUrl).toBe('/api/data/311-image?id=12345&size=thumb');
	});

	it('returns undefined imageUrl/thumbnailUrl when media is missing', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [makeIssue({ media: undefined })];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].imageUrl).toBeUndefined();
		expect(result[0].thumbnailUrl).toBeUndefined();
	});

	it('filters out issues outside Marin County bounding box', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ id: 1, lat: 37.97, lng: -122.53 }), // Inside Marin
			makeIssue({ id: 2, lat: 37.78, lng: -122.42 }), // San Francisco (south of bounds)
			makeIssue({ id: 3, lat: 38.50, lng: -122.53 }), // North of bounds
			makeIssue({ id: 4, lat: 37.97, lng: -122.20 }), // East of bounds
			makeIssue({ id: 5, lat: 37.97, lng: -122.80 })  // West of bounds
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('seeclickfix-1');
	});

	it('filters out issues with null lat/lng', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ id: 1, lat: null, lng: null }),
			makeIssue({ id: 2, lat: 37.97, lng: null }),
			makeIssue({ id: 3, lat: null, lng: -122.53 })
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result).toHaveLength(0);
	});

	it('strips Spanish translation from category names', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ summary: 'Illegal Dumping / Desecho ilegal' }),
			makeIssue({ id: 2, summary: 'Graffiti / Grafiti' }),
			makeIssue({ id: 3, summary: 'Pothole' }) // No Spanish
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].title).toContain('Illegal Dumping');
		expect(result[0].title).not.toContain('Desecho ilegal');
		expect(result[1].title).toContain('Graffiti');
		expect(result[1].title).not.toContain('Grafiti');
		expect(result[2].title).toContain('Pothole');
	});

	it('extracts address snippet with house number stripped', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ address: '123 Lincoln Ave, San Rafael, CA' }),
			makeIssue({ id: 2, address: '4500 Redwood Hwy, Mill Valley, CA' })
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		// Title format: "Category · StreetSnippet"
		expect(result[0].title).toBe('Pothole \u00b7 Lincoln Ave');
		expect(result[1].title).toBe('Pothole \u00b7 Redwood Hwy');
	});

	it('handles address with no house number', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ address: 'Bolinas Rd, Fairfax, CA' })
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].title).toBe('Pothole \u00b7 Bolinas Rd');
	});

	it('handles empty address gracefully', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [makeIssue({ address: '' })];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		// With no address snippet, title is just the category
		expect(result[0].title).toBe('Pothole');
	});

	it('detects town from address', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ address: '123 Lincoln Ave, San Rafael, CA' }),
			makeIssue({ id: 2, address: '456 Miller Ave, Mill Valley, CA' })
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].town).toBe('San Rafael');
		expect(result[0].townSlug).toBe('san-rafael');
		expect(result[1].town).toBe('Mill Valley');
		expect(result[1].townSlug).toBe('mill-valley');
	});

	it('handles unknown town (no match)', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ address: '123 Somewhere, Unincorporated, CA' })
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].town).toBeUndefined();
		expect(result[0].townSlug).toBeUndefined();
	});

	it('sorts items by timestamp descending (newest first)', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ id: 1, created_at: '2026-03-10T08:00:00Z' }),
			makeIssue({ id: 2, created_at: '2026-03-15T12:00:00Z' }),
			makeIssue({ id: 3, created_at: '2026-03-12T16:00:00Z' })
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result.map((r) => r.id)).toEqual([
			'seeclickfix-2',
			'seeclickfix-3',
			'seeclickfix-1'
		]);
		expect(result[0].timestamp).toBeGreaterThan(result[1].timestamp);
		expect(result[1].timestamp).toBeGreaterThan(result[2].timestamp);
	});

	// FIX-10 — fetchSeeClickFixIssues now throws on failure rather than
	// silently returning []. Callers (load-all.ts) distinguish "succeeded
	// with no issues" (clear stale data) from "fetch failed" (preserve last
	// known good) via Promise.allSettled status.
	it('throws on API failure', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		mockFetchFailure(500);

		await expect(fetchSeeClickFixIssues()).rejects.toThrow(/HTTP 500/);
	});

	it('throws on network error', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

		await expect(fetchSeeClickFixIssues()).rejects.toThrow(/Network error/);
	});

	it('returns empty array when response has no issues array', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		mockFetchSuccess({ lastUpdated: '2026-03-15T12:00:00Z' });

		const result = await fetchSeeClickFixIssues();
		expect(result).toEqual([]);
	});

	it('returns empty array for empty issues list', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		mockFetchSuccess(makeBlobResponse([]));

		const result = await fetchSeeClickFixIssues();
		expect(result).toEqual([]);
	});

	it('skips issues with invalid created_at date', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ id: 1, created_at: 'not-a-date' }),
			makeIssue({ id: 2, created_at: '2026-03-15T10:00:00Z' })
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('seeclickfix-2');
	});

	it('skips issues with no id', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ id: 0 }), // falsy id
			makeIssue({ id: 99 })
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('seeclickfix-99');
	});

	it('truncates long descriptions to 300 characters', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const longDesc = 'A'.repeat(500);
		const issues = [makeIssue({ description: longDesc })];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].description).toHaveLength(300);
		expect(result[0].description).toBe('A'.repeat(300));
	});

	it('generates fallback description when description is empty', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [makeIssue({ description: '' })];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].description).toContain('Pothole');
		expect(result[0].description).toContain('123 Lincoln Ave, San Rafael, CA');
	});

	it('generates fallback link when html_url is missing', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [makeIssue({ html_url: undefined })];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].link).toBe('https://seeclickfix.com/issues/12345');
	});

	it('sets location confidence to exact when lat/lng present', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [makeIssue({ lat: 37.97, lng: -122.53 })];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result[0].lat).toBe(37.97);
		expect(result[0].lon).toBe(-122.53);
		expect(result[0].locationConfidence).toBe('exact');
	});

	it('handles boundary edge cases (items on exact bounding box edges are included)', async () => {
		const { fetchSeeClickFixIssues } = await import('./seeclickfix');

		const issues = [
			makeIssue({ id: 1, lat: 37.83, lng: -122.75 }),  // SW corner (min lat, min lng)
			makeIssue({ id: 2, lat: 38.08, lng: -122.45 }),  // NE corner (max lat, max lng)
			makeIssue({ id: 3, lat: 37.83, lng: -122.45 }),  // SE corner
			makeIssue({ id: 4, lat: 38.08, lng: -122.75 })   // NW corner
		];
		mockFetchSuccess(makeBlobResponse(issues));

		const result = await fetchSeeClickFixIssues();
		expect(result).toHaveLength(4);
	});
});
