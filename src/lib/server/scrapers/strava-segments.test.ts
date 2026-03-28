import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SEED_SEGMENTS } from '$lib/config/strava';
import type { StravaSegmentCatalog } from '$lib/types/strava';

// Mock $env/dynamic/private with empty credentials so OAuth fails gracefully
vi.mock('$env/dynamic/private', () => ({
	env: {
		STRAVA_CLIENT_ID: '',
		STRAVA_CLIENT_SECRET: '',
		STRAVA_REFRESH_TOKEN: ''
	}
}));

// Import after mock is set up
const {
	buildSegmentCatalog,
	normalizeCatalogToSeedSegments,
	catalogHasAllSeedSegments
} = await import('./strava-segments');

describe('buildSegmentCatalog', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe('with no OAuth credentials (graceful fallback)', () => {
		it('returns a catalog with all seed segments when OAuth fails', async () => {
			const catalog = await buildSegmentCatalog(null);

			expect(catalog.segments).toHaveLength(SEED_SEGMENTS.length);
			expect(catalog.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});

		it('includes every seed segment ID in the result', async () => {
			const catalog = await buildSegmentCatalog(null);
			const resultIds = new Set(catalog.segments.map((s) => s.id));

			for (const seed of SEED_SEGMENTS) {
				expect(resultIds.has(seed.id)).toBe(true);
			}
		});

		it('all segments have valid numeric IDs', async () => {
			const catalog = await buildSegmentCatalog(null);

			for (const seg of catalog.segments) {
				expect(seg.id).toBeTypeOf('number');
				expect(seg.id).toBeGreaterThan(0);
			}
		});

		it('all segments have valid activity types', async () => {
			const catalog = await buildSegmentCatalog(null);

			for (const seg of catalog.segments) {
				expect(['ride', 'run']).toContain(seg.activityType);
			}
		});

		it('all segments have names from the seed list', async () => {
			const catalog = await buildSegmentCatalog(null);
			const seedNames = new Map(SEED_SEGMENTS.map((s) => [s.id, s.name]));

			for (const seg of catalog.segments) {
				expect(seg.name).toBe(seedNames.get(seg.id));
			}
		});

		it('polylines are null when no existing catalog provided', async () => {
			const catalog = await buildSegmentCatalog(null);

			for (const seg of catalog.segments) {
				expect(seg.polyline).toBeNull();
			}
		});
	});

	describe('polyline preservation from existing catalog', () => {
		it('preserves existing polylines when rebuilding', async () => {
			// Build a fake existing catalog with polylines for all seeds
			const existingCatalog: StravaSegmentCatalog = {
				segments: SEED_SEGMENTS.map((seed) => ({
					id: seed.id,
					name: seed.name,
					activityType: seed.activityType,
					polyline: `encoded_polyline_for_${seed.id}`,
					startLatlng: seed.startLatlng,
					endLatlng: seed.startLatlng,
					distance: 5000,
					elevationGain: 200,
					avgGrade: 4.0,
					climbCategory: 1,
					totalAttempts: 1000,
					totalAthletes: 500
				})),
				lastUpdated: '2026-03-01T00:00:00.000Z'
			};

			const catalog = await buildSegmentCatalog(existingCatalog);

			// Polylines should be preserved from the existing catalog
			for (const seg of catalog.segments) {
				expect(seg.polyline).toBe(`encoded_polyline_for_${seg.id}`);
			}
		});

		it('preserves existing stats (attempts, athletes) when rebuilding', async () => {
			const existingCatalog: StravaSegmentCatalog = {
				segments: [
					{
						id: SEED_SEGMENTS[0].id,
						name: SEED_SEGMENTS[0].name,
						activityType: SEED_SEGMENTS[0].activityType,
						polyline: 'abc123',
						startLatlng: SEED_SEGMENTS[0].startLatlng,
						endLatlng: SEED_SEGMENTS[0].startLatlng,
						distance: 3200,
						elevationGain: 155,
						avgGrade: 7.5,
						climbCategory: 2,
						totalAttempts: 944951,
						totalAthletes: 72448
					}
				],
				lastUpdated: '2026-03-01T00:00:00.000Z'
			};

			const catalog = await buildSegmentCatalog(existingCatalog);
			const hawkHill = catalog.segments.find((s) => s.id === SEED_SEGMENTS[0].id);

			expect(hawkHill).toBeDefined();
			expect(hawkHill!.totalAttempts).toBe(944951);
			expect(hawkHill!.totalAthletes).toBe(72448);
			expect(hawkHill!.polyline).toBe('abc123');
		});

		it('returns null polylines for segments not in existing catalog', async () => {
			// Existing catalog only has the first seed
			const existingCatalog: StravaSegmentCatalog = {
				segments: [
					{
						id: SEED_SEGMENTS[0].id,
						name: SEED_SEGMENTS[0].name,
						activityType: SEED_SEGMENTS[0].activityType,
						polyline: 'some_polyline',
						startLatlng: SEED_SEGMENTS[0].startLatlng,
						endLatlng: SEED_SEGMENTS[0].startLatlng,
						distance: 3200,
						elevationGain: 155,
						avgGrade: 7.5,
						climbCategory: 2,
						totalAttempts: 0,
						totalAthletes: 0
					}
				],
				lastUpdated: '2026-03-01T00:00:00.000Z'
			};

			const catalog = await buildSegmentCatalog(existingCatalog);

			// Other seeds should have null polylines
			const otherSegs = catalog.segments.filter((s) => s.id !== SEED_SEGMENTS[0].id);
			for (const seg of otherSegs) {
				expect(seg.polyline).toBeNull();
			}
		});
	});

	describe('catalog structure', () => {
		it('returns a lastUpdated ISO timestamp', async () => {
			const catalog = await buildSegmentCatalog(null);
			const parsed = new Date(catalog.lastUpdated);
			expect(Number.isNaN(parsed.getTime())).toBe(false);
		});

		it('returns correct segment count matching seed list', async () => {
			const catalog = await buildSegmentCatalog(null);
			expect(catalog.segments.length).toBe(SEED_SEGMENTS.length);
		});

		it('activity types match the seed config', async () => {
			const catalog = await buildSegmentCatalog(null);
			const seedByID = new Map(SEED_SEGMENTS.map((s) => [s.id, s]));

			for (const seg of catalog.segments) {
				const seed = seedByID.get(seg.id);
				expect(seg.activityType).toBe(seed!.activityType);
			}
		});
	});
});

describe('seed catalog helpers', () => {
	it('normalizes an incomplete catalog back to the full seed list', () => {
		const existingCatalog: StravaSegmentCatalog = {
			segments: [
				{
					id: SEED_SEGMENTS[0].id,
					name: SEED_SEGMENTS[0].name,
					activityType: SEED_SEGMENTS[0].activityType,
					polyline: 'seed-polyline',
					startLatlng: SEED_SEGMENTS[0].startLatlng,
					endLatlng: SEED_SEGMENTS[0].startLatlng,
					distance: 3200,
					elevationGain: 155,
					avgGrade: 7.5,
					climbCategory: 2,
					totalAttempts: 123,
					totalAthletes: 45
				}
			],
			lastUpdated: '2026-03-01T00:00:00.000Z'
		};

		const normalized = normalizeCatalogToSeedSegments(existingCatalog);
		const preserved = normalized.segments.find((segment) => segment.id === SEED_SEGMENTS[0].id);
		const added = normalized.segments.find((segment) => segment.id === SEED_SEGMENTS[1].id);

		expect(normalized.segments).toHaveLength(SEED_SEGMENTS.length);
		expect(preserved?.polyline).toBe('seed-polyline');
		expect(preserved?.totalAttempts).toBe(123);
		expect(added?.polyline).toBeNull();
		expect(added?.distance).toBe(0);
	});

	it('detects when a catalog is missing current seed segments', () => {
		const incompleteCatalog: StravaSegmentCatalog = {
			segments: [
				{
					id: SEED_SEGMENTS[0].id,
					name: SEED_SEGMENTS[0].name,
					activityType: SEED_SEGMENTS[0].activityType,
					polyline: null,
					startLatlng: SEED_SEGMENTS[0].startLatlng,
					endLatlng: SEED_SEGMENTS[0].startLatlng,
					distance: 0,
					elevationGain: 0,
					avgGrade: 0,
					climbCategory: 0,
					totalAttempts: 0,
					totalAthletes: 0
				}
			],
			lastUpdated: '2026-03-01T00:00:00.000Z'
		};

		const completeCatalog = normalizeCatalogToSeedSegments(incompleteCatalog);

		expect(catalogHasAllSeedSegments(incompleteCatalog)).toBe(false);
		expect(catalogHasAllSeedSegments(completeCatalog)).toBe(true);
	});
});
