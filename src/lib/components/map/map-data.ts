/**
 * Pure data-transformation functions for the Marin Monitor map.
 *
 * These convert domain objects (NewsItem[], traffic events, gas stations, etc.)
 * into GeoJSON features suitable for MapLibre sources.  Every function here is
 * deterministic and side-effect-free, making them straightforward to test.
 */

import { MARIN_BOUNDS } from '$lib/config';
import { findNearestTown } from '$lib/geo/proximity';
import type { NewsItem, MapLayer } from '$lib/types';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** Coerce an unknown value to a finite number, or return null. */
export function toNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

/** Build a stable fallback feature id from a prefix, coordinates and label. */
export function buildFallbackFeatureId(
	prefix: string,
	coordinates: [number, number],
	label: string
): string {
	return `${prefix}:${label}:${coordinates[0].toFixed(5)},${coordinates[1].toFixed(5)}`;
}

// ---------------------------------------------------------------------------
// Coordinate extraction
// ---------------------------------------------------------------------------

/**
 * Try several common property shapes to extract [lon, lat] from a generic
 * event record.  Returns null when coordinates cannot be determined.
 */
export function extractCoordinates(event: Record<string, unknown>): [number, number] | null {
	const directLat = toNumber(
		event.lat ?? event.latitude ?? event.Latitude ?? event.Lat ?? event.y ?? null
	);
	const directLon = toNumber(
		event.lon ?? event.lng ?? event.longitude ?? event.Longitude ?? event.Long ?? event.x ?? null
	);
	if (directLat !== null && directLon !== null) return [directLon, directLat];

	const point = event.point as Record<string, unknown> | undefined;
	if (point) {
		const pointLat = toNumber(point.lat ?? point.latitude ?? null);
		const pointLon = toNumber(point.lon ?? point.lng ?? point.longitude ?? null);
		if (pointLat !== null && pointLon !== null) return [pointLon, pointLat];
	}

	const geometryCandidates = [event.geometry, event.geography];
	for (const candidate of geometryCandidates) {
		if (!candidate || typeof candidate !== 'object') continue;
		const geometry = candidate as Record<string, unknown>;
		const coordinates = geometry.coordinates;
		if (!Array.isArray(coordinates)) continue;

		if (
			coordinates.length >= 2 &&
			typeof coordinates[0] === 'number' &&
			typeof coordinates[1] === 'number'
		) {
			return [coordinates[0], coordinates[1]];
		}

		const first = coordinates[0];
		if (
			Array.isArray(first) &&
			first.length >= 2 &&
			typeof first[0] === 'number' &&
			typeof first[1] === 'number'
		) {
			return [first[0], first[1]];
		}

		const nestedFirst = Array.isArray(first) ? first[0] : null;
		if (
			Array.isArray(nestedFirst) &&
			nestedFirst.length >= 2 &&
			typeof nestedFirst[0] === 'number' &&
			typeof nestedFirst[1] === 'number'
		) {
			return [nestedFirst[0], nestedFirst[1]];
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// Traffic helpers
// ---------------------------------------------------------------------------

const TRAFFIC_BOUNDS_BUFFER = 0.12;

export function isWithinMarinView(lon: number, lat: number): boolean {
	return (
		lon >= MARIN_BOUNDS.west - TRAFFIC_BOUNDS_BUFFER &&
		lon <= MARIN_BOUNDS.east + TRAFFIC_BOUNDS_BUFFER &&
		lat >= MARIN_BOUNDS.south - TRAFFIC_BOUNDS_BUFFER &&
		lat <= MARIN_BOUNDS.north + TRAFFIC_BOUNDS_BUFFER
	);
}

export function parseTrafficSeverity(
	event: Record<string, unknown>
): 'MODERATE' | 'MAJOR' | 'SEVERE' | 'UNKNOWN' {
	const raw = String(
		event.severity ??
			event.Severity ??
			(event.severityLevel as string | undefined) ??
			(event.impact as string | undefined) ??
			''
	).toUpperCase();

	if (raw.includes('SEVERE')) return 'SEVERE';
	if (raw.includes('MAJOR') || raw.includes('HIGH')) return 'MAJOR';
	if (raw.includes('MODERATE') || raw.includes('MEDIUM')) return 'MODERATE';

	const typeText = String(
		event.event_type ?? event.eventType ?? event.type ?? event.category ?? ''
	).toUpperCase();
	if (typeText.includes('CLOS')) return 'MAJOR';
	if (typeText.includes('COLLISION') || typeText.includes('CRASH')) return 'MAJOR';

	return 'UNKNOWN';
}

export function buildTrafficEventFeatures(events: Record<string, unknown>[]): GeoJSON.Feature[] {
	const features: GeoJSON.Feature[] = [];
	for (const event of events) {
		const coords = extractCoordinates(event);
		if (!coords) continue;
		if (!isWithinMarinView(coords[0], coords[1])) continue;

		const severity = parseTrafficSeverity(event);
		if (severity === 'UNKNOWN') continue;

		const title =
			String(
				event.headline ?? event.Headline ?? event.description ?? event.Description ?? ''
			).trim() || 'Traffic event';
		const type = String(event.event_type ?? event.eventType ?? event.type ?? 'incident');
		const id =
			String(event.id ?? event.Id ?? '').trim() || buildFallbackFeatureId('traffic', coords, title);

		features.push({
			type: 'Feature',
			id,
			properties: {
				id,
				title,
				type,
				severity,
				source: '511 Traffic',
				layer: 'traffic'
			},
			geometry: {
				type: 'Point',
				coordinates: coords
			}
		});
	}

	return features;
}

/**
 * Filter traffic features to a single town.  Pass `null` for county-wide
 * (returns all features unfiltered).
 */
export function filterTrafficByTown(
	features: GeoJSON.Feature[],
	townSlug: string | null
): GeoJSON.Feature[] {
	if (!townSlug) return features;
	return features.filter((f) => {
		const coords = (f.geometry as GeoJSON.Point).coordinates;
		return findNearestTown(coords[1], coords[0]) === townSlug;
	});
}

// ---------------------------------------------------------------------------
// News / town aggregation
// ---------------------------------------------------------------------------

export interface TownStoryStats {
	total: number;
	byLayer: Record<string, number>;
	topHeadline: string;
}

/** Count how many active stories each town has, broken out by map layer. */
export function getStoryCountsByTown(
	items: NewsItem[],
	categoryToLayer: Record<string, string>
): Map<string, TownStoryStats> {
	const counts = new Map<string, TownStoryStats>();
	for (const item of items) {
		if (!item.townSlug) continue;
		const layer = categoryToLayer[item.category];
		if (!layer) continue;

		const existing = counts.get(item.townSlug);
		if (existing) {
			existing.total++;
			existing.byLayer[layer] = (existing.byLayer[layer] || 0) + 1;
		} else {
			counts.set(item.townSlug, {
				total: 1,
				byLayer: { [layer]: 1 },
				topHeadline: item.title
			});
		}
	}
	return counts;
}

/** Pick the layer color with the most stories for a given town. */
export function getDominantColor(
	byLayer: Record<string, number>,
	layerColors: Record<string, string>
): string {
	let maxCount = 0;
	let dominant: MapLayer = 'news';
	for (const [layer, count] of Object.entries(byLayer)) {
		if (count > maxCount) {
			maxCount = count;
			dominant = layer as MapLayer;
		}
	}
	return layerColors[dominant] || layerColors.news;
}
