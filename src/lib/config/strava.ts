import type { StravaSeedSegment } from '$lib/types/strava';

/** Feature flag — set to false to disable all Strava scraping and hide UI */
export const STRAVA_ENABLED = true;

/** Blob storage keys */
export const STRAVA_SEGMENTS_BLOB = 'strava-segments.json';
export const STRAVA_EVENTS_BLOB = 'strava-events.json';
export function stravaLeaderboardBlob(segmentId: number): string {
	return `strava-leaderboard-${segmentId}.json`;
}

/** Max age for events before pruning (30 days) */
export const STRAVA_EVENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Max age for chyron display (48 hours) */
export const STRAVA_CHYRON_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** Explore API bounding boxes to tile Marin County */
export const MARIN_BOUNDING_BOXES: [number, number, number, number][] = [
	[37.830, -122.750, 37.940, -122.480],
	[37.920, -122.680, 38.020, -122.450],
	[38.000, -122.700, 38.080, -122.450],
	[37.880, -122.800, 37.980, -122.620],
	[37.960, -122.800, 38.080, -122.620],
];

export const SEED_SEGMENTS: StravaSeedSegment[] = [
	{ id: 229781, name: 'Hawk Hill', activityType: 'ride', startLatlng: [37.8324, -122.4990] },
	{ id: 678363, name: 'Mt. Tam via Alpine Dam', activityType: 'ride', startLatlng: [37.9200, -122.5900] },
	{ id: 765125, name: 'Camino Alto', activityType: 'ride', startLatlng: [37.8900, -122.5280] },
	{ id: 582500, name: 'Paradise Dr (Clockwise)', activityType: 'ride', startLatlng: [37.8840, -122.4570] },
	{ id: 2312682, name: 'Bolinas-Fairfax Rd Climb', activityType: 'ride', startLatlng: [37.9380, -122.6200] },
	{ id: 907022, name: 'Dipsea / Steep Ravine', activityType: 'run', startLatlng: [37.8990, -122.6360] },
	{ id: 15160205, name: 'Dipsea (Panoramic to Muir Woods)', activityType: 'run', startLatlng: [37.8830, -122.5810] },
];
