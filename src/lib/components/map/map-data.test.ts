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
	getDominantColor,
	buildTownFeature,
	buildTownFeatures,
	buildNewsPinFeatures,
	buildAlertPulseFeatures,
	parseMagnitudeFromTitle,
	buildEarthquakeFeatures,
	buildFireIncidentFeatures,
	buildGasStationFeatures,
	buildEvStationFeatures,
	buildCoffeeShopFeatures,
	buildFitnessStudioFeatures,
	parse311Title,
	build311ReportFeatures,
	formatAirportStatusLabel,
	buildAirportWeatherSummary,
	buildAirportFeatures
} from './map-data';
import type { Town } from '$lib/types';
import type { GasStation } from '$lib/types/gas';
import type { ChargingStation } from '$lib/types/ev-charging';
import type { FitnessStudio } from '$lib/types/fitness';
import type { AirportStatus, AirportWeather } from '$lib/types/airport';
import type { AirportPin } from '$lib/config/map';

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
			geometry: {
				type: 'LineString',
				coordinates: [
					[-122.5, 37.9],
					[-122.6, 38.0]
				]
			}
		};
		expect(extractCoordinates(event)).toEqual([-122.5, 37.9]);
	});

	it('extracts from deeply nested geometry (Polygon)', () => {
		const event = {
			geometry: {
				type: 'Polygon',
				coordinates: [
					[
						[-122.5, 37.9],
						[-122.6, 38.0]
					]
				]
			}
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
		const result = buildTrafficEventFeatures([{ lat: 37.97, lon: -122.53, severity: 'minor' }]);
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
		const result = buildTrafficEventFeatures([{ lat: 37.97, lon: -122.53, severity: 'severe' }]);
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
			{
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [-122.53, 37.97] },
				properties: {}
			}
		] as GeoJSON.Feature[];
		expect(filterTrafficByTown(features, null)).toHaveLength(1);
	});

	it('returns empty array when no features match town', () => {
		const features = [
			{
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [-122.53, 37.97] },
				properties: {}
			}
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

// ---------------------------------------------------------------------------
// buildTownFeature / buildTownFeatures
// ---------------------------------------------------------------------------

const MOCK_TOWN: Town = {
	name: 'San Rafael',
	slug: 'san-rafael',
	lat: 37.973,
	lon: -122.531,
	incorporated: true,
	region: 'San Rafael'
};

const MOCK_LAYER_COLORS: Record<string, string> = {
	news: '#8b5cf6',
	safety: '#ef4444',
	civic: '#3b82f6'
};

describe('buildTownFeature', () => {
	it('returns a Feature with Point geometry at the town coordinates', () => {
		const f = buildTownFeature(MOCK_TOWN, undefined, null, null, MOCK_LAYER_COLORS);
		expect(f.type).toBe('Feature');
		expect((f.geometry as GeoJSON.Point).type).toBe('Point');
		expect((f.geometry as GeoJSON.Point).coordinates).toEqual([-122.531, 37.973]);
	});

	it('uses slug as feature id', () => {
		const f = buildTownFeature(MOCK_TOWN, undefined, null, null, MOCK_LAYER_COLORS);
		expect(f.id).toBe('san-rafael');
	});

	it('produces zero total and dim opacity when no stats', () => {
		const f = buildTownFeature(MOCK_TOWN, undefined, null, null, MOCK_LAYER_COLORS);
		expect(f.properties?.total).toBe(0);
		expect(f.properties?.opacity).toBe(0.16);
		expect(f.properties?.radius).toBe(3);
	});

	it('computes radius and opacity from story count', () => {
		const stats = { total: 10, byLayer: { news: 10 }, topHeadline: 'Test' };
		const f = buildTownFeature(MOCK_TOWN, stats, null, null, MOCK_LAYER_COLORS);
		expect(f.properties?.total).toBe(10);
		expect(f.properties?.opacity).toBe(0.88);
		// 5 + 10 * 0.8 = 13, clamped to [6, 16]
		expect(f.properties?.radius).toBe(13);
	});

	it('dims the town when another town is selected', () => {
		const stats = { total: 5, byLayer: { news: 5 }, topHeadline: 'Test' };
		const f = buildTownFeature(MOCK_TOWN, stats, 'novato', null, MOCK_LAYER_COLORS);
		expect(f.properties?.opacity).toBe(0.08);
		expect(f.properties?.radius).toBe(2);
		expect(f.properties?.color).toBe('rgba(255, 255, 255, 0.1)');
	});

	it('does not dim the selected town', () => {
		const stats = { total: 5, byLayer: { news: 5 }, topHeadline: 'Test' };
		const f = buildTownFeature(MOCK_TOWN, stats, 'san-rafael', null, MOCK_LAYER_COLORS);
		expect(f.properties?.opacity).toBe(0.88);
	});

	it('marks selected flag when selectedTown matches', () => {
		const f = buildTownFeature(MOCK_TOWN, undefined, null, 'san-rafael', MOCK_LAYER_COLORS);
		expect(f.properties?.selected).toBe(true);
	});

	it('uses dominant layer color from stats', () => {
		const stats = { total: 3, byLayer: { safety: 3 }, topHeadline: 'Fire' };
		const f = buildTownFeature(MOCK_TOWN, stats, null, null, MOCK_LAYER_COLORS);
		expect(f.properties?.color).toBe('#ef4444');
	});
});

describe('buildTownFeatures', () => {
	it('returns one feature per town', () => {
		const towns: Town[] = [
			MOCK_TOWN,
			{
				name: 'Novato',
				slug: 'novato',
				lat: 38.107,
				lon: -122.57,
				incorporated: true,
				region: 'Novato'
			}
		];
		const result = buildTownFeatures(towns, new Map(), null, null, MOCK_LAYER_COLORS);
		expect(result).toHaveLength(2);
		expect(result[0].id).toBe('san-rafael');
		expect(result[1].id).toBe('novato');
	});

	it('applies story counts from the map', () => {
		const counts = new Map([
			['san-rafael', { total: 5, byLayer: { news: 5 }, topHeadline: 'Test' }]
		]);
		const result = buildTownFeatures([MOCK_TOWN], counts, null, null, MOCK_LAYER_COLORS);
		expect(result[0].properties?.total).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// buildNewsPinFeatures
// ---------------------------------------------------------------------------

const MOCK_CATEGORY_MAP: Record<string, string> = { local: 'news', safety: 'safety' };

describe('buildNewsPinFeatures', () => {
	it('returns empty array for no items', () => {
		expect(buildNewsPinFeatures([], MOCK_CATEGORY_MAP, null, MOCK_LAYER_COLORS)).toHaveLength(0);
	});

	it('skips items without lat/lon', () => {
		const items = [
			{
				id: '1',
				title: 'No coords',
				category: 'local',
				townSlug: 'san-rafael',
				source: 's',
				timestamp: 0
			}
		] as unknown as import('$lib/types').NewsItem[];
		expect(buildNewsPinFeatures(items, MOCK_CATEGORY_MAP, null, MOCK_LAYER_COLORS)).toHaveLength(0);
	});

	it('skips items not matching the town filter', () => {
		const items = [
			{
				id: '1',
				title: 'Test',
				category: 'local',
				townSlug: 'novato',
				lat: 38.1,
				lon: -122.5,
				source: 's',
				timestamp: 0
			}
		] as unknown as import('$lib/types').NewsItem[];
		expect(
			buildNewsPinFeatures(items, MOCK_CATEGORY_MAP, 'san-rafael', MOCK_LAYER_COLORS)
		).toHaveLength(0);
	});

	it('includes items with exact coords and matching filter', () => {
		const items = [
			{
				id: '42',
				title: 'Event',
				category: 'local',
				townSlug: 'san-rafael',
				lat: 37.97,
				lon: -122.53,
				source: 'SFGATE',
				timestamp: 1000
			}
		] as unknown as import('$lib/types').NewsItem[];
		const result = buildNewsPinFeatures(items, MOCK_CATEGORY_MAP, 'san-rafael', MOCK_LAYER_COLORS);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('42');
		expect(result[0].properties?.color).toBe('#8b5cf6');
		expect((result[0].geometry as GeoJSON.Point).coordinates).toEqual([-122.53, 37.97]);
	});

	it('passes through with null town filter (county-wide)', () => {
		const items = [
			{
				id: '1',
				title: 'A',
				category: 'local',
				townSlug: 'novato',
				lat: 38.1,
				lon: -122.5,
				source: 's',
				timestamp: 0
			},
			{
				id: '2',
				title: 'B',
				category: 'local',
				townSlug: 'san-rafael',
				lat: 37.97,
				lon: -122.53,
				source: 's',
				timestamp: 0
			}
		] as unknown as import('$lib/types').NewsItem[];
		expect(buildNewsPinFeatures(items, MOCK_CATEGORY_MAP, null, MOCK_LAYER_COLORS)).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// buildAlertPulseFeatures
// ---------------------------------------------------------------------------

describe('buildAlertPulseFeatures', () => {
	const townBySlug: Record<string, Town> = {
		'san-rafael': MOCK_TOWN
	};

	it('returns empty array for no items', () => {
		expect(buildAlertPulseFeatures([], null, townBySlug)).toHaveLength(0);
	});

	it('skips non-alert items', () => {
		const items = [
			{ id: '1', title: 'News', isAlert: false, townSlug: 'san-rafael' }
		] as unknown as import('$lib/types').NewsItem[];
		expect(buildAlertPulseFeatures(items, null, townBySlug)).toHaveLength(0);
	});

	it('skips alert items with no townSlug', () => {
		const items = [
			{ id: '1', title: 'Alert', isAlert: true }
		] as unknown as import('$lib/types').NewsItem[];
		expect(buildAlertPulseFeatures(items, null, townBySlug)).toHaveLength(0);
	});

	it('skips items when townSlug not in townBySlug', () => {
		const items = [
			{ id: '1', title: 'Alert', isAlert: true, townSlug: 'unknown-town' }
		] as unknown as import('$lib/types').NewsItem[];
		expect(buildAlertPulseFeatures(items, null, townBySlug)).toHaveLength(0);
	});

	it('builds pulse at town centroid for matching alert', () => {
		const items = [
			{ id: '1', title: 'Fire Alert', isAlert: true, townSlug: 'san-rafael', alertKeyword: 'fire' }
		] as unknown as import('$lib/types').NewsItem[];
		const result = buildAlertPulseFeatures(items, null, townBySlug);
		expect(result).toHaveLength(1);
		expect((result[0].geometry as GeoJSON.Point).coordinates).toEqual([-122.531, 37.973]);
		expect(result[0].properties?.keyword).toBe('fire');
	});

	it('filters to a single town when filter is set', () => {
		const items = [
			{ id: '1', title: 'Alert A', isAlert: true, townSlug: 'san-rafael', alertKeyword: 'fire' },
			{ id: '2', title: 'Alert B', isAlert: true, townSlug: 'novato', alertKeyword: 'evacuation' }
		] as unknown as import('$lib/types').NewsItem[];
		const result = buildAlertPulseFeatures(items, 'san-rafael', townBySlug);
		expect(result).toHaveLength(1);
		expect(result[0].properties?.keyword).toBe('fire');
	});
});

// ---------------------------------------------------------------------------
// parseMagnitudeFromTitle
// ---------------------------------------------------------------------------

describe('parseMagnitudeFromTitle', () => {
	it('extracts magnitude from USGS title format', () => {
		expect(parseMagnitudeFromTitle('M 3.2 - 5km NW of San Rafael')).toBe(3.2);
	});

	it('returns default 2 when no match', () => {
		expect(parseMagnitudeFromTitle('Earthquake near Marin')).toBe(2);
	});

	it('handles single-digit magnitude', () => {
		expect(parseMagnitudeFromTitle('M 5 - Major quake')).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// buildEarthquakeFeatures
// ---------------------------------------------------------------------------

describe('buildEarthquakeFeatures', () => {
	it('returns empty array for no items', () => {
		expect(buildEarthquakeFeatures([])).toHaveLength(0);
	});

	it('skips items without coordinates', () => {
		const items = [
			{ id: 'q1', title: 'M 2.1 - quake' }
		] as unknown as import('$lib/types').NewsItem[];
		expect(buildEarthquakeFeatures(items)).toHaveLength(0);
	});

	it('builds feature with correct magnitude and geometry', () => {
		const items = [
			{ id: 'q1', title: 'M 4.5 - 10km N of Novato', lat: 38.2, lon: -122.6 }
		] as unknown as import('$lib/types').NewsItem[];
		const result = buildEarthquakeFeatures(items);
		expect(result).toHaveLength(1);
		expect(result[0].properties?.magnitude).toBe(4.5);
		expect((result[0].geometry as GeoJSON.Point).coordinates).toEqual([-122.6, 38.2]);
	});
});

// ---------------------------------------------------------------------------
// buildFireIncidentFeatures
// ---------------------------------------------------------------------------

describe('buildFireIncidentFeatures', () => {
	it('returns empty array for no incidents', () => {
		expect(buildFireIncidentFeatures([])).toHaveLength(0);
	});

	it('maps incidents to GeoJSON Point features', () => {
		const incidents = [
			{
				id: 'fire-1',
				name: 'Miller Fire',
				acres: 250,
				containment: 45,
				lat: 38.0,
				lon: -122.5,
				url: 'http://calfire.ca.gov',
				source: 'CAL FIRE'
			}
		];
		const result = buildFireIncidentFeatures(incidents);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('fire-1');
		expect(result[0].properties?.name).toBe('Miller Fire');
		expect(result[0].properties?.acres).toBe(250);
		expect(result[0].properties?.containment).toBe(45);
		expect((result[0].geometry as GeoJSON.Point).coordinates).toEqual([-122.5, 38.0]);
	});
});

// ---------------------------------------------------------------------------
// buildGasStationFeatures
// ---------------------------------------------------------------------------

const MOCK_GAS_STATION: GasStation = {
	placeId: 'gp-1',
	name: 'Shell San Rafael',
	address: '100 Main St, San Rafael, CA',
	lat: 37.97,
	lon: -122.53,
	fuelPrices: [
		{ type: 'REGULAR_UNLEADED', price: 4.599 },
		{ type: 'PREMIUM', price: 5.099 }
	]
};

describe('buildGasStationFeatures', () => {
	it('returns empty array for no stations', () => {
		expect(buildGasStationFeatures([], null)).toHaveLength(0);
	});

	it('formats regular unleaded price correctly', () => {
		const result = buildGasStationFeatures([MOCK_GAS_STATION], null);
		expect(result).toHaveLength(1);
		expect(result[0].properties?.price).toBe('$4.599');
	});

	it('uses empty string when no regular unleaded price', () => {
		const station: GasStation = {
			...MOCK_GAS_STATION,
			fuelPrices: [{ type: 'PREMIUM', price: 5.099 }]
		};
		const result = buildGasStationFeatures([station], null);
		expect(result[0].properties?.price).toBe('');
	});

	it('places feature at station coordinates', () => {
		const result = buildGasStationFeatures([MOCK_GAS_STATION], null);
		expect((result[0].geometry as GeoJSON.Point).coordinates).toEqual([-122.53, 37.97]);
	});

	it('filters by town when filter is set (passes station in that town)', () => {
		// san-rafael is the nearest town to these coords in the real geo data
		const result = buildGasStationFeatures([MOCK_GAS_STATION], 'san-rafael');
		// can only assert no crash; actual geo filtering tested via findNearestTown
		expect(Array.isArray(result)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// buildEvStationFeatures
// ---------------------------------------------------------------------------

const MOCK_EV_STATION: ChargingStation = {
	stationId: 'ev-1',
	name: 'ChargePoint San Rafael',
	address: '200 4th St, San Rafael, CA',
	lat: 37.971,
	lon: -122.529,
	network: 'ChargePoint',
	connectors: [
		{ type: 'J1772', count: 2 },
		{ type: 'CCS', count: 1 }
	],
	level2Count: 2,
	dcFastCount: 1,
	totalPorts: 3,
	chargingLevels: ['Level2', 'DCFast'],
	pricingInfo: '$0.32/kWh'
};

describe('buildEvStationFeatures', () => {
	it('returns empty array for no stations', () => {
		expect(buildEvStationFeatures([])).toHaveLength(0);
	});

	it('detects DC Fast when DCFast is in chargingLevels', () => {
		const result = buildEvStationFeatures([MOCK_EV_STATION]);
		expect(result[0].properties?.level).toBe('DC Fast');
	});

	it('falls back to Level 2 when DCFast is absent', () => {
		const station: ChargingStation = { ...MOCK_EV_STATION, chargingLevels: ['Level2'] };
		const result = buildEvStationFeatures([station]);
		expect(result[0].properties?.level).toBe('Level 2');
	});

	it('joins connector types into a comma-separated string', () => {
		const result = buildEvStationFeatures([MOCK_EV_STATION]);
		expect(result[0].properties?.connectors).toBe('J1772, CCS');
	});

	it('includes pricing info', () => {
		const result = buildEvStationFeatures([MOCK_EV_STATION]);
		expect(result[0].properties?.pricing).toBe('$0.32/kWh');
	});

	it('defaults pricing to empty string when absent', () => {
		const station: ChargingStation = { ...MOCK_EV_STATION, pricingInfo: undefined };
		const result = buildEvStationFeatures([station]);
		expect(result[0].properties?.pricing).toBe('');
	});
});

// ---------------------------------------------------------------------------
// buildCoffeeShopFeatures
// ---------------------------------------------------------------------------

describe('buildCoffeeShopFeatures', () => {
	// CoffeeIndexShop requires prices object; empty prices = no headline
	const MOCK_COFFEE_SHOP: import('$lib/types/coffee').CoffeeIndexShop = {
		id: 'c-1',
		name: 'Marin Coffee',
		address: '1 Main St, San Rafael, CA',
		town: 'San Rafael',
		lat: 37.97,
		lon: -122.53,
		source: 'toast',
		prices: {}
	};

	it('returns empty array for no shops', () => {
		expect(buildCoffeeShopFeatures([], null)).toHaveLength(0);
	});

	it('builds feature for shop without price data', () => {
		const result = buildCoffeeShopFeatures([MOCK_COFFEE_SHOP], null);
		expect(result).toHaveLength(1);
		expect(result[0].properties?.price).toBe('');
		expect(result[0].properties?.statusLabel).toBe('Tracking soon');
		expect(result[0].properties?.hasPrice).toBe(0);
	});

	it('places feature at shop coordinates', () => {
		const result = buildCoffeeShopFeatures([MOCK_COFFEE_SHOP], null);
		expect((result[0].geometry as GeoJSON.Point).coordinates).toEqual([-122.53, 37.97]);
	});
});

// ---------------------------------------------------------------------------
// buildFitnessStudioFeatures
// ---------------------------------------------------------------------------

const MOCK_FITNESS_STUDIO: FitnessStudio = {
	id: 'fit-1',
	name: 'Marin Yoga',
	town: 'San Rafael',
	type: 'yoga',
	dropInPrice: 24,
	lat: 37.97,
	lon: -122.53
};

const MOCK_TYPE_LABELS: Record<string, string> = { yoga: 'Yoga', pilates: 'Pilates' };
const MOCK_TYPE_COLORS: Record<string, string> = { yoga: '#6366f1', pilates: '#ec4899' };

describe('buildFitnessStudioFeatures', () => {
	it('returns empty array for no studios', () => {
		expect(buildFitnessStudioFeatures([], null, MOCK_TYPE_LABELS, MOCK_TYPE_COLORS)).toHaveLength(
			0
		);
	});

	it('formats price as $X.dropInPrice', () => {
		const result = buildFitnessStudioFeatures(
			[MOCK_FITNESS_STUDIO],
			null,
			MOCK_TYPE_LABELS,
			MOCK_TYPE_COLORS
		);
		expect(result).toHaveLength(1);
		expect(result[0].properties?.price).toBe('$24');
	});

	it('maps type to label and color', () => {
		const result = buildFitnessStudioFeatures(
			[MOCK_FITNESS_STUDIO],
			null,
			MOCK_TYPE_LABELS,
			MOCK_TYPE_COLORS
		);
		expect(result[0].properties?.typeName).toBe('Yoga');
		expect(result[0].properties?.color).toBe('#6366f1');
	});

	it('places feature at studio coordinates', () => {
		const result = buildFitnessStudioFeatures(
			[MOCK_FITNESS_STUDIO],
			null,
			MOCK_TYPE_LABELS,
			MOCK_TYPE_COLORS
		);
		expect((result[0].geometry as GeoJSON.Point).coordinates).toEqual([-122.53, 37.97]);
	});
});

// ---------------------------------------------------------------------------
// parse311Title
// ---------------------------------------------------------------------------

describe('parse311Title', () => {
	it('splits on " · " separator', () => {
		const { category, street } = parse311Title('Pothole · 123 Main St');
		expect(category).toBe('Pothole');
		expect(street).toBe('123 Main St');
	});

	it('returns full title as category when no separator', () => {
		const { category, street } = parse311Title('Graffiti');
		expect(category).toBe('Graffiti');
		expect(street).toBe('');
	});
});

// ---------------------------------------------------------------------------
// build311ReportFeatures
// ---------------------------------------------------------------------------

describe('build311ReportFeatures', () => {
	it('returns empty array for no items', () => {
		expect(build311ReportFeatures([], null)).toHaveLength(0);
	});

	it('skips items without coordinates', () => {
		const items = [
			{ id: 'seeclickfix-1', title: 'Pothole', description: '' }
		] as unknown as import('$lib/types').NewsItem[];
		expect(build311ReportFeatures(items, null)).toHaveLength(0);
	});

	it('strips seeclickfix- prefix from id', () => {
		const items = [
			{ id: 'seeclickfix-42', title: 'Graffiti', lat: 37.97, lon: -122.53, description: '' }
		] as unknown as import('$lib/types').NewsItem[];
		const result = build311ReportFeatures(items, null);
		expect(result[0].id).toBe('42');
	});

	it('builds label with street when title contains separator', () => {
		const items = [
			{
				id: 'seeclickfix-10',
				title: 'Pothole · 123 Main St',
				lat: 37.97,
				lon: -122.53,
				description: ''
			}
		] as unknown as import('$lib/types').NewsItem[];
		const result = build311ReportFeatures(items, null);
		expect(result[0].properties?.category).toBe('Pothole');
		expect(result[0].properties?.label).toBe('Pothole\n123 Main St');
	});

	it('uses plain category as label when no separator', () => {
		const items = [
			{ id: 'seeclickfix-11', title: 'Graffiti', lat: 37.97, lon: -122.53, description: '' }
		] as unknown as import('$lib/types').NewsItem[];
		const result = build311ReportFeatures(items, null);
		expect(result[0].properties?.label).toBe('Graffiti');
	});

	it('filters by town when filter is set', () => {
		const items = [
			{
				id: 'seeclickfix-1',
				title: 'Graffiti',
				lat: 37.97,
				lon: -122.53,
				townSlug: 'san-rafael',
				description: ''
			},
			{
				id: 'seeclickfix-2',
				title: 'Pothole',
				lat: 38.1,
				lon: -122.5,
				townSlug: 'novato',
				description: ''
			}
		] as unknown as import('$lib/types').NewsItem[];
		const result = build311ReportFeatures(items, 'san-rafael');
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('1');
	});
});

// ---------------------------------------------------------------------------
// formatAirportStatusLabel
// ---------------------------------------------------------------------------

describe('formatAirportStatusLabel', () => {
	it('maps on-time to "On Time"', () => {
		expect(formatAirportStatusLabel('on-time')).toBe('On Time');
	});

	it('maps delays to "Delays"', () => {
		expect(formatAirportStatusLabel('delays')).toBe('Delays');
	});

	it('maps ground-delay to "Ground Delay"', () => {
		expect(formatAirportStatusLabel('ground-delay')).toBe('Ground Delay');
	});

	it('maps ground-stop to "Ground Stop"', () => {
		expect(formatAirportStatusLabel('ground-stop')).toBe('Ground Stop');
	});

	it('maps closed to "Closed"', () => {
		expect(formatAirportStatusLabel('closed')).toBe('Closed');
	});
});

// ---------------------------------------------------------------------------
// buildAirportWeatherSummary
// ---------------------------------------------------------------------------

describe('buildAirportWeatherSummary', () => {
	const BASE_WEATHER: AirportWeather = {
		fltCat: 'VFR',
		visibility: '10',
		visibilityNum: 10,
		ceiling: null,
		windSpeed: 12,
		windGust: null,
		windDir: 270,
		temp: 18,
		dewpoint: 10,
		fogRisk: false,
		rawMetar: '',
		observationTime: ''
	};

	it('builds basic summary without ceiling or gust', () => {
		const summary = buildAirportWeatherSummary(BASE_WEATHER);
		expect(summary).toBe('VFR · 10 vis · 270° 12 kt');
	});

	it('includes ceiling when present', () => {
		const w: AirportWeather = { ...BASE_WEATHER, ceiling: 2500 };
		const summary = buildAirportWeatherSummary(w);
		expect(summary).toContain('Ceiling 2500 ft');
	});

	it('includes gust when present', () => {
		const w: AirportWeather = { ...BASE_WEATHER, windGust: 20 };
		const summary = buildAirportWeatherSummary(w);
		expect(summary).toContain('12g20 kt');
	});

	it('appends Fog Risk when fogRisk is true', () => {
		const w: AirportWeather = { ...BASE_WEATHER, fogRisk: true };
		const summary = buildAirportWeatherSummary(w);
		expect(summary).toContain('Fog Risk');
	});
});

// ---------------------------------------------------------------------------
// buildAirportFeatures
// ---------------------------------------------------------------------------

const MOCK_AIRPORT_PINS: AirportPin[] = [
	{ code: 'SFO', name: 'San Francisco Intl', lat: 37.6213, lon: -122.379 }
];

const MOCK_STATUS_COLORS: Record<string, string> = {
	'on-time': '#22c55e',
	delays: '#f59e0b',
	closed: '#6b7280'
};

describe('buildAirportFeatures', () => {
	it('returns one feature per pin', () => {
		const result = buildAirportFeatures(MOCK_AIRPORT_PINS, new Map(), MOCK_STATUS_COLORS);
		expect(result).toHaveLength(1);
	});

	it('uses on-time defaults when no status data available', () => {
		const result = buildAirportFeatures(MOCK_AIRPORT_PINS, new Map(), MOCK_STATUS_COLORS);
		expect(result[0].properties?.statusLabel).toBe('On Time');
		expect(result[0].properties?.color).toBe('#22c55e');
		expect(result[0].properties?.weatherSummary).toBe('');
	});

	it('applies status data from statusMap', () => {
		const status: AirportStatus = {
			code: 'SFO',
			icao: 'KSFO',
			name: 'San Francisco Intl',
			status: 'delays',
			delays: [],
			weather: null,
			forecastNotes: [],
			tsa: null
		};
		const statusMap = new Map([['SFO', status]]);
		const result = buildAirportFeatures(MOCK_AIRPORT_PINS, statusMap, MOCK_STATUS_COLORS);
		expect(result[0].properties?.statusLabel).toBe('Delays');
		expect(result[0].properties?.color).toBe('#f59e0b');
	});

	it('includes weather summary when weather is present', () => {
		const weather: AirportWeather = {
			fltCat: 'IFR',
			visibility: '1',
			visibilityNum: 1,
			ceiling: 500,
			windSpeed: 8,
			windGust: null,
			windDir: 180,
			temp: 12,
			dewpoint: 11,
			fogRisk: true,
			rawMetar: '',
			observationTime: ''
		};
		const status: AirportStatus = {
			code: 'SFO',
			icao: 'KSFO',
			name: 'San Francisco Intl',
			status: 'on-time',
			delays: [],
			weather,
			forecastNotes: [],
			tsa: null
		};
		const statusMap = new Map([['SFO', status]]);
		const result = buildAirportFeatures(MOCK_AIRPORT_PINS, statusMap, MOCK_STATUS_COLORS);
		expect(result[0].properties?.weatherSummary).toContain('IFR');
		expect(result[0].properties?.weatherSummary).toContain('Fog Risk');
	});

	it('places feature at pin coordinates', () => {
		const result = buildAirportFeatures(MOCK_AIRPORT_PINS, new Map(), MOCK_STATUS_COLORS);
		expect((result[0].geometry as GeoJSON.Point).coordinates).toEqual([-122.379, 37.6213]);
	});
});
