import { describe, it, expect } from 'vitest';
import {
	toNumber,
	buildFallbackFeatureId,
	extractCoordinates,
	parseTrafficSeverity,
	isWithinMarinView,
	buildTrafficEventFeatures,
	filterTrafficByTown,
	getStoryCountsByTown,
	getDominantColor
} from './map-data';

// ---------------------------------------------------------------------------
// toNumber
// ---------------------------------------------------------------------------

describe('toNumber', () => {
	it('returns a finite number as-is', () => {
		expect(toNumber(42)).toBe(42);
		expect(toNumber(-3.14)).toBe(-3.14);
	});

	it('parses numeric strings', () => {
		expect(toNumber('122.5')).toBe(122.5);
		expect(toNumber('-0.003')).toBe(-0.003);
	});

	it('returns null for non-numeric inputs', () => {
		expect(toNumber(null)).toBeNull();
		expect(toNumber(undefined)).toBeNull();
		expect(toNumber('abc')).toBeNull();
		expect(toNumber(NaN)).toBeNull();
		expect(toNumber(Infinity)).toBeNull();
		expect(toNumber({})).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// buildFallbackFeatureId
// ---------------------------------------------------------------------------

describe('buildFallbackFeatureId', () => {
	it('builds a deterministic id from prefix, coords and label', () => {
		const id = buildFallbackFeatureId('traffic', [-122.5, 37.9] as [number, number], 'crash');
		expect(id).toBe('traffic:crash:-122.50000,37.90000');
	});
});

// ---------------------------------------------------------------------------
// extractCoordinates
// ---------------------------------------------------------------------------

describe('extractCoordinates', () => {
	it('extracts from direct lat/lon properties', () => {
		expect(extractCoordinates({ lat: 37.9, lon: -122.5 })).toEqual([-122.5, 37.9]);
	});

	it('extracts from latitude/longitude properties', () => {
		expect(extractCoordinates({ latitude: 37.9, longitude: -122.5 })).toEqual([-122.5, 37.9]);
	});

	it('extracts from nested point object', () => {
		expect(extractCoordinates({ point: { lat: 37.9, lng: -122.5 } })).toEqual([-122.5, 37.9]);
	});

	it('extracts from GeoJSON geometry', () => {
		const event = {
			geometry: { type: 'Point', coordinates: [-122.5, 37.9] }
		};
		expect(extractCoordinates(event)).toEqual([-122.5, 37.9]);
	});

	it('extracts from nested geometry (LineString first coord)', () => {
		const event = {
			geometry: { type: 'LineString', coordinates: [[-122.5, 37.9], [-122.6, 38.0]] }
		};
		expect(extractCoordinates(event)).toEqual([-122.5, 37.9]);
	});

	it('extracts from deeply nested geometry (Polygon)', () => {
		const event = {
			geometry: { type: 'Polygon', coordinates: [[[-122.5, 37.9], [-122.6, 38.0]]] }
		};
		expect(extractCoordinates(event)).toEqual([-122.5, 37.9]);
	});

	it('returns null when no coordinates found', () => {
		expect(extractCoordinates({})).toBeNull();
		expect(extractCoordinates({ foo: 'bar' })).toBeNull();
	});

	it('handles string numeric values via toNumber coercion', () => {
		expect(extractCoordinates({ lat: '37.9', lon: '-122.5' })).toEqual([-122.5, 37.9]);
	});
});

// ---------------------------------------------------------------------------
// parseTrafficSeverity
// ---------------------------------------------------------------------------

describe('parseTrafficSeverity', () => {
	it('detects SEVERE severity', () => {
		expect(parseTrafficSeverity({ severity: 'severe' })).toBe('SEVERE');
	});

	it('detects MAJOR severity', () => {
		expect(parseTrafficSeverity({ severity: 'major' })).toBe('MAJOR');
		expect(parseTrafficSeverity({ severity: 'high' })).toBe('MAJOR');
	});

	it('detects MODERATE severity', () => {
		expect(parseTrafficSeverity({ severity: 'moderate' })).toBe('MODERATE');
		expect(parseTrafficSeverity({ severity: 'medium' })).toBe('MODERATE');
	});

	it('falls back to event type for closures/crashes', () => {
		expect(parseTrafficSeverity({ event_type: 'Road Closure' })).toBe('MAJOR');
		expect(parseTrafficSeverity({ type: 'collision' })).toBe('MAJOR');
		expect(parseTrafficSeverity({ eventType: 'CRASH on 101' })).toBe('MAJOR');
	});

	it('returns UNKNOWN for unrecognized events', () => {
		expect(parseTrafficSeverity({})).toBe('UNKNOWN');
		expect(parseTrafficSeverity({ severity: 'minor' })).toBe('UNKNOWN');
	});

	it('handles alternate property names', () => {
		expect(parseTrafficSeverity({ Severity: 'SEVERE' })).toBe('SEVERE');
		expect(parseTrafficSeverity({ impact: 'HIGH' })).toBe('MAJOR');
	});
});

// ---------------------------------------------------------------------------
// isWithinMarinView
// ---------------------------------------------------------------------------

describe('isWithinMarinView', () => {
	it('accepts a point within Marin County', () => {
		// San Rafael approx
		expect(isWithinMarinView(-122.53, 37.97)).toBe(true);
	});

	it('rejects a point far outside Marin', () => {
		// Los Angeles
		expect(isWithinMarinView(-118.24, 34.05)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// buildTrafficEventFeatures
// ---------------------------------------------------------------------------

describe('buildTrafficEventFeatures', () => {
	it('returns empty array for empty input', () => {
		expect(buildTrafficEventFeatures([])).toEqual([]);
	});

	it('filters out events without coordinates', () => {
		const result = buildTrafficEventFeatures([{ severity: 'severe' }]);
		expect(result).toHaveLength(0);
	});

	it('filters out UNKNOWN severity events', () => {
		const result = buildTrafficEventFeatures([
			{ lat: 37.97, lon: -122.53, severity: 'minor' }
		]);
		expect(result).toHaveLength(0);
	});

	it('builds features for valid traffic events', () => {
		const result = buildTrafficEventFeatures([
			{
				id: 'evt-1',
				lat: 37.97,
				lon: -122.53,
				severity: 'SEVERE',
				headline: 'Multi-vehicle collision',
				event_type: 'collision'
			}
		]);
		expect(result).toHaveLength(1);
		expect(result[0].properties?.severity).toBe('SEVERE');
		expect(result[0].properties?.title).toBe('Multi-vehicle collision');
		expect(result[0].properties?.source).toBe('511 Traffic');
	});

	it('filters out events outside Marin bounds', () => {
		const result = buildTrafficEventFeatures([
			{ lat: 34.05, lon: -118.24, severity: 'severe', headline: 'LA crash' }
		]);
		expect(result).toHaveLength(0);
	});

	it('generates fallback id when event has no id', () => {
		const result = buildTrafficEventFeatures([
			{ lat: 37.97, lon: -122.53, severity: 'severe' }
		]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toMatch(/^traffic:/);
	});
});

// ---------------------------------------------------------------------------
// filterTrafficByTown
// ---------------------------------------------------------------------------

describe('filterTrafficByTown', () => {
	it('returns all features when townSlug is null', () => {
		const features = [
			{ type: 'Feature', geometry: { type: 'Point', coordinates: [-122.53, 37.97] }, properties: {} }
		] as GeoJSON.Feature[];
		expect(filterTrafficByTown(features, null)).toHaveLength(1);
	});

	it('returns empty array when no features match town', () => {
		const features = [
			{ type: 'Feature', geometry: { type: 'Point', coordinates: [-122.53, 37.97] }, properties: {} }
		] as GeoJSON.Feature[];
		// This town slug is unlikely to match the coordinates
		expect(filterTrafficByTown(features, 'point-reyes-station')).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// getStoryCountsByTown
// ---------------------------------------------------------------------------

describe('getStoryCountsByTown', () => {
	const MOCK_CATEGORY_TO_LAYER: Record<string, string> = {
		local: 'news',
		safety: 'safety',
		civic: 'civic'
	};

	it('returns empty map for no items', () => {
		expect(getStoryCountsByTown([], MOCK_CATEGORY_TO_LAYER)).toEqual(new Map());
	});

	it('skips items without townSlug', () => {
		const items = [
			{ id: '1', title: 'Test', category: 'local' }
		] as unknown as import('$lib/types').NewsItem[];
		expect(getStoryCountsByTown(items, MOCK_CATEGORY_TO_LAYER).size).toBe(0);
	});

	it('counts items per town', () => {
		const items = [
			{ id: '1', title: 'Story A', category: 'local', townSlug: 'san-rafael' },
			{ id: '2', title: 'Story B', category: 'local', townSlug: 'san-rafael' },
			{ id: '3', title: 'Story C', category: 'safety', townSlug: 'novato' }
		] as unknown as import('$lib/types').NewsItem[];

		const counts = getStoryCountsByTown(items, MOCK_CATEGORY_TO_LAYER);
		const sr = counts.get('san-rafael');
		expect(sr?.total).toBe(2);
		expect(sr?.topHeadline).toBe('Story A');

		const nov = counts.get('novato');
		expect(nov?.total).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// getDominantColor
// ---------------------------------------------------------------------------

describe('getDominantColor', () => {
	const MOCK_COLORS: Record<string, string> = {
		news: '#3b82f6',
		safety: '#ef4444',
		civic: '#a855f7'
	};

	it('returns the color of the layer with the most stories', () => {
		expect(getDominantColor({ news: 5, safety: 10 }, MOCK_COLORS)).toBe('#ef4444');
	});

	it('defaults to news color when byLayer is empty', () => {
		expect(getDominantColor({}, MOCK_COLORS)).toBe('#3b82f6');
	});

	it('returns fallback news color for unknown layers', () => {
		expect(getDominantColor({ unknown: 3 }, MOCK_COLORS)).toBe('#3b82f6');
	});
});
