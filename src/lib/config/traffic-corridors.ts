/**
 * Getting Around's roads (Stuart, 2026-10-14): Marin, plus the main routes from Marin to the
 * airports — US-101 over the Golden Gate Bridge into San Francisco, then 101, or CA-1 (19th Ave)
 * and I-280, south to SFO; I-580 over the Richmond–San Rafael Bridge, then I-80 and I-880 to OAK.
 * A box is [west, south, east, north] in degrees. An event counts for a route when one of its roads
 * is the segment's road (direction suffix dropped) and its point lies in that segment's box; it is on
 * the trip only when 511's direction is the segment's `outbound` one, leaving Marin (design call 1).
 * Boxes are rectangles: they can take in a ramp or a neighbouring stretch. corridors.test.ts walks
 * each segment at points along the itinerary, junctions included; a box is an approximation, so
 * the screen says which roads are covered (ROAD_SCOPE), not that nothing on them can be missed.
 */
export type Bbox = readonly [west: number, south: number, east: number, north: number];
export type Corridor = 'to-sfo' | 'to-oak';
type Direction = 'Northbound' | 'Southbound' | 'Eastbound' | 'Westbound';

interface RouteSegment {
	road: string;
	/** The direction of travel from Marin to the airport. */
	outbound: Direction;
	bbox: Bbox;
	covers: string;
}

export const AIRPORT_ROUTES: readonly {
	corridor: Corridor;
	segments: readonly RouteSegment[];
}[] = [
	{
		corridor: 'to-sfo',
		segments: [
			{
				road: 'US-101',
				outbound: 'Southbound',
				bbox: [-122.58, 37.6, -122.37, 38.12],
				covers: 'Novato over the Golden Gate Bridge, through San Francisco, to SFO'
			},
			{
				road: 'CA-1',
				outbound: 'Southbound',
				bbox: [-122.49, 37.7, -122.46, 37.81],
				covers: 'Park Presidio and 19th Ave, the bridge to I-280'
			},
			{
				road: 'I-280',
				outbound: 'Southbound',
				bbox: [-122.5, 37.6, -122.38, 37.78],
				covers: 'San Francisco to San Bruno'
			},
			{
				road: 'I-380',
				outbound: 'Eastbound',
				bbox: [-122.48, 37.62, -122.39, 37.645],
				covers: 'I-280 to US-101 at SFO (SFO’s own directions from 280: 380 East → 101 South)'
			}
		]
	},
	{
		corridor: 'to-oak',
		segments: [
			{
				road: 'I-580',
				outbound: 'Eastbound',
				bbox: [-122.53, 37.88, -122.29, 37.98],
				covers: 'San Rafael over the Richmond–San Rafael Bridge to Albany'
			},
			{
				road: 'I-80',
				outbound: 'Westbound',
				bbox: [-122.32, 37.825, -122.28, 37.93],
				covers: 'Albany to the MacArthur Maze'
			},
			{
				road: 'I-880',
				outbound: 'Southbound',
				bbox: [-122.3, 37.7, -122.17, 37.83],
				covers: 'The Maze to OAK'
			}
		]
	}
];

/** The direction out of Marin on a corridor's road ("Eastbound" for I-580 to OAK); null when it isn't one. */
export const outboundOf = (corridor: Corridor, road: string): Direction | null =>
	AIRPORT_ROUTES.find((r) => r.corridor === corridor)?.segments.find((s) => s.road === road)
		?.outbound ?? null;

/** 511's county name for Marin (`areas[].name`). */
export const MARIN_AREA = 'Marin';

export const TRIP_LABEL: Record<Corridor, string> = { 'to-sfo': 'to SFO', 'to-oak': 'to OAK' };

/** What the roads part covers, said on screen (Codex r1 #6). */
export const ROAD_SCOPE =
	'Marin roads; 101, 19th Ave, 280 and 380 to SFO; 580, 80 and 880 to OAK. Long-term construction shown only when it closes a road.';
