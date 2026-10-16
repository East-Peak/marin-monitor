/**
 * The default county view: what the map opens on, and where "All of Marin" returns to.
 * Tuned to show the full county context while keeping detail.
 */
export const MARIN_OVERVIEW_BOUNDS: [[number, number], [number, number]] = [
	[-123.08, 37.76],
	[-122.26, 38.38]
];
const FIT = { padding: 12, maxZoom: 9.1 };

interface Fits {
	fitBounds(
		bounds: typeof MARIN_OVERVIEW_BOUNDS,
		options: typeof FIT & { duration: number }
	): unknown;
	cameraForBounds(
		bounds: typeof MARIN_OVERVIEW_BOUNDS,
		options: typeof FIT
	): { zoom?: number; center?: unknown } | undefined;
}

export function fitMarinOverview(map: Pick<Fits, 'fitBounds'>, duration: number): void {
	map.fitBounds(MARIN_OVERVIEW_BOUNDS, { ...FIT, duration });
}

/** Where fitMarinOverview would land at the map's current size (null if it can't fit). */
export function marinOverviewCamera(
	map: Pick<Fits, 'cameraForBounds'>
): { zoom: number; center: { lng: number; lat: number } } | null {
	const cam = map.cameraForBounds(MARIN_OVERVIEW_BOUNDS, FIT);
	if (!cam || typeof cam.zoom !== 'number' || !cam.center) return null;
	const { lng, lat } = cam.center as { lng: number; lat: number };
	return { zoom: cam.zoom, center: { lng, lat } };
}
