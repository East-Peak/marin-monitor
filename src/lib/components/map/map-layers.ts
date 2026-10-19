/**
 * MapLibre source and layer setup for the Marin Monitor map.
 *
 * `setupSources()` idempotently adds every GeoJSON/vector source and its
 * associated visual layers to the map.  It is called on initial load and
 * again after a style swap (which strips custom sources/layers).
 *
 * Layer paint definitions use hover-expression helpers from map-interactions
 * so that hover-state feedback is baked into the layer style rather than
 * requiring imperative paint updates.
 */

import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { FIRE_ZONES, LANDMARKS, AIRPORT_PINS } from '$lib/config/map';
import { MAPBOX_TOKEN } from '$lib/config/api';
import { hoverCase, hoverAdd, hoveredFeatureIds } from './map-interactions';

const mapboxToken = MAPBOX_TOKEN.trim();

/** Road speeds' colours, free flow to closed: the lines and the Layers key share them (TRAFFIC1). */
export const ROAD_SPEED_COLORS = {
	low: '#9fbfa5',
	moderate: '#f59e0b',
	heavy: '#f97316',
	severe: '#dc2626',
	closed: '#7f1d1d'
} as const;

const CLOSED: ExpressionSpecification = [
	'any',
	['==', ['get', 'closed'], true],
	['==', ['get', 'closed'], 'yes']
];
const FREE_FLOW: ExpressionSpecification = ['==', ['get', 'congestion'], 'low'];
/** Free flow on an open road: a closure keeps its full width whatever its congestion says. */
const FREE_FLOW_OPEN: ExpressionSpecification = ['all', FREE_FLOW, ['!', CLOSED]];

/**
 * The congestion lines' opacity; v2 swaps it for 0 while the tiles can't vouch (road-speeds).
 * Free flow is a whisper, fainter than a camera wedge at rest (0.25), so slow spots stand out.
 */
export const CONGESTION_LINE_OPACITY: ExpressionSpecification = [
	'case',
	CLOSED,
	0.78,
	FREE_FLOW,
	0.24,
	['==', ['get', 'congestion'], 'moderate'],
	0.46,
	0.78
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register every GeoJSON (and optional Mapbox vector) source on the map,
 * then add all visual layers in the correct z-order.
 *
 * This function is idempotent — if the `towns` source already exists it
 * returns immediately.
 */

/** Kept-after-failure features (property `retained`, set only by an owner) paint dimmed; others are unchanged. */
export function retainedDim<T>(expr: T): ['case', ['==', ['get', 'retained'], true], number, T] {
	return ['case', ['==', ['get', 'retained'], true], 0.4, expr];
}

/** The blotter badge sits up and right of its town's dot. */
const BLOTTER_BADGE_OFFSET_PX: [number, number] = [11, -11];

export function setupSources(map: MapLibreMap): void {
	// Style swaps remove custom sources/layers. Re-add when missing.
	if (map.getSource('towns')) return;
	hoveredFeatureIds.clear();
	map.getCanvas().style.cursor = '';

	addSources(map);
	addLayers(map);
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function addSources(map: MapLibreMap): void {
	// Town boundary highlight source (Census polygons)
	map.addSource('town-boundary', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	map.addSource('towns', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	map.addSource('news-pins', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	map.addSource('alert-pulses', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	map.addSource('earthquakes', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	map.addSource('fire-incidents', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	// 511 traffic events source (major/severe/moderate incidents)
	map.addSource('traffic-events', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	// Mapbox vector traffic source (optional)
	if (mapboxToken) {
		map.addSource('traffic-congestion', {
			type: 'vector',
			tiles: [
				`https://api.mapbox.com/v4/mapbox.mapbox-traffic-v1/{z}/{x}/{y}.vector.pbf?access_token=${encodeURIComponent(
					mapboxToken
				)}&v=2`
			],
			minzoom: 6,
			maxzoom: 16
		});
	}

	// Fire zones source
	map.addSource('fire-zones', {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: FIRE_ZONES.map((zone) => ({
				type: 'Feature' as const,
				id: zone.name,
				properties: { name: zone.name, desc: zone.desc },
				geometry: {
					type: 'Point' as const,
					coordinates: [zone.center.lon, zone.center.lat]
				}
			}))
		}
	});

	// Landmarks source
	map.addSource('landmarks', {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: LANDMARKS.map((lm) => ({
				type: 'Feature' as const,
				id: `${lm.type}:${lm.name}`,
				properties: { name: lm.name, type: lm.type },
				geometry: {
					type: 'Point' as const,
					coordinates: [lm.lon, lm.lat]
				}
			}))
		}
	});

	// Airport status pins source
	map.addSource('airports', {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: AIRPORT_PINS.map((ap) => ({
				type: 'Feature' as const,
				id: ap.code,
				properties: {
					code: ap.code,
					name: ap.name,
					color: '#6b7280',
					statusLabel: 'Loading\u2026',
					weatherSummary: ''
				},
				geometry: {
					type: 'Point' as const,
					coordinates: [ap.lon, ap.lat]
				}
			}))
		}
	});

	map.addSource('gas-stations', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	map.addSource('ev-charging-stations', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	map.addSource('coffee-shops', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	map.addSource('fitness-studios', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});

	// v2's fire cameras and their view wedges (MAPX4); empty unless an owner draws them. Both
	// keyed by the camera id, so one feature state lights a camera's pin and wedge (CAMQUIET1).
	map.addSource('cameras', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] },
		promoteId: 'itemId'
	});
	map.addSource('camera-wedges', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] },
		promoteId: 'itemId'
	});

	// v2's venue dots and towns' sheriff-report counts (NEWSPIN1); empty unless an owner draws them.
	map.addSource('show-venues', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] },
		promoteId: 'itemId'
	});
	map.addSource('blotter-towns', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] },
		promoteId: 'itemId'
	});
	// v2's stories at their headline's place (NEWSPIN2); empty unless an owner draws them.
	map.addSource('story-places', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] },
		promoteId: 'itemId'
	});

	// 311 reports source (SeeClickFix / Fix It Marin)
	map.addSource('311-reports', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});
}

// ---------------------------------------------------------------------------
// Layers — added in z-order (bottom to top)
// ---------------------------------------------------------------------------

/** The fire cameras' pins and wedges (the Layers row's swatch, `CAM_SWATCH`). */
const CAMERA_COLOR = '#38bdf8';

/** `loud` while the feature's camera is emphasised (`cam-emphasis.ts`), `rest` otherwise. */
const emphasisCase = (
	loud: number,
	rest: number | ExpressionSpecification
): ExpressionSpecification => [
	'case',
	['boolean', ['feature-state', 'emphasis'], false],
	loud,
	rest
];

/** A wedge's outline, whatever its dashes: a faint hairline at rest (CAMQUIET1). */
const CAMERA_WEDGE_LINE = {
	'line-width': emphasisCase(1.5, 0.75),
	'line-opacity': emphasisCase(0.9, 0.25)
};

function addLayers(map: MapLibreMap): void {
	// --- Shared paint expressions ---
	const trafficEventRadius = [
		'case',
		['==', ['get', 'severity'], 'SEVERE'],
		8,
		['==', ['get', 'severity'], 'MAJOR'],
		6,
		5
	];
	const earthquakeRadius = [
		'interpolate',
		['linear'],
		['get', 'magnitude'],
		1,
		4,
		2,
		6,
		3,
		10,
		4,
		14,
		5,
		20,
		6,
		28
	];
	const earthquakeRingRadius = [
		'interpolate',
		['linear'],
		['get', 'magnitude'],
		1,
		8,
		2,
		12,
		3,
		18,
		4,
		24,
		5,
		32,
		6,
		44
	];
	const fireIncidentRadius = [
		'interpolate',
		['linear'],
		['get', 'acres'],
		0,
		6,
		100,
		10,
		1000,
		16,
		10000,
		24
	];
	const townRadius = ['coalesce', ['get', 'radius'], 3];
	const townOpacity = ['coalesce', ['get', 'opacity'], 0.18];
	const townLabelOpacity = ['coalesce', ['get', 'labelOpacity'], 0.25];
	const townStrokeOpacity = ['case', ['>', ['coalesce', ['get', 'total'], 0], 0], 0.5, 0.2];

	// --- Town boundary highlight (renders beneath everything) ---
	map.addLayer({
		id: 'town-boundary-fill',
		type: 'fill',
		source: 'town-boundary',
		paint: {
			'fill-color': 'rgba(139, 92, 246, 0.06)',
			'fill-outline-color': 'rgba(139, 92, 246, 0.2)'
		}
	});

	map.addLayer({
		id: 'town-boundary-stroke',
		type: 'line',
		source: 'town-boundary',
		paint: {
			'line-color': 'rgba(139, 92, 246, 0.35)',
			'line-width': 1.5,
			'line-dasharray': [4, 3]
		}
	});

	// --- Fire camera wedges (MAPX4): a wedge per last reported heading, dashed while sweeping.
	// Quiet at rest, under every layer's dots; full strength while emphasised (CAMQUIET1). ---
	map.addLayer({
		id: 'camera-wedges-fill',
		type: 'fill',
		source: 'camera-wedges',
		paint: {
			'fill-color': CAMERA_COLOR,
			'fill-opacity': emphasisCase(0.3, ['case', ['==', ['get', 'style'], 'solid'], 0.05, 0.03])
		}
	});
	const wedgeLine = { 'line-color': CAMERA_COLOR, ...CAMERA_WEDGE_LINE };
	map.addLayer({
		id: 'camera-wedges-line',
		type: 'line',
		source: 'camera-wedges',
		filter: ['==', ['get', 'style'], 'solid'],
		paint: wedgeLine
	});
	map.addLayer({
		id: 'camera-wedges-sweeping',
		type: 'line',
		source: 'camera-wedges',
		filter: ['==', ['get', 'style'], 'sweeping'],
		paint: { ...wedgeLine, 'line-dasharray': [2, 2] }
	});
	map.addLayer({
		id: 'camera-wedges-approximate',
		type: 'line',
		source: 'camera-wedges',
		filter: ['==', ['get', 'style'], 'approximate'],
		paint: { ...wedgeLine, 'line-dasharray': [0.5, 1.5] }
	});

	// --- Fire zones ---
	map.addLayer({
		id: 'fire-zones-layer',
		type: 'circle',
		source: 'fire-zones',
		paint: {
			'circle-radius': hoverCase(24, 20),
			'circle-color': hoverCase('rgba(248, 113, 113, 0.18)', 'rgba(239, 68, 68, 0.12)'),
			'circle-stroke-width': hoverCase(1.8, 1),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(239, 68, 68, 0.3)')
		}
	});

	// --- Traffic congestion (Mapbox vector) ---
	if (mapboxToken) {
		map.addLayer({
			id: 'traffic-congestion-layer',
			type: 'line',
			source: 'traffic-congestion',
			'source-layer': 'traffic',
			filter: [
				'any',
				['match', ['get', 'congestion'], ['low', 'moderate', 'heavy', 'severe'], true, false],
				CLOSED
			],
			// Slower draws on top: free flow under the colours, closures over everything.
			layout: {
				'line-sort-key': [
					'case',
					CLOSED,
					4,
					['match', ['get', 'congestion'], 'moderate', 1, 'heavy', 2, 'severe', 3, 0]
				]
			},
			paint: {
				'line-color': [
					'case',
					CLOSED,
					ROAD_SPEED_COLORS.closed,
					[
						'match',
						['get', 'congestion'],
						'low',
						ROAD_SPEED_COLORS.low,
						'severe',
						ROAD_SPEED_COLORS.severe,
						'heavy',
						ROAD_SPEED_COLORS.heavy,
						ROAD_SPEED_COLORS.moderate
					]
				],
				'line-opacity': CONGESTION_LINE_OPACITY,
				// Free flow stays under a resting camera wedge's 0.75 px at every zoom.
				'line-width': [
					'interpolate',
					['linear'],
					['zoom'],
					8,
					['case', FREE_FLOW_OPEN, 0.6, 1.6],
					11,
					['case', FREE_FLOW_OPEN, 0.7, 2.9],
					14,
					['case', FREE_FLOW_OPEN, 0.72, 5.2]
				]
			}
		});
	}

	// --- Traffic events (511 incidents) ---
	map.addLayer({
		id: 'traffic-events-layer',
		type: 'circle',
		source: 'traffic-events',
		paint: {
			'circle-radius': hoverAdd(trafficEventRadius, 3),
			'circle-color': [
				'case',
				['==', ['get', 'severity'], 'SEVERE'],
				'#dc2626',
				['==', ['get', 'severity'], 'MAJOR'],
				'#f97316',
				'#f59e0b'
			],
			'circle-opacity': hoverCase(0.96, 0.7),
			'circle-stroke-width': hoverCase(2, 1),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(10, 10, 10, 0.8)')
		}
	});

	map.addLayer({
		id: 'traffic-events-hit-layer',
		type: 'circle',
		source: 'traffic-events',
		paint: {
			'circle-radius': 14,
			'circle-color': 'rgba(0, 0, 0, 0)'
		}
	});

	// --- Landmarks ---
	map.addLayer({
		id: 'landmarks-layer',
		type: 'circle',
		source: 'landmarks',
		paint: {
			'circle-radius': hoverCase(5.5, 3),
			'circle-color': hoverCase('rgba(255, 244, 214, 0.38)', 'rgba(255, 255, 255, 0.2)'),
			'circle-stroke-width': hoverCase(1.8, 0.5),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(255, 255, 255, 0.3)')
		}
	});

	map.addLayer({
		id: 'landmarks-hit-layer',
		type: 'circle',
		source: 'landmarks',
		paint: {
			'circle-radius': 13,
			'circle-color': 'rgba(0, 0, 0, 0)'
		}
	});

	map.addLayer({
		id: 'landmarks-label',
		type: 'symbol',
		source: 'landmarks',
		layout: {
			'text-field': ['get', 'name'],
			'text-size': 9,
			'text-offset': [0, 1.2],
			'text-anchor': 'top',
			'text-optional': true
		},
		paint: {
			'text-color': 'rgba(255, 255, 255, 0.25)',
			'text-halo-color': 'rgba(10, 10, 10, 0.8)',
			'text-halo-width': 1
		}
	});

	// --- Airport status ---
	map.addLayer({
		id: 'airports-layer',
		type: 'circle',
		source: 'airports',
		paint: {
			'circle-radius': hoverCase(10.5, 7),
			'circle-color': ['get', 'color'],
			'circle-opacity': hoverCase(1, 0.9),
			'circle-stroke-width': hoverCase(3, 1.5),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(255, 255, 255, 0.8)')
		}
	});

	map.addLayer({
		id: 'airports-hit-layer',
		type: 'circle',
		source: 'airports',
		paint: {
			'circle-radius': 14,
			'circle-color': 'rgba(0, 0, 0, 0)'
		}
	});

	map.addLayer({
		id: 'airports-label',
		type: 'symbol',
		source: 'airports',
		layout: {
			'text-field': ['get', 'code'],
			'text-size': 10,
			'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
			'text-offset': [0, -1.4],
			'text-anchor': 'bottom',
			'text-optional': true
		},
		paint: {
			'text-color': ['get', 'color'],
			'text-halo-color': 'rgba(10, 10, 10, 0.9)',
			'text-halo-width': 1.5
		}
	});

	// --- Earthquakes ---
	map.addLayer({
		id: 'earthquakes-layer',
		type: 'circle',
		source: 'earthquakes',
		paint: {
			'circle-radius': hoverAdd(earthquakeRadius, 3.25),
			'circle-color': hoverCase('rgba(252, 211, 77, 0.72)', 'rgba(251, 191, 36, 0.5)'),
			'circle-stroke-width': hoverCase(2.8, 2),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', '#f59e0b'),
			'circle-opacity': retainedDim(hoverCase(0.96, 0.7))
		}
	});

	map.addLayer({
		id: 'earthquakes-ring-layer',
		type: 'circle',
		source: 'earthquakes',
		paint: {
			'circle-radius': hoverAdd(earthquakeRingRadius, 3),
			'circle-color': 'transparent',
			'circle-stroke-width': hoverCase(2.2, 1.5),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.72)', 'rgba(251, 191, 36, 0.3)'),
			'circle-stroke-opacity': hoverCase(0.92, 0.6)
		}
	});

	// --- Fire incidents ---
	map.addLayer({
		id: 'fire-incidents-layer',
		type: 'circle',
		source: 'fire-incidents',
		paint: {
			'circle-radius': hoverAdd(fireIncidentRadius, 4),
			'circle-color': hoverCase('rgba(255, 153, 62, 0.88)', 'rgba(255, 120, 0, 0.7)'),
			'circle-stroke-width': hoverCase(3.4, 2),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', '#ef4444')
		}
	});

	map.addLayer({
		id: 'fire-incidents-label',
		type: 'symbol',
		source: 'fire-incidents',
		layout: {
			'text-field': ['get', 'name'],
			'text-size': 10,
			'text-offset': [0, 1.6],
			'text-anchor': 'top',
			'text-optional': true
		},
		paint: {
			'text-color': '#fbbf24',
			'text-halo-color': 'rgba(10, 10, 10, 0.9)',
			'text-halo-width': 1.5
		}
	});

	// --- Gas stations ---
	map.addLayer({
		id: 'gas-stations-layer',
		type: 'circle',
		source: 'gas-stations',
		paint: {
			'circle-radius': hoverCase(8.5, 5),
			'circle-color': '#22d3ee',
			'circle-opacity': hoverCase(0.98, 0.8),
			'circle-stroke-width': hoverCase(3, 1),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(10, 10, 10, 0.8)')
		}
	});

	map.addLayer({
		id: 'gas-stations-hit-layer',
		type: 'circle',
		source: 'gas-stations',
		paint: {
			'circle-radius': 14,
			'circle-color': 'rgba(0, 0, 0, 0)'
		}
	});

	map.addLayer({
		id: 'gas-stations-label',
		type: 'symbol',
		source: 'gas-stations',
		minzoom: 12,
		layout: {
			'text-field': ['concat', ['get', 'name'], '\n', ['get', 'price']],
			'text-size': 9,
			'text-offset': [0, 1.4],
			'text-anchor': 'top',
			'text-optional': true
		},
		paint: {
			'text-color': '#22d3ee',
			'text-halo-color': 'rgba(10, 10, 10, 0.9)',
			'text-halo-width': 1.5
		}
	});

	// --- EV charging stations ---
	map.addLayer({
		id: 'ev-charging-stations-layer',
		type: 'circle',
		source: 'ev-charging-stations',
		paint: {
			'circle-radius': hoverCase(8.5, 5),
			'circle-color': '#a855f7',
			'circle-opacity': hoverCase(0.98, 0.8),
			'circle-stroke-width': hoverCase(3, 1),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(10, 10, 10, 0.8)')
		}
	});

	map.addLayer({
		id: 'ev-charging-stations-hit-layer',
		type: 'circle',
		source: 'ev-charging-stations',
		paint: {
			'circle-radius': 14,
			'circle-color': 'rgba(0, 0, 0, 0)'
		}
	});

	map.addLayer({
		id: 'ev-charging-stations-label',
		type: 'symbol',
		source: 'ev-charging-stations',
		minzoom: 12,
		layout: {
			'text-field': ['concat', ['get', 'network'], '\n', ['get', 'level']],
			'text-size': 9,
			'text-offset': [0, 1.4],
			'text-anchor': 'top',
			'text-optional': true
		},
		paint: {
			'text-color': '#a855f7',
			'text-halo-color': 'rgba(10, 10, 10, 0.9)',
			'text-halo-width': 1.5
		}
	});

	// --- Coffee shops ---
	map.addLayer({
		id: 'coffee-shops-layer',
		type: 'circle',
		source: 'coffee-shops',
		paint: {
			'circle-radius': hoverCase(8.5, 5),
			'circle-color': '#a16207',
			'circle-opacity': hoverCase(0.98, 0.8),
			'circle-stroke-width': hoverCase(3, 1),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(10, 10, 10, 0.8)')
		}
	});

	map.addLayer({
		id: 'coffee-shops-hit-layer',
		type: 'circle',
		source: 'coffee-shops',
		paint: {
			'circle-radius': 14,
			'circle-color': 'rgba(0, 0, 0, 0)'
		}
	});

	map.addLayer({
		id: 'coffee-shops-label',
		type: 'symbol',
		source: 'coffee-shops',
		minzoom: 12,
		layout: {
			'text-field': [
				'case',
				['==', ['get', 'hasPrice'], 1],
				['concat', ['get', 'name'], '\n', ['get', 'price']],
				['concat', ['get', 'name'], '\n', ['get', 'statusLabel']]
			],
			'text-size': 9,
			'text-offset': [0, 1.4],
			'text-anchor': 'top',
			'text-optional': true
		},
		paint: {
			'text-color': '#a16207',
			'text-halo-color': 'rgba(10, 10, 10, 0.9)',
			'text-halo-width': 1.5
		}
	});

	// --- Fitness studios ---
	map.addLayer({
		id: 'fitness-studios-layer',
		type: 'circle',
		source: 'fitness-studios',
		paint: {
			'circle-radius': hoverCase(8.5, 5),
			'circle-color': ['get', 'color'],
			'circle-opacity': hoverCase(0.98, 0.8),
			'circle-stroke-width': hoverCase(3, 1),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(10, 10, 10, 0.8)')
		}
	});

	map.addLayer({
		id: 'fitness-studios-hit-layer',
		type: 'circle',
		source: 'fitness-studios',
		paint: {
			'circle-radius': 14,
			'circle-color': 'rgba(0, 0, 0, 0)'
		}
	});

	map.addLayer({
		id: 'fitness-studios-label',
		type: 'symbol',
		source: 'fitness-studios',
		minzoom: 12,
		layout: {
			'text-field': ['concat', ['get', 'name'], '\n', ['get', 'price']],
			'text-size': 9,
			'text-offset': [0, 1.4],
			'text-anchor': 'top',
			'text-optional': true
		},
		paint: {
			'text-color': '#ec4899',
			'text-halo-color': 'rgba(10, 10, 10, 0.9)',
			'text-halo-width': 1.5
		}
	});

	// --- Fire cameras (MAPX4): their pins; the wedges sit under every layer's dots ---
	map.addLayer({
		id: 'cameras-layer',
		type: 'circle',
		source: 'cameras',
		paint: {
			'circle-radius': hoverCase(7.5, 4.5),
			'circle-color': CAMERA_COLOR,
			'circle-stroke-width': hoverCase(3, 1.5),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(10, 10, 10, 0.85)')
		}
	});
	map.addLayer({
		id: 'cameras-hit-layer',
		type: 'circle',
		source: 'cameras',
		paint: { 'circle-radius': 14, 'circle-color': 'rgba(0, 0, 0, 0)' }
	});

	// --- 311 reports ---
	map.addLayer({
		id: '311-reports-layer',
		type: 'circle',
		source: '311-reports',
		paint: {
			'circle-radius': hoverCase(8.5, 5),
			'circle-color': '#ff6b35',
			'circle-opacity': retainedDim(hoverCase(0.98, 0.8)),
			'circle-stroke-width': hoverCase(3, 1),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(10, 10, 10, 0.8)')
		}
	});

	map.addLayer({
		id: '311-reports-hit-layer',
		type: 'circle',
		source: '311-reports',
		paint: {
			'circle-radius': 14,
			'circle-color': 'rgba(0, 0, 0, 0)'
		}
	});

	map.addLayer({
		id: '311-reports-label',
		type: 'symbol',
		source: '311-reports',
		minzoom: 12,
		layout: {
			'text-field': ['get', 'label'],
			'text-size': 9,
			'text-offset': [0, 1.4],
			'text-anchor': 'top',
			'text-optional': true
		},
		paint: {
			'text-color': '#ff6b35',
			'text-halo-color': 'rgba(10, 10, 10, 0.9)',
			'text-halo-width': 1.5
		}
	});

	// --- News pins ---
	map.addLayer({
		id: 'news-pins-layer',
		type: 'circle',
		source: 'news-pins',
		paint: {
			'circle-radius': hoverCase(5.2, 3),
			'circle-color': ['get', 'color'],
			'circle-opacity': retainedDim(hoverCase(0.96, 0.7)),
			'circle-stroke-width': hoverCase(2, 0.5),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(255, 255, 255, 0.3)')
		}
	});

	map.addLayer({
		id: 'news-pins-hit-layer',
		type: 'circle',
		source: 'news-pins',
		paint: {
			'circle-radius': 11,
			'circle-color': 'rgba(0, 0, 0, 0)'
		}
	});

	// --- Alert pulse rings ---
	map.addLayer({
		id: 'alert-pulse-layer',
		type: 'circle',
		source: 'alert-pulses',
		paint: {
			'circle-radius': 14,
			'circle-color': 'transparent',
			'circle-stroke-width': 2,
			'circle-stroke-color': '#ef4444',
			'circle-stroke-opacity': 0.6
		}
	});

	// --- Town dots ---
	map.addLayer({
		id: 'towns-layer',
		type: 'circle',
		source: 'towns',
		paint: {
			'circle-radius': hoverAdd(townRadius, 2.5),
			'circle-color': ['coalesce', ['get', 'color'], '#8b5cf6'],
			'circle-opacity': hoverCase(0.98, townOpacity),
			'circle-stroke-width': hoverCase(2.4, 1.5),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(255, 255, 255, 0.5)'),
			'circle-stroke-opacity': hoverCase(0.96, townStrokeOpacity)
		}
	});

	map.addLayer({
		id: 'towns-label',
		type: 'symbol',
		source: 'towns',
		layout: {
			'text-field': ['get', 'name'],
			'text-size': 10,
			'text-offset': [0, 1.5],
			'text-anchor': 'top',
			'text-optional': true
		},
		paint: {
			'text-color': hoverCase('rgba(255, 255, 255, 0.96)', 'rgba(232, 232, 232, 0.7)'),
			'text-halo-color': 'rgba(10, 10, 10, 0.9)',
			'text-halo-width': 1,
			'text-opacity': hoverCase(0.96, townLabelOpacity)
		}
	});

	// --- Stories at their headline's place (NEWSPIN2): an area is a soft halo with no centre
	// dot, labelled "(area)"; a venue is the venue dot below, in the story's colour ---
	const isArea = ['==', ['get', 'precision'], 'area'];
	map.addLayer({
		id: 'story-places-halo',
		type: 'circle',
		source: 'story-places',
		filter: isArea as never,
		paint: {
			'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 16, 13, 44],
			'circle-color': ['coalesce', ['get', 'color'], '#8b5cf6'],
			'circle-opacity': hoverCase(0.45, retainedDim(0.28) as never),
			'circle-blur': 0.75
		}
	});
	map.addLayer({
		id: 'story-places-label',
		type: 'symbol',
		source: 'story-places',
		filter: isArea as never,
		layout: {
			'text-field': ['get', 'label'],
			'text-size': 11,
			'text-offset': [0, 1.6]
		},
		paint: {
			'text-color': 'rgba(232, 232, 232, 0.85)',
			'text-halo-color': 'rgba(10, 10, 10, 0.9)',
			'text-halo-width': 1.5
		}
	});
	map.addLayer({
		id: 'story-places-dot',
		type: 'circle',
		source: 'story-places',
		filter: ['!', isArea] as never,
		paint: {
			'circle-radius': hoverCase(8, 5.5),
			'circle-color': ['coalesce', ['get', 'color'], '#8b5cf6'],
			'circle-opacity': retainedDim(1) as never,
			'circle-stroke-width': hoverCase(3, 1.5),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(10, 10, 10, 0.85)')
		}
	});
	map.addLayer({
		id: 'story-places-hit-layer',
		type: 'circle',
		source: 'story-places',
		paint: { 'circle-radius': 14, 'circle-color': 'rgba(0, 0, 0, 0)' }
	});

	// --- Venue dots (NEWSPIN1): a solid dot at a reviewed venue's own building ---
	map.addLayer({
		id: 'show-venues-layer',
		type: 'circle',
		source: 'show-venues',
		paint: {
			'circle-radius': hoverCase(8, 5.5),
			'circle-color': '#e879f9',
			'circle-stroke-width': hoverCase(3, 1.5),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', 'rgba(10, 10, 10, 0.85)')
		}
	});
	map.addLayer({
		id: 'show-venues-hit-layer',
		type: 'circle',
		source: 'show-venues',
		paint: { 'circle-radius': 14, 'circle-color': 'rgba(0, 0, 0, 0)' }
	});

	// --- A town's sheriff-report count (NEWSPIN1): a badge on the town's dot, never a point ---
	map.addLayer({
		id: 'blotter-towns-layer',
		type: 'circle',
		source: 'blotter-towns',
		paint: {
			'circle-radius': hoverCase(9, 7.5),
			'circle-color': '#475569',
			'circle-stroke-width': hoverCase(2.5, 1.5),
			'circle-stroke-color': hoverCase('rgba(255, 247, 220, 0.98)', '#94a3b8'),
			'circle-translate': BLOTTER_BADGE_OFFSET_PX
		}
	});
	map.addLayer({
		id: 'blotter-towns-label',
		type: 'symbol',
		source: 'blotter-towns',
		layout: {
			'text-field': ['to-string', ['get', 'count']],
			'text-size': 10,
			'text-allow-overlap': true,
			'text-ignore-placement': true
		},
		paint: {
			'text-color': '#f8fafc',
			'text-translate': BLOTTER_BADGE_OFFSET_PX
		}
	});
}
