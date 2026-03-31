import fs from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
	mergeCatalogWithFallback,
	normalizeCatalogToSeedSegments,
	catalogHasAllSeedSegments
} = await import('./strava-segments');

const actualExistsSync = fs.existsSync.bind(fs);
const actualReadFileSync = fs.readFileSync.bind(fs);

function isLocalCuratedFile(filePath: fs.PathLike | number): boolean {
	return typeof filePath !== 'number' && String(filePath).endsWith('data/strava-curated.json');
}

describe('buildSegmentCatalog', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
			if (isLocalCuratedFile(filePath)) return false;
			return actualExistsSync(filePath);
		});
		vi.spyOn(fs, 'readFileSync').mockImplementation(
			((filePath: fs.PathOrFileDescriptor, options?: Parameters<typeof fs.readFileSync>[1]) =>
				actualReadFileSync(filePath, options as never)) as typeof fs.readFileSync
		);
	});

	afterEach(() => {
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

	describe('local curated catalog fallback', () => {
		it('uses local curated catalog data when present', async () => {
			const seed = SEED_SEGMENTS[0];
			const localCatalog: StravaSegmentCatalog = {
				segments: [
					{
						id: seed.id,
						name: seed.name,
						activityType: seed.activityType,
						polyline: 'local-polyline',
						startLatlng: seed.startLatlng,
						endLatlng: seed.startLatlng,
						distance: 3200,
						elevationGain: 155,
						avgGrade: 7.5,
						climbCategory: 2,
						totalAttempts: 944951,
						totalAthletes: 72448
					}
				],
				lastUpdated: '2026-03-31T00:00:00.000Z'
			};

			vi.mocked(fs.existsSync).mockImplementation((filePath) => {
				if (isLocalCuratedFile(filePath)) return true;
				return actualExistsSync(filePath);
			});
			vi.mocked(fs.readFileSync).mockImplementation(
				((filePath: fs.PathOrFileDescriptor, options?: Parameters<typeof fs.readFileSync>[1]) => {
					if (isLocalCuratedFile(filePath)) {
						return JSON.stringify({ catalog: localCatalog });
					}
					return actualReadFileSync(filePath, options as never);
				}) as typeof fs.readFileSync
			);

			const catalog = await buildSegmentCatalog(null);
			const segment = catalog.segments.find((entry) => entry.id === seed.id);

			expect(segment?.polyline).toBe('local-polyline');
			expect(segment?.totalAttempts).toBe(944951);
			expect(segment?.totalAthletes).toBe(72448);
			expect(catalog.segments).toHaveLength(SEED_SEGMENTS.length);
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

	describe('when Strava detail API resolves to a different canonical ID', () => {
		it('keeps the seed ID and curated name stable in the catalog', async () => {
			const auth = await import('./strava-auth');
			vi.spyOn(auth, 'getStravaAccessToken').mockResolvedValue('token');
			vi.spyOn(globalThis, 'setTimeout').mockImplementation(
				(((callback: Parameters<typeof setTimeout>[0]) => {
					if (typeof callback === 'function') callback();
					return 0 as unknown as ReturnType<typeof setTimeout>;
				}) as unknown) as typeof setTimeout
			);

			const seed = SEED_SEGMENTS.find((segment) => segment.activityType === 'run') ?? SEED_SEGMENTS[0];
			const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
				const url = String(input);
				if (!url.includes(`/segments/${seed.id}`)) {
					return new Response(null, { status: 404 });
				}

				return new Response(
					JSON.stringify({
						id: 668182,
						name: 'Canonical Strava Name',
						activity_type: 'Run',
						distance: 1300,
						average_grade: 5.4,
						total_elevation_gain: 88,
						climb_category: 0,
						start_latlng: seed.startLatlng,
						end_latlng: seed.startLatlng,
						map: { polyline: 'encoded-polyline' }
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			});

			const catalog = await buildSegmentCatalog(null);
			const segment = catalog.segments.find((entry) => entry.id === seed.id);

			expect(segment).toBeDefined();
			expect(segment?.id).toBe(seed.id);
			expect(segment?.name).toBe(seed.name);
			expect(segment?.polyline).toBe('encoded-polyline');

			fetchMock.mockRestore();
		});
	});
});

describe('seed catalog helpers', () => {
	it('merges a partial runtime catalog over the local curated fallback', () => {
		const fallbackCatalog: StravaSegmentCatalog = {
			segments: [
				{
					id: SEED_SEGMENTS[0].id,
					name: SEED_SEGMENTS[0].name,
					activityType: SEED_SEGMENTS[0].activityType,
					polyline: 'fallback-polyline',
					startLatlng: SEED_SEGMENTS[0].startLatlng,
					endLatlng: SEED_SEGMENTS[0].startLatlng,
					distance: 3200,
					elevationGain: 155,
					avgGrade: 7.5,
					climbCategory: 2,
					totalAttempts: 100,
					totalAthletes: 50
				}
			],
			lastUpdated: '2026-03-01T00:00:00.000Z'
		};
		const primaryCatalog: StravaSegmentCatalog = {
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
					totalAttempts: 123,
					totalAthletes: 45
				}
			],
			lastUpdated: '2026-03-02T00:00:00.000Z'
		};

		const merged = mergeCatalogWithFallback(primaryCatalog, fallbackCatalog);
		const segment = merged.segments.find((entry) => entry.id === SEED_SEGMENTS[0].id);

		expect(segment?.polyline).toBe('fallback-polyline');
		expect(segment?.totalAttempts).toBe(123);
		expect(segment?.totalAthletes).toBe(45);
		expect(merged.segments).toHaveLength(SEED_SEGMENTS.length);
	});

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
