/**
 * Tests for geo-proximity utilities
 */

import { describe, it, expect } from 'vitest';
import {
	haversineDistance,
	findNearestTown,
	isInsideMarin,
	isNearMarin,
	getLocationForTown
} from './proximity';

describe('haversineDistance', () => {
	it('returns 0 for identical points', () => {
		expect(haversineDistance(37.9, -122.5, 37.9, -122.5)).toBe(0);
	});

	it('calculates correct distance between known points', () => {
		// Mill Valley (37.906, -122.545) to Sausalito (37.8591, -122.4852)
		const dist = haversineDistance(37.906, -122.545, 37.8591, -122.4852);
		// ~7.1 km — should be in the right ballpark
		expect(dist).toBeGreaterThan(6000);
		expect(dist).toBeLessThan(8000);
	});

	it('returns the same distance regardless of order', () => {
		const d1 = haversineDistance(37.9, -122.5, 38.0, -122.6);
		const d2 = haversineDistance(38.0, -122.6, 37.9, -122.5);
		expect(d1).toBeCloseTo(d2, 5);
	});

	it('handles antipodal points (max distance ~20,000 km)', () => {
		// North pole to South pole
		const dist = haversineDistance(90, 0, -90, 0);
		// ~20,015 km
		expect(dist).toBeGreaterThan(19_000_000);
		expect(dist).toBeLessThan(21_000_000);
	});
});

describe('findNearestTown', () => {
	it('finds Mill Valley for coordinates near Mill Valley', () => {
		// Slightly offset from Mill Valley center
		const slug = findNearestTown(37.906, -122.545);
		expect(slug).toBe('mill-valley');
	});

	it('finds Sausalito for coordinates near Sausalito', () => {
		const slug = findNearestTown(37.859, -122.485);
		expect(slug).toBe('sausalito');
	});

	it('returns null for coordinates far from Marin', () => {
		// Los Angeles
		const slug = findNearestTown(34.0522, -118.2437);
		expect(slug).toBeNull();
	});

	it('returns null when beyond maxDistanceM', () => {
		// San Francisco — close but not in Marin
		const slug = findNearestTown(37.7749, -122.4194, 2000);
		expect(slug).toBeNull();
	});

	it('respects custom maxDistanceM parameter', () => {
		// San Francisco with a very large radius
		const slug = findNearestTown(37.7749, -122.4194, 50000);
		expect(slug).not.toBeNull();
	});
});

describe('isInsideMarin', () => {
	it('returns true for central Marin coordinates', () => {
		expect(isInsideMarin(37.9735, -122.5311)).toBe(true);
	});

	it('returns true for coordinates inside bounding box', () => {
		// Mill Valley
		expect(isInsideMarin(37.906, -122.545)).toBe(true);
		// Novato
		expect(isInsideMarin(38.1074, -122.5697)).toBe(true);
	});

	it('returns false for coordinates clearly outside Marin', () => {
		// Los Angeles
		expect(isInsideMarin(34.0522, -118.2437)).toBe(false);
		// New York
		expect(isInsideMarin(40.7128, -74.006)).toBe(false);
	});

	it('uses padding parameter to expand bounding box', () => {
		// Just outside south boundary (37.82 - 0.03 = 37.79)
		const latJustOutside = 37.78;
		// Should fail with default padding
		expect(isInsideMarin(latJustOutside, -122.5)).toBe(false);
		// Should succeed with larger padding
		expect(isInsideMarin(latJustOutside, -122.5, 0.05)).toBe(true);
	});

	it('uses zero padding correctly', () => {
		// Right at the boundary edge — should fail with zero padding
		const latAtBoundary = 37.82;
		expect(isInsideMarin(latAtBoundary, -122.5, 0)).toBe(true);
		const latJustBelow = 37.819;
		expect(isInsideMarin(latJustBelow, -122.5, 0)).toBe(false);
	});
});

describe('isNearMarin', () => {
	it('returns true for central Marin', () => {
		expect(isNearMarin(37.9735, -122.5311)).toBe(true);
	});

	it('returns true for San Francisco (nearby)', () => {
		expect(isNearMarin(37.7749, -122.4194)).toBe(true);
	});

	it('returns false for Los Angeles', () => {
		expect(isNearMarin(34.0522, -118.2437)).toBe(false);
	});

	it('respects custom radius', () => {
		// Sacramento — ~120 km from Marin
		// Should fail with default 80km radius
		expect(isNearMarin(38.5816, -121.4944)).toBe(false);
		// Should succeed with 200km radius
		expect(isNearMarin(38.5816, -121.4944, 200)).toBe(true);
	});

	it('returns true for Marin-adjacent areas within default 80km', () => {
		// Oakland
		expect(isNearMarin(37.8044, -122.2712)).toBe(true);
		// Santa Rosa
		expect(isNearMarin(38.4404, -122.7141)).toBe(true);
	});
});

describe('getLocationForTown', () => {
	it('returns default location when townSlug is null', () => {
		const loc = getLocationForTown(null);
		expect(loc.id).toBe('central-marin');
		expect(loc.name).toBe('Central Marin');
	});

	it('returns default location for unknown town slug', () => {
		const loc = getLocationForTown('nonexistent-town');
		expect(loc.id).toBe('central-marin');
	});

	it('returns town-specific location for known town', () => {
		const loc = getLocationForTown('sausalito');
		expect(loc.id).toBe('sausalito');
		expect(loc.name).toBe('Sausalito');
		expect(loc.lat).toBe(37.8591);
		expect(loc.lon).toBe(-122.4852);
	});

	it('includes a tide station from the nearest preset', () => {
		const loc = getLocationForTown('sausalito');
		expect(loc.tideStation).toBeTruthy();
		expect(loc.tideStationName).toBeTruthy();
	});

	it('uses the town coordinates, not the preset coordinates', () => {
		const loc = getLocationForTown('mill-valley');
		// Mill Valley town coords (37.906, -122.545) differ from preset
		expect(loc.lat).toBe(37.906);
		expect(loc.lon).toBe(-122.545);
		expect(loc.name).toBe('Mill Valley');
	});

	it('returns a valid LocationPreset shape', () => {
		const loc = getLocationForTown('novato');
		expect(loc).toHaveProperty('id');
		expect(loc).toHaveProperty('name');
		expect(loc).toHaveProperty('lat');
		expect(loc).toHaveProperty('lon');
		expect(loc).toHaveProperty('tideStation');
		expect(loc).toHaveProperty('tideStationName');
	});
});
