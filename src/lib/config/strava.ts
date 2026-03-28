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
	// Cycling
	{ id: 229781, name: 'Hawk Hill', activityType: 'ride', startLatlng: [37.8324, -122.499] },
	{ id: 678363, name: 'Mt. Tam via Alpine Dam', activityType: 'ride', startLatlng: [37.92, -122.59] },
	{ id: 765125, name: 'Camino Alto', activityType: 'ride', startLatlng: [37.89, -122.528] },
	{ id: 582500, name: 'Paradise Dr (Clockwise)', activityType: 'ride', startLatlng: [37.884, -122.457] },
	{ id: 2312682, name: 'Bolinas-Fairfax Rd Climb', activityType: 'ride', startLatlng: [37.938, -122.62] },
	{ id: 2451142, name: 'Camino Alto (Mill Valley side)', activityType: 'ride', startLatlng: [37.9021295, -122.5279554] },
	{ id: 153, name: "White's Hill", activityType: 'ride', startLatlng: [38.0020241, -122.6114651] },
	{ id: 158, name: 'Muir Beach Climb East', activityType: 'ride', startLatlng: [37.8631496, -122.5727032] },
	{ id: 216, name: 'Mt Home to Top of Tam Saddle', activityType: 'ride', startLatlng: [37.9100561, -122.5890408] },
	{ id: 362, name: 'Mt Tam East Peak - Old Railroad Grade', activityType: 'ride', startLatlng: [37.9210484, -122.5553913] },
	{ id: 480, name: 'Stinson Beach Town to Pantoll', activityType: 'ride', startLatlng: [37.8984427, -122.6391768] },
	{ id: 1521, name: 'Tam - Ranger Station to Summit', activityType: 'ride', startLatlng: [37.911978, -122.611123] },
	{ id: 1727, name: 'Marshall Wall from the east side', activityType: 'ride', startLatlng: [38.149375, -122.822761] },
	{ id: 563888, name: 'Alpine Dam to Ridgecrest Climb', activityType: 'ride', startLatlng: [37.936706, -122.638077] },
	{ id: 2655279, name: 'Tennessee Valley Sprint', activityType: 'ride', startLatlng: [37.8496615, -122.5399055] },
	{ id: 581630, name: 'Paradise Dr (Counterclockwise)', activityType: 'ride', startLatlng: [37.873141, -122.454444] },
	{ id: 472519, name: 'Fairfax + Seven Sisters', activityType: 'ride', startLatlng: [37.9823361, -122.5928991] },

	// Running / trail
	{ id: 907022, name: 'Dipsea/Steep Ravine (Stinson To Pantoll)', activityType: 'run', startLatlng: [37.896595, -122.6358179] },
	{ id: 15160205, name: 'Dipsea (Panoramic to Muir Woods)', activityType: 'run', startLatlng: [37.883, -122.581] },
	{ id: 6758295, name: 'Coastal Trail (Rodeo Beach to Wolf Ridge)', activityType: 'run', startLatlng: [37.832687, -122.540618] },
	{ id: 6263764, name: 'Coastal Trail (Tennessee Valley to Coastal Fire Rd)', activityType: 'run', startLatlng: [37.848929, -122.546576] },
	{ id: 28137547, name: "Muir Beach parking to Pirate's Cove", activityType: 'run', startLatlng: [37.860163, -122.574336] },
	{ id: 22406375, name: "Pirate's Cove stairs to Coastal Trail", activityType: 'run', startLatlng: [37.852232, -122.56085] },
	{ id: 26727254, name: 'Wolf Ridge Descent to Miwok', activityType: 'run', startLatlng: [37.843131, -122.535037] },
	{ id: 33237422, name: 'Marine Mammal Center Climb', activityType: 'run', startLatlng: [37.834041, -122.533401] },
	{ id: 30046737, name: 'Wolf Ridge to Lower Tennessee Valley Trail', activityType: 'run', startLatlng: [37.84303, -122.535629] },
];
