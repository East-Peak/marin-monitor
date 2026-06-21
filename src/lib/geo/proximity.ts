/**
 * Geo-proximity utilities for Marin County towns.
 *
 * haversineDistance — meters between two lat/lon points
 * findNearestTown  — assign a lat/lon to its closest Marin town
 * getLocationForTown — map a town slug to the best LocationPreset for weather/tides
 */

import { MARIN_TOWNS, TOWN_BY_SLUG, MARIN_CENTER, MARIN_BOUNDS } from '$lib/config/towns';
import {
	LOCATION_PRESETS,
	DEFAULT_LOCATION_ID,
	getLocationById,
	type LocationPreset
} from '$lib/config/locations';

/** Haversine distance in meters between two lat/lon points */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371000;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest Marin town to a given lat/lon point.
 * Returns the town slug, or null if beyond maxDistanceM (default 8km).
 */
export function findNearestTown(
	lat: number,
	lon: number,
	maxDistanceM: number = 8000
): string | null {
	let bestSlug: string | null = null;
	let bestDist = Infinity;

	for (const town of MARIN_TOWNS) {
		const dist = haversineDistance(lat, lon, town.lat, town.lon);
		if (dist < bestDist) {
			bestDist = dist;
			bestSlug = town.slug;
		}
	}

	return bestDist <= maxDistanceM ? bestSlug : null;
}

// Pre-compute town → nearest LocationPreset mapping
const townLocationMap: Record<string, string> = {};

for (const town of MARIN_TOWNS) {
	let bestPresetId = DEFAULT_LOCATION_ID;
	let bestDist = Infinity;

	for (const preset of LOCATION_PRESETS) {
		const dist = haversineDistance(town.lat, town.lon, preset.lat, preset.lon);
		if (dist < bestDist) {
			bestDist = dist;
			bestPresetId = preset.id;
		}
	}

	townLocationMap[town.slug] = bestPresetId;
}

/**
 * Check if a lat/lon point is inside Marin County (bounding box with padding).
 * Used for geocoded address validation, article enrichment, etc.
 */
export function isInsideMarin(lat: number, lon: number, pad = 0.03): boolean {
	return (
		lat >= MARIN_BOUNDS.south - pad &&
		lat <= MARIN_BOUNDS.north + pad &&
		lon >= MARIN_BOUNDS.west - pad &&
		lon <= MARIN_BOUNDS.east + pad
	);
}

/**
 * Check if a lat/lon point is within a given radius of central Marin.
 * Used for fire incidents and other broad regional data.
 */
export function isNearMarin(lat: number, lon: number, radiusKm = 80): boolean {
	const dLat = Math.abs(lat - MARIN_CENTER.lat);
	const dLon = Math.abs(lon - MARIN_CENTER.lon);
	// ~111km per degree lat, ~85km per degree lon at this latitude
	const approxKm = Math.sqrt((dLat * 111) ** 2 + (dLon * 85) ** 2);
	return approxKm <= radiusKm;
}

/**
 * Get the best LocationPreset for a given town slug.
 * Uses the town's own coordinates and name for accurate weather,
 * but keeps the nearest preset's tide station (fixed NOAA locations).
 * Returns the central-marin default when townSlug is null.
 */
export function getLocationForTown(townSlug: string | null): LocationPreset {
	if (!townSlug) return getLocationById(DEFAULT_LOCATION_ID);
	const town = TOWN_BY_SLUG[townSlug];
	if (!town) return getLocationById(DEFAULT_LOCATION_ID);

	// Get nearest preset for its tide station only
	const presetId = townLocationMap[townSlug] ?? DEFAULT_LOCATION_ID;
	const preset = getLocationById(presetId);

	return {
		id: town.slug,
		name: town.name,
		lat: town.lat,
		lon: town.lon,
		tideStation: preset.tideStation,
		tideStationName: preset.tideStationName
	};
}
