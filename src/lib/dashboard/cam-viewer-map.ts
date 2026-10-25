/**
 * The camera viewer's corner map (CAMVIEW1): a static, north-up SVG of Marin, not a second
 * MapLibre. One pure projection draws the outline, the anchors, the cameras and the view cone;
 * the cone is the map's own `sector()` with the map's rules (solid when still and fresh, dashed
 * while sweeping or unreported, none without a usable heading, a road direction for Caltrans).
 */
import type { CameraConfig } from '$lib/config/cameras';
import { CALTRANS_CAMS, CALTRANS_WEDGE_FOV, directionAz } from '$lib/config/caltrans-cams';
import { MARIN_OUTLINE } from '$lib/config/marin-outline';
import { noWedgeLine, sector, wedgeState, type CamHeading } from './cam-heading';
import { camPosition } from './cam-viewer';
import type { Bounds } from './map-in-view';
import { ROAD_WEDGE_KM, WEDGE_KM } from './v2-map-layers';

type LonLat = readonly [number, number];
type Point = [number, number];

export const MARIN_BOUNDS: Bounds = (() => {
	const pts = MARIN_OUTLINE.flat();
	const lons = pts.map((p) => p[0]);
	const lats = pts.map((p) => p[1]);
	return {
		west: Math.min(...lons),
		east: Math.max(...lons),
		south: Math.min(...lats),
		north: Math.max(...lats)
	};
})();

/** A few places to read the map by (positions from `config/map.ts`'s landmarks and towns). */
export const ANCHORS: readonly { name: string; at: LonLat }[] = [
	{ name: 'Mt. Tam', at: [-122.5965, 37.9235] },
	{ name: 'San Rafael', at: [-122.5311, 37.9735] },
	{ name: 'Novato', at: [-122.5697, 38.1074] },
	{ name: 'Point Reyes', at: [-123.0, 38.0] },
	{ name: 'Golden Gate', at: [-122.4783, 37.8199] }
];

export interface Projection {
	width: number;
	height: number;
	project(p: LonLat): Point;
}

/**
 * Equirectangular at the box's middle latitude: north up, and a degree of longitude drawn
 * cos(latitude) as wide as a degree of latitude, so the county keeps its shape.
 */
export function createProjection(b: Bounds, width: number, pad: number): Projection {
	const k = Math.cos((((b.north + b.south) / 2) * Math.PI) / 180);
	const scale = (width - 2 * pad) / ((b.east - b.west) * k);
	return {
		width,
		height: (b.north - b.south) * scale + 2 * pad,
		project: ([lon, lat]) => [pad + (lon - b.west) * k * scale, pad + (b.north - lat) * scale]
	};
}

const fmt = ([x, y]: Point) => `${x.toFixed(1)},${y.toFixed(1)}`;

export function pathOf(points: readonly Point[]): string {
	return `M${points.map(fmt).join('L')}Z`;
}

export function outlinePaths(p: Projection): string[] {
	return MARIN_OUTLINE.map((ring) => pathOf(ring.map((pt) => p.project(pt))));
}

export type ViewerCone =
	| { style: 'solid' | 'sweeping' | 'approximate'; origin: Point; points: Point[] }
	| { style: null; reason: string };

/** The current camera's cone, projected; or why none is drawn, in the map's words. */
export function viewerCone(
	cam: CameraConfig,
	heading: CamHeading | undefined,
	now: number,
	p: Projection
): ViewerCone {
	const at = camPosition(cam);
	if (!at) return { style: null, reason: 'No direction drawn: position unknown' };
	const road = CALTRANS_CAMS[cam.id];
	const drawn = (
		style: 'solid' | 'sweeping' | 'approximate',
		az: number,
		fov: number,
		km: number
	) => {
		const [ring] = sector(at, az, fov, km).coordinates;
		return { style, origin: p.project(at), points: ring.map((c) => p.project([c[0], c[1]])) };
	};
	if (road)
		return drawn('approximate', directionAz(road.direction), CALTRANS_WEDGE_FOV, ROAD_WEDGE_KM);
	const style = heading ? wedgeState(heading, now) : null;
	if (!heading || !style) return { style: null, reason: noWedgeLine(heading, now)! };
	return drawn(style, heading.az!, heading.fov!, WEDGE_KM);
}
