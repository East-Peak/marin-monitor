/**
 * Hand-reviewed placement for the configured Caltrans cameras.
 *
 * Mapped from Caltrans D4 cctvStatusD04.json by image URL on 2026-10-17;
 * re-check if a configured camera URL changes.
 * Source: https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json
 */

export type CompassDirection = 'N' | 'S' | 'E' | 'W';

export interface CaltransCam {
	/** Our camera id (matches CAMERAS) */
	id: string;
	/** Image URL as published in the D4 feed (must equal the configured URL) */
	d4ImageUrl: string;
	lat: number;
	lon: number;
	/** Direction the camera faces */
	direction: CompassDirection;
	road: string;
}

/** Field of view, in degrees, of the map wedge drawn for a camera. */
export const CALTRANS_WEDGE_FOV = 60;

export const CALTRANS_CAMS: Record<string, CaltransCam> = {
	'caltrans-spencer': {
		id: 'caltrans-spencer',
		d4ImageUrl:
			'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tve73us101spenceravenue/tve73us101spenceravenue.jpg',
		lat: 37.85081,
		lon: -122.48975,
		direction: 'N',
		road: 'US-101'
	},
	'caltrans-sr1': {
		id: 'caltrans-sr1',
		d4ImageUrl:
			'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tve75us101marinsr1/tve75us101marinsr1.jpg',
		lat: 37.88161,
		lon: -122.51698,
		direction: 'S',
		road: 'US-101'
	},
	'caltrans-580': {
		id: 'caltrans-580',
		d4ImageUrl: 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tve83us101i580/tve83us101i580.jpg',
		lat: 37.96194,
		lon: -122.50975,
		direction: 'E',
		road: 'US-101'
	},
	'caltrans-ignacio': {
		id: 'caltrans-ignacio',
		d4ImageUrl:
			'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tve86us101ignacioblvd/tve86us101ignacioblvd.jpg',
		lat: 38.06618,
		lon: -122.53708,
		direction: 'S',
		road: 'US-101'
	}
};

const AZIMUTH: Record<CompassDirection, number> = { N: 0, E: 90, S: 180, W: 270 };

/** Compass azimuth in degrees clockwise from north. */
export function directionAz(d: CompassDirection): number {
	return AZIMUTH[d];
}

/** The subset of a cctvStatusD04.json record that placement needs. */
export interface D4Record {
	cctv?: {
		location?: { latitude?: string; longitude?: string; direction?: string };
		imageData?: { static?: { currentImageURL?: string } };
	};
}

const WORD_TO_DIRECTION: Record<string, CompassDirection> = {
	North: 'N',
	South: 'S',
	East: 'E',
	West: 'W'
};

/** Look a camera up in D4 records by image URL; null when absent or malformed. */
export function d4Placement(
	records: readonly D4Record[],
	imageUrl: string
): { lat: number; lon: number; direction: CompassDirection } | null {
	const cctv = records.find((r) => r.cctv?.imageData?.static?.currentImageURL === imageUrl)?.cctv;
	const loc = cctv?.location;
	if (!loc) return null;
	const lat = Number(loc.latitude);
	const lon = Number(loc.longitude);
	const direction = WORD_TO_DIRECTION[loc.direction ?? ''];
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || !direction) return null;
	return { lat, lon, direction };
}
