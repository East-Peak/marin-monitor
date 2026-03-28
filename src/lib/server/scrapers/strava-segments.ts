/**
 * Strava Explore API segment catalog builder.
 *
 * Builds a StravaSegmentCatalog by:
 * 1. Starting from the hand-curated SEED_SEGMENTS
 * 2. Preserving existing polyline/stats from an existing catalog if provided
 * 3. Querying the Strava Explore API to update polylines and stats for seed segments
 * 4. Logging (but NOT auto-adding) non-seed segments found via explore
 *
 * Falls back gracefully to the seed list if OAuth credentials are missing.
 */

import type { StravaSegment, StravaSegmentCatalog } from '$lib/types/strava';
import { SEED_SEGMENTS } from '$lib/config/strava';
import { getStravaAccessToken } from './strava-auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a seed-only StravaSegment (no detail API data yet). */
function seedToSegment(
	seedId: number,
	seedName: string,
	activityType: 'ride' | 'run',
	startLatlng: [number, number],
	existing: StravaSegment | undefined
): StravaSegment {
	return {
		id: seedId,
		name: seedName,
		activityType,
		polyline: existing?.polyline ?? null,
		startLatlng,
		endLatlng: existing?.endLatlng ?? startLatlng,
		distance: existing?.distance ?? 0,
		elevationGain: existing?.elevationGain ?? 0,
		avgGrade: existing?.avgGrade ?? 0,
		climbCategory: existing?.climbCategory ?? 0,
		totalAttempts: existing?.totalAttempts ?? 0,
		totalAthletes: existing?.totalAthletes ?? 0
	};
}

export function normalizeCatalogToSeedSegments(
	existingCatalog: StravaSegmentCatalog | null
): StravaSegmentCatalog {
	const existingById = new Map<number, StravaSegment>(
		existingCatalog?.segments.map((segment) => [segment.id, segment]) ?? []
	);

	return {
		segments: SEED_SEGMENTS.map((seed) =>
			seedToSegment(
				seed.id,
				seed.name,
				seed.activityType,
				seed.startLatlng,
				existingById.get(seed.id)
			)
		),
		lastUpdated: existingCatalog?.lastUpdated ?? new Date().toISOString()
	};
}

export function catalogHasAllSeedSegments(catalog: StravaSegmentCatalog | null): boolean {
	if (!catalog) return false;

	const ids = new Set(catalog.segments.map((segment) => segment.id));
	return SEED_SEGMENTS.every((seed) => ids.has(seed.id));
}

// ---------------------------------------------------------------------------
// Segment Detail API fetch
// ---------------------------------------------------------------------------

interface SegmentDetail {
	id: number;
	name: string;
	activity_type: string;
	distance: number;
	average_grade: number;
	total_elevation_gain: number;
	climb_category: number;
	start_latlng: [number, number];
	end_latlng: [number, number];
	map: { polyline: string };
}

/**
 * Fetch individual segment details via GET /segments/{id}.
 * This returns the full polyline, stats, and metadata for a specific segment.
 */
async function fetchSegmentDetail(
	token: string,
	segmentId: number
): Promise<SegmentDetail | null> {
	try {
		const response = await fetch(`https://www.strava.com/api/v3/segments/${segmentId}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			const body = await response.text();
			console.warn(`[strava-segments] Segment ${segmentId} detail API: ${response.status} — ${body.slice(0, 200)}`);
			return null;
		}

		return (await response.json()) as SegmentDetail;
	} catch (err) {
		console.warn(`[strava-segments] Segment ${segmentId} detail fetch error:`, err);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build (or rebuild) the segment catalog.
 *
 * @param existingCatalog - Previous catalog from blob storage; used to preserve
 *   polylines and stats when explore data is unavailable. Pass null on first run.
 * @returns Updated StravaSegmentCatalog with seed segments populated.
 */
export async function buildSegmentCatalog(
	existingCatalog: StravaSegmentCatalog | null
): Promise<StravaSegmentCatalog> {
	const baseCatalog = normalizeCatalogToSeedSegments(existingCatalog);
	const existingById = new Map<number, StravaSegment>(
		baseCatalog.segments.map((segment) => [segment.id, segment])
	);
	const catalog = new Map<number, StravaSegment>(
		baseCatalog.segments.map((segment) => [segment.id, segment])
	);

	// Try to enrich each seed segment with detail API data (polylines + stats)
	let token: string | null = null;
	try {
		token = await getStravaAccessToken();
	} catch (err) {
		console.error('[strava-segments] OAuth FAILED — falling back to seed list only:', String(err));
	}

	if (token) {
		let enriched = 0;

		for (const seed of SEED_SEGMENTS) {
			// Small delay between requests to avoid rate limiting
			if (enriched > 0) await new Promise((r) => setTimeout(r, 500));
			const detail = await fetchSegmentDetail(token, seed.id);
			if (detail && detail.map?.polyline) {
				const existing = existingById.get(seed.id);
				catalog.set(seed.id, {
					// Keep the curated seed identity stable even when Strava resolves the
					// detail request to a different canonical segment ID/name.
					id: seed.id,
					name: seed.name,
					activityType: seed.activityType,
					polyline: detail.map.polyline,
					startLatlng: detail.start_latlng,
					endLatlng: detail.end_latlng,
					distance: detail.distance,
					elevationGain: detail.total_elevation_gain,
					avgGrade: detail.average_grade,
					climbCategory: detail.climb_category,
					totalAttempts: existing?.totalAttempts ?? 0,
					totalAthletes: existing?.totalAthletes ?? 0
				});
				enriched++;
			}
		}
	} else {
		console.warn('[strava-segments] No OAuth token — all segments will have polyline: null');
	}

	return {
		segments: Array.from(catalog.values()),
		lastUpdated: new Date().toISOString()
	};
}
