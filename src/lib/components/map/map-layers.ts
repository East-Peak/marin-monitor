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

import type { Map as MapLibreMap } from 'maplibre-gl';
import { FIRE_ZONES, LANDMARKS, AIRPORT_PINS } from '$lib/config/map';
import { MAPBOX_TOKEN } from '$lib/config/api';
import { hoverCase, hoverAdd, hoveredFeatureIds } from './map-interactions';

const mapboxToken = MAPBOX_TOKEN.trim();

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

	// 311 reports source (SeeClickFix / Fix It Marin)
	map.addSource('311-reports', {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	});
}

// ---------------------------------------------------------------------------
// Layers — added in z-order (bottom to top)
// ---------------------------------------------------------------------------

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
		1, 4,
		2, 6,
		3, 10,
		4, 14,
		5, 20,
		6, 28
	];
	const earthquakeRingRadius = [
		'interpolate',
		['linear'],
		['get', 'magnitude'],
		1, 8,
		2, 12,
		3, 18,
		4, 24,
		5, 32,
		6, 44
	];
	const fireIncidentRadius = [
		'interpolate',
		['linear'],
		['get', 'acres'],
		0, 6,
		100, 10,
		1000, 16,
		10000, 24
	];
	const townRadius = ['coalesce', ['get', 'radius'], 3];
	const townOpacity = ['coalesce', ['get', 'opacity'], 0.18];
	const townLabelOpacity = ['coalesce', ['get', 'labelOpacity'], 0.25];
	const townStrokeOpacity = [
		'case',
		['>', ['coalesce', ['get', 'total'], 0], 0],
		0.5,
		0.2
	];

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
				['==', ['get', 'congestion'], 'moderate'],
				['==', ['get', 'congestion'], 'heavy'],
				['==', ['get', 'congestion'], 'severe'],
				['==', ['get', 'closed'], true],
				['==', ['get', 'closed'], 'yes']
			],
			paint: {
				'line-color': [
					'case',
					['any', ['==', ['get', 'closed'], true], ['==', ['get', 'closed'], 'yes']],
					'#7f1d1d',
					['==', ['get', 'congestion'], 'severe'],
					'#dc2626',
					['==', ['get', 'congestion'], 'heavy'],
					'#f97316',
					'#f59e0b'
				],
				'line-opacity': ['case', ['==', ['get', 'congestion'], 'moderate'], 0.46, 0.78],
				'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.6, 11, 2.9, 14, 5.2]
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
			'circle-opacity': hoverCase(0.96, 0.7)
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

	// --- 311 reports ---
	map.addLayer({
		id: '311-reports-layer',
		type: 'circle',
		source: '311-reports',
		paint: {
			'circle-radius': hoverCase(8.5, 5),
			'circle-color': '#ff6b35',
			'circle-opacity': hoverCase(0.98, 0.8),
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
			'circle-opacity': hoverCase(0.96, 0.7),
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
}
