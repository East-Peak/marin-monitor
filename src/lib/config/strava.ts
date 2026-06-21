import type { StravaSeedSegment } from '$lib/types/strava';
import {
	CURATED_STRAVA_SEGMENTS,
	STRAVA_CURATED_RIDE_COUNT,
	STRAVA_CURATED_RUN_COUNT
} from './strava-curated.generated';

/** Feature flag — set to false to disable all Strava scraping and hide UI */
export const STRAVA_ENABLED = true;

/** Blob storage keys */
export const STRAVA_SEGMENTS_BLOB = 'strava-segments.json';
export const STRAVA_EVENTS_BLOB = 'strava-events.json';
export const STRAVA_LEADERBOARDS_BLOB = 'strava-leaderboards-all.json';
export function stravaLeaderboardBlob(segmentId: number): string {
	return `strava-leaderboard-${segmentId}.json`;
}

/** Max age for events before pruning (30 days) */
export const STRAVA_EVENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Max age for chyron display (48 hours) */
export const STRAVA_CHYRON_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** Explore API bounding boxes to tile Marin County */
export const MARIN_BOUNDING_BOXES: [number, number, number, number][] = [
	[37.83, -122.75, 37.94, -122.48],
	[37.92, -122.68, 38.02, -122.45],
	[38.0, -122.7, 38.08, -122.45],
	[37.88, -122.8, 37.98, -122.62],
	[37.96, -122.8, 38.08, -122.62]
];

export const SEED_SEGMENTS: StravaSeedSegment[] = CURATED_STRAVA_SEGMENTS;
export const STRAVA_DASHBOARD_RIDE_LIMIT = STRAVA_CURATED_RIDE_COUNT;
export const STRAVA_DASHBOARD_RUN_LIMIT = STRAVA_CURATED_RUN_COUNT;
