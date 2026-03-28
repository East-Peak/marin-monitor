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
import { SEED_SEGMENTS, MARIN_BOUNDING_BOXES } from '$lib/config/strava';
import { getStravaAccessToken } from './strava-auth';

// ---------------------------------------------------------------------------
// Explore API types
// ---------------------------------------------------------------------------

interface ExploreSegment {
	id: number;
	name: string;
	climb_category: number;
	avg_grade: number;
	elev_difference: number;
	distance: number;
	start_latlng: [number, number];
	end_latlng: [number, number];
	points: string; // encoded polyline
}

interface ExploreResponse {
	segments: ExploreSegment[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert an ExploreSegment into a StravaSegment, merging existing data if present. */
function exploreToSegment(
	raw: ExploreSegment,
	existing: StravaSegment | undefined,
	activityType: 'ride' | 'run'
): StravaSegment {
	return {
		id: raw.id,
		name: raw.name,
		activityType,
		polyline: raw.points || existing?.polyline || null,
		startLatlng: raw.start_latlng,
		endLatlng: raw.end_latlng,
		distance: raw.distance,
		elevationGain: raw.elev_difference,
		avgGrade: raw.avg_grade,
		climbCategory: raw.climb_category,
		totalAttempts: existing?.totalAttempts ?? 0,
		totalAthletes: existing?.totalAthletes ?? 0
	};
}

/** Build a seed-only StravaSegment (no explore data yet). */
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

// ---------------------------------------------------------------------------
// Explore API fetch
// ---------------------------------------------------------------------------

/**
 * Query the Strava Explore API for one bounding box + activity type.
 * Returns an empty array on any failure.
 */
async function exploreBox(
	token: string,
	bounds: [number, number, number, number],
	activityType: 'riding' | 'running'
): Promise<ExploreSegment[]> {
	const [swLat, swLng, neLat, neLng] = bounds;
	const boundsParam = `${swLat},${swLng},${neLat},${neLng}`;
	const url = `https://www.strava.com/api/v3/segments/explore?bounds=${boundsParam}&activity_type=${activityType}`;

	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			console.warn(`[strava-segments] Explore API ${response.status} for bounds ${boundsParam}`);
			return [];
		}

		const data = (await response.json()) as ExploreResponse;
		return data.segments ?? [];
	} catch (err) {
		console.warn(`[strava-segments] Explore API error for bounds ${boundsParam}:`, err);
		return [];
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
	// Index existing segments by ID for O(1) lookup
	const existingById = new Map<number, StravaSegment>(
		existingCatalog?.segments.map((s) => [s.id, s]) ?? []
	);

	// Build initial catalog from seeds (preserving any existing data)
	const seedIds = new Set(SEED_SEGMENTS.map((s) => s.id));
	const catalog = new Map<number, StravaSegment>(
		SEED_SEGMENTS.map((seed) => [
			seed.id,
			seedToSegment(seed.id, seed.name, seed.activityType, seed.startLatlng, existingById.get(seed.id))
		])
	);

	// Try to enrich with Explore API data
	let token: string | null = null;
	try {
		token = await getStravaAccessToken();
	} catch (err) {
		console.warn('[strava-segments] OAuth unavailable, using seed list only:', String(err));
	}

	if (token) {
		const activityTypes: Array<'riding' | 'running'> = ['riding', 'running'];

		for (const bounds of MARIN_BOUNDING_BOXES) {
			for (const activityType of activityTypes) {
				// Map explore activity_type to segment activityType
				const segmentActivityType = activityType === 'riding' ? 'ride' : 'run';

				const results = await exploreBox(token, bounds, activityType);

				for (const raw of results) {
					if (seedIds.has(raw.id)) {
						// Update the seed segment with explore data
						const existing = existingById.get(raw.id);
						catalog.set(raw.id, exploreToSegment(raw, existing, segmentActivityType));
					} else {
						// Log non-seed segments found — do NOT auto-add
						console.log(
							`[strava-segments] Found non-seed segment via explore: ${raw.id} "${raw.name}" (${activityType})`
						);
					}
				}
			}
		}
	}

	return {
		segments: Array.from(catalog.values()),
		lastUpdated: new Date().toISOString()
	};
}
