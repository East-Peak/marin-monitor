<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type { Map as MapLibreMap, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
	import { allNewsItems } from '$lib/stores/news';
	import { mapStore, CATEGORY_TO_LAYER } from '$lib/stores/map';
	import { townFilter } from '$lib/stores/town-filter';
	import { TOWN_BY_SLUG } from '$lib/config/towns';
	import { currentGasStations } from '$lib/stores/gas-prices';
	import { currentCoffeeShops } from '$lib/stores/cappuccino';
	import { currentFitnessStudios } from '$lib/stores/fitness';
	import { currentChargingStations } from '$lib/stores/ev-charging';
	import { MARIN_TOWNS, LAYER_COLORS, MARIN_BOUNDS } from '$lib/config';
	import { TYPE_COLORS as FITNESS_TYPE_COLORS, TYPE_LABELS as FITNESS_TYPE_LABELS } from '$lib/config/fitness';
	import { FIRE_ZONES, LANDMARKS, AIRPORT_PINS, AIRPORT_STATUS_COLORS } from '$lib/config/map';
	import { fetchAirportStatus } from '$lib/api/marin/airport-status';
	import type { AirportStatus } from '$lib/types/airport';
	import { MAPBOX_TOKEN } from '$lib/config/api';
	import { findNearestTown } from '$lib/geo/proximity';
	import type { NewsItem, MapFeatureInspectorData, MapLayer } from '$lib/types';

	let boundaryData: GeoJSON.FeatureCollection | null = null;

	interface FireIncidentOverlay {
		id: string;
		name: string;
		acres: number;
		containment: number;
		lat: number;
		lon: number;
		url: string;
		source: string;
	}

	interface Props {
		earthquakes?: NewsItem[];
		fireIncidents?: FireIncidentOverlay[];
		onTownClick?: (townSlug: string) => void;
		onTownHover?: (townSlug: string | null) => void;
		onPinClick?: (itemId: string) => void;
		onFeatureClick?: (feature: MapFeatureInspectorData) => void;
	}

	let {
		earthquakes = [],
		fireIncidents = [],
		onTownClick,
		onTownHover,
		onPinClick,
		onFeatureClick
	}: Props = $props();

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Writable<boolean>;
	}>('maplibre-map');
	let removeStyleLoadListener: (() => void) | null = null;
	let interactionsBound = false;
	let trafficRefreshTimer: ReturnType<typeof setInterval> | null = null;
	let isTrafficFetchInFlight = false;
	let unsubscribeTownFilter: (() => void) | null = null;
	let lastTownSlug: string | null | undefined = undefined;
	let rawTrafficFeatures: GeoJSON.Feature[] = [];

	const TRAFFIC_REFRESH_MS = 3 * 60 * 1000;
	const TRAFFIC_BOUNDS_BUFFER = 0.12;
	const mapboxToken = MAPBOX_TOKEN.trim();
	const STRAVA_CLICK_LAYERS = [
		'strava-lines-ride',
		'strava-lines-run',
		'strava-pins',
		'strava-pins-labels'
	] as const;
	const HOVER_STATE = ['boolean', ['feature-state', 'hover'], false] as const;
	const INVITING_HOVER_STROKE = 'rgba(255, 247, 220, 0.98)';
	const hoveredFeatureIds = new Map<string, string | number | null>();

	type HoveredMapFeature = NonNullable<MapLayerMouseEvent['features']>[number];

	interface HoverBindingOptions {
		layerId: string;
		sourceId: string;
		onFeatureChange?: (feature: HoveredMapFeature | null) => void;
	}

	function hoverCase(hoverValue: unknown, baseValue: unknown): any {
		return ['case', HOVER_STATE, hoverValue, baseValue];
	}

	function hoverAdd(baseValue: unknown, amount: number): any {
		return hoverCase(['+', baseValue, amount], baseValue);
	}

	function getFeatureId(feature: { id?: unknown } | null | undefined): string | number | null {
		if (typeof feature?.id === 'string' || typeof feature?.id === 'number') {
			return feature.id;
		}
		return null;
	}

	function setHoveredFeatureState(
		map: MapLibreMap,
		layerId: string,
		sourceId: string,
		nextFeatureId: string | number | null
	) {
		const previousFeatureId = hoveredFeatureIds.get(layerId) ?? null;
		if (previousFeatureId === nextFeatureId) return;

		if (previousFeatureId !== null && map.getSource(sourceId)) {
			map.setFeatureState({ source: sourceId, id: previousFeatureId }, { hover: false });
		}

		hoveredFeatureIds.set(layerId, nextFeatureId);

		if (nextFeatureId !== null && map.getSource(sourceId)) {
			map.setFeatureState({ source: sourceId, id: nextFeatureId }, { hover: true });
		}
	}

	function clearHoveredFeatureState(map: MapLibreMap, layerId: string, sourceId: string) {
		setHoveredFeatureState(map, layerId, sourceId, null);
	}

	function bindInteractiveHover(map: MapLibreMap, options: HoverBindingOptions) {
		let lastFeatureId: string | number | null = null;

		const handleHover = (e: MapLayerMouseEvent) => {
			map.getCanvas().style.cursor = 'pointer';
			const feature = e.features?.[0] ?? null;
			const nextFeatureId = getFeatureId(feature);
			setHoveredFeatureState(map, options.layerId, options.sourceId, nextFeatureId);
			if (nextFeatureId === lastFeatureId) return;
			lastFeatureId = nextFeatureId;
			options.onFeatureChange?.(feature);
		};

		const handleLeave = () => {
			map.getCanvas().style.cursor = '';
			lastFeatureId = null;
			clearHoveredFeatureState(map, options.layerId, options.sourceId);
			options.onFeatureChange?.(null);
		};

		map.on('mouseenter', options.layerId, handleHover);
		map.on('mousemove', options.layerId, handleHover);
		map.on('mouseleave', options.layerId, handleLeave);
	}

	function buildFallbackFeatureId(prefix: string, coordinates: [number, number], label: string): string {
		return `${prefix}:${label}:${coordinates[0].toFixed(5)},${coordinates[1].toFixed(5)}`;
	}

	function toNumber(value: unknown): number | null {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value === 'string') {
			const parsed = parseFloat(value);
			return Number.isFinite(parsed) ? parsed : null;
		}
		return null;
	}

	function extractCoordinates(event: Record<string, unknown>): [number, number] | null {
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

	function clickHitsVisibleStravaFeature(map: MapLibreMap, e: MapLayerMouseEvent): boolean {
		const interactiveLayers = STRAVA_CLICK_LAYERS.filter((layerId) => {
			if (!map.getLayer(layerId)) return false;
			return map.getLayoutProperty(layerId, 'visibility') !== 'none';
		});
		if (interactiveLayers.length === 0) return false;
		return map.queryRenderedFeatures(e.point, { layers: [...interactiveLayers] }).length > 0;
	}

	function parseTrafficSeverity(
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

	function isWithinMarinView(lon: number, lat: number): boolean {
		return (
			lon >= MARIN_BOUNDS.west - TRAFFIC_BOUNDS_BUFFER &&
			lon <= MARIN_BOUNDS.east + TRAFFIC_BOUNDS_BUFFER &&
			lat >= MARIN_BOUNDS.south - TRAFFIC_BOUNDS_BUFFER &&
			lat <= MARIN_BOUNDS.north + TRAFFIC_BOUNDS_BUFFER
		);
	}

	function buildTrafficEventFeatures(events: Record<string, unknown>[]): GeoJSON.Feature[] {
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

	function filterTrafficByTown(features: GeoJSON.Feature[]): GeoJSON.Feature[] {
		const slug = get(townFilter);
		if (!slug) return features;
		return features.filter((f) => {
			const coords = (f.geometry as GeoJSON.Point).coordinates;
			return findNearestTown(coords[1], coords[0]) === slug;
		});
	}

	async function refreshTrafficEvents(map: MapLibreMap) {
		if (isTrafficFetchInFlight) return;
		if (!map.getSource('traffic-events')) return;

		isTrafficFetchInFlight = true;
		try {
			const response = await fetch('/api/traffic/events');
			if (!response.ok) return;
			const payload = (await response.json()) as {
				events?: Record<string, unknown>[];
			};
			const events = Array.isArray(payload.events) ? payload.events : [];
			rawTrafficFeatures = buildTrafficEventFeatures(events);
			const source = map.getSource('traffic-events') as GeoJSONSource;
			source.setData({
				type: 'FeatureCollection',
				features: filterTrafficByTown(rawTrafficFeatures)
			});
		} catch {
			// Silent fail: traffic is additive and should not block map rendering.
		} finally {
			isTrafficFetchInFlight = false;
		}
	}

	function applyTrafficVisibility(map: MapLibreMap) {
		const { showTrafficCongestion, showTrafficEvents } = get(mapStore);

		if (map.getLayer('traffic-congestion-layer')) {
			map.setLayoutProperty(
				'traffic-congestion-layer',
				'visibility',
				showTrafficCongestion ? 'visible' : 'none'
			);
		}

		if (map.getLayer('traffic-events-layer')) {
			map.setLayoutProperty(
				'traffic-events-layer',
				'visibility',
				showTrafficEvents ? 'visible' : 'none'
			);
		}
	}

	// Count stories per town
	function getStoryCountsByTown(
		items: NewsItem[]
	): Map<string, { total: number; byLayer: Record<string, number>; topHeadline: string }> {
		const counts = new Map<
			string,
			{ total: number; byLayer: Record<string, number>; topHeadline: string }
		>();
		for (const item of items) {
			if (!item.townSlug) continue;
			const layer = CATEGORY_TO_LAYER[item.category];
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

	// Determine dominant layer color for a town
	function getDominantColor(byLayer: Record<string, number>): string {
		let maxCount = 0;
		let dominant: MapLayer = 'news';
		for (const [layer, count] of Object.entries(byLayer)) {
			if (count > maxCount) {
				maxCount = count;
				dominant = layer as MapLayer;
			}
		}
		return LAYER_COLORS[dominant] || LAYER_COLORS.news;
	}

	function setupSources(map: MapLibreMap) {
		// Style swaps remove custom sources/layers. Re-add when missing.
		if (map.getSource('towns')) return;
		hoveredFeatureIds.clear();
		map.getCanvas().style.cursor = '';

		// Town boundary highlight source (Census polygons)
		map.addSource('town-boundary', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		// Town dots source
		map.addSource('towns', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		// News pins source
		map.addSource('news-pins', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		// Alert pulses source
		map.addSource('alert-pulses', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		// Earthquake source
		map.addSource('earthquakes', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		// Active fire incidents source
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
						statusLabel: 'Loading…',
						weatherSummary: ''
					},
					geometry: {
						type: 'Point' as const,
						coordinates: [ap.lon, ap.lat]
					}
				}))
			}
		});

		// Gas stations source
		map.addSource('gas-stations', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		// EV charging stations source
		map.addSource('ev-charging-stations', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		// Coffee shops source
		map.addSource('coffee-shops', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		// Fitness studios source
		map.addSource('fitness-studios', {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		// --- Layers ---
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
		const townStrokeOpacity = [
			'case',
			['>', ['coalesce', ['get', 'total'], 0], 0],
			0.5,
			0.2
		];

		// Town boundary highlight (renders beneath everything)
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

		// Fire zones (semi-transparent red circles)
		map.addLayer({
			id: 'fire-zones-layer',
			type: 'circle',
			source: 'fire-zones',
			paint: {
				'circle-radius': hoverCase(24, 20),
				'circle-color': hoverCase('rgba(248, 113, 113, 0.18)', 'rgba(239, 68, 68, 0.12)'),
				'circle-stroke-width': hoverCase(1.8, 1),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, 'rgba(239, 68, 68, 0.3)')
			}
		});

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

		map.addLayer({
			id: 'traffic-events-layer',
			type: 'circle',
			source: 'traffic-events',
			paint: {
				'circle-radius': hoverAdd(trafficEventRadius, 2),
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
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, 'rgba(10, 10, 10, 0.8)')
			}
		});

		// Landmarks (subtle small markers)
		map.addLayer({
			id: 'landmarks-layer',
			type: 'circle',
			source: 'landmarks',
			paint: {
				'circle-radius': hoverCase(4.5, 3),
				'circle-color': hoverCase('rgba(255, 244, 214, 0.38)', 'rgba(255, 255, 255, 0.2)'),
				'circle-stroke-width': hoverCase(1.1, 0.5),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, 'rgba(255, 255, 255, 0.3)')
			}
		});

		// Landmark labels
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

		// Airport status pins (larger dots, color from status)
		map.addLayer({
			id: 'airports-layer',
			type: 'circle',
			source: 'airports',
			paint: {
				'circle-radius': hoverCase(9.25, 7),
				'circle-color': ['get', 'color'],
				'circle-opacity': hoverCase(1, 0.9),
				'circle-stroke-width': hoverCase(2.5, 1.5),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, 'rgba(255, 255, 255, 0.8)')
			}
		});

		// Airport labels (code above dot)
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

		// Earthquake dots — amber/yellow, distinct from red crime/safety
		// Radius scales with magnitude: M2 = 6px, M3 = 10px, M4 = 14px, M5+ = 18px+
		map.addLayer({
			id: 'earthquakes-layer',
			type: 'circle',
			source: 'earthquakes',
			paint: {
				'circle-radius': hoverAdd(earthquakeRadius, 2.5),
				'circle-color': hoverCase('rgba(252, 211, 77, 0.72)', 'rgba(251, 191, 36, 0.5)'),
				'circle-stroke-width': hoverCase(2.8, 2),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, '#f59e0b'),
				'circle-opacity': hoverCase(0.96, 0.7)
			}
		});

		// Earthquake outer ring — concentric ring effect for visual distinction
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

		// Active fire incidents (pulsing orange/red circles, sized by acreage)
		map.addLayer({
			id: 'fire-incidents-layer',
			type: 'circle',
			source: 'fire-incidents',
			paint: {
				'circle-radius': hoverAdd(fireIncidentRadius, 3),
				'circle-color': hoverCase('rgba(255, 153, 62, 0.88)', 'rgba(255, 120, 0, 0.7)'),
				'circle-stroke-width': hoverCase(3, 2),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, '#ef4444')
			}
		});

		// Fire incident labels
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

		// Gas station dots (cyan)
		map.addLayer({
			id: 'gas-stations-layer',
			type: 'circle',
			source: 'gas-stations',
			paint: {
				'circle-radius': hoverCase(6.75, 5),
				'circle-color': '#22d3ee',
				'circle-opacity': hoverCase(0.98, 0.8),
				'circle-stroke-width': hoverCase(2, 1),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, 'rgba(10, 10, 10, 0.8)')
			}
		});

		// Gas station labels (visible at higher zoom)
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

		// EV charging station dots (purple)
		map.addLayer({
			id: 'ev-charging-stations-layer',
			type: 'circle',
			source: 'ev-charging-stations',
			paint: {
				'circle-radius': hoverCase(6.75, 5),
				'circle-color': '#a855f7',
				'circle-opacity': hoverCase(0.98, 0.8),
				'circle-stroke-width': hoverCase(2, 1),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, 'rgba(10, 10, 10, 0.8)')
			}
		});

		// EV charging station labels (visible at higher zoom)
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

		// Coffee shop dots (warm brown)
		map.addLayer({
			id: 'coffee-shops-layer',
			type: 'circle',
			source: 'coffee-shops',
			paint: {
				'circle-radius': hoverCase(6.75, 5),
				'circle-color': '#a16207',
				'circle-opacity': hoverCase(0.98, 0.8),
				'circle-stroke-width': hoverCase(2, 1),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, 'rgba(10, 10, 10, 0.8)')
			}
		});

		// Coffee shop labels (visible at higher zoom)
		map.addLayer({
			id: 'coffee-shops-label',
			type: 'symbol',
			source: 'coffee-shops',
			minzoom: 12,
			layout: {
				'text-field': ['concat', ['get', 'name'], '\n', ['get', 'price']],
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

		// Fitness studio dots (type-colored)
		map.addLayer({
			id: 'fitness-studios-layer',
			type: 'circle',
			source: 'fitness-studios',
			paint: {
				'circle-radius': hoverCase(6.75, 5),
				'circle-color': ['get', 'color'],
				'circle-opacity': hoverCase(0.98, 0.8),
				'circle-stroke-width': hoverCase(2, 1),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, 'rgba(10, 10, 10, 0.8)')
			}
		});

		// Fitness studio labels (visible at higher zoom)
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

		// News pins (small dots per item)
		map.addLayer({
			id: 'news-pins-layer',
			type: 'circle',
			source: 'news-pins',
			paint: {
				'circle-radius': hoverCase(4.4, 3),
				'circle-color': ['get', 'color'],
				'circle-opacity': hoverCase(0.96, 0.7),
				'circle-stroke-width': hoverCase(1.4, 0.5),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, 'rgba(255, 255, 255, 0.3)')
			}
		});

		// Invisible hit target to make tiny pins easier to hover.
		map.addLayer({
			id: 'news-pins-hit-layer',
			type: 'circle',
			source: 'news-pins',
			paint: {
				'circle-radius': 11,
				'circle-color': 'rgba(0, 0, 0, 0)'
			}
		});

		// Alert pulse rings (outer glow)
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

		// Town dots (circles sized by story count)
		map.addLayer({
			id: 'towns-layer',
			type: 'circle',
			source: 'towns',
			paint: {
				'circle-radius': hoverAdd(townRadius, 2.5),
				'circle-color': ['coalesce', ['get', 'color'], '#8b5cf6'],
				'circle-opacity': hoverCase(0.98, townOpacity),
				'circle-stroke-width': hoverCase(2.4, 1.5),
				'circle-stroke-color': hoverCase(INVITING_HOVER_STROKE, 'rgba(255, 255, 255, 0.5)'),
				'circle-stroke-opacity': hoverCase(0.96, townStrokeOpacity)
			}
		});

		// Town labels
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

		applyTrafficVisibility(map);

		// --- Interactions ---
		if (!interactionsBound) {
			interactionsBound = true;

			map.on('click', 'towns-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const slug = e.features?.[0]?.properties?.slug;
				if (slug && onTownClick) onTownClick(slug);
			});

			map.on('click', 'news-pins-hit-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const id = e.features?.[0]?.properties?.id;
				if (id && onPinClick) onPinClick(String(id));
			});

			map.on('click', 'landmarks-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const feature = e.features?.[0];
				const name = String(feature?.properties?.name ?? 'Landmark');
				const type = String(feature?.properties?.type ?? 'reference point');
				onFeatureClick?.({
					kind: 'landmark',
					title: name,
					subtitle: `Landmark (${type})`,
					source: 'Marin reference layer'
				});
			});

			map.on('click', 'fire-zones-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const feature = e.features?.[0];
				const name = String(feature?.properties?.name ?? 'Fire zone');
				const desc = String(feature?.properties?.desc ?? '').trim();
				onFeatureClick?.({
					kind: 'fire-zone',
					title: name,
					subtitle: 'Wildfire risk corridor',
					description: desc,
					source: 'Marin fire context layer'
				});
			});

			map.on('click', 'traffic-events-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const feature = e.features?.[0];
				const title = String(feature?.properties?.title ?? 'Traffic event');
				const severity = String(feature?.properties?.severity ?? 'UNKNOWN');
				const eventType = String(feature?.properties?.type ?? 'incident');
				onFeatureClick?.({
					kind: 'traffic-event',
					title,
					subtitle: `${eventType} · ${severity}`,
					severity,
					source: String(feature?.properties?.source ?? '511 Traffic')
				});
			});

			map.on('click', 'earthquakes-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const feature = e.features?.[0];
				const title = String(feature?.properties?.title ?? 'Earthquake');
				const magnitude = String(feature?.properties?.magnitude ?? '');
				onFeatureClick?.({
					kind: 'earthquake',
					title,
					subtitle: magnitude ? `Magnitude ${magnitude}` : 'Seismic event',
					source: 'USGS'
				});
			});

			map.on('click', 'gas-stations-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const feature = e.features?.[0];
				const name = String(feature?.properties?.name ?? 'Gas Station');
				const price = String(feature?.properties?.price ?? '');
				const address = String(feature?.properties?.address ?? '');
				onFeatureClick?.({
					kind: 'gas-station',
					title: name,
					subtitle: price ? `Regular: ${price}` : 'Price unavailable',
					description: address,
					source: 'Google Places'
				});
			});

			map.on('click', 'ev-charging-stations-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const feature = e.features?.[0];
				const name = String(feature?.properties?.name ?? 'EV Station');
				const network = String(feature?.properties?.network ?? '');
				const level = String(feature?.properties?.level ?? '');
				const connectors = String(feature?.properties?.connectors ?? '');
				const pricing = String(feature?.properties?.pricing ?? '');
				onFeatureClick?.({
					kind: 'ev-charging-station',
					title: name,
					subtitle: [network, level].filter(Boolean).join(' \u00b7 '),
					description: [connectors, pricing].filter(Boolean).join('\n'),
					source: 'NREL AFDC'
				});
			});

			map.on('click', 'coffee-shops-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const feature = e.features?.[0];
				const name = String(feature?.properties?.name ?? 'Coffee Shop');
				const price = String(feature?.properties?.price ?? '');
				const address = String(feature?.properties?.address ?? '');
				onFeatureClick?.({
					kind: 'coffee-shop',
					title: name,
					subtitle: price ? `Cappuccino: ${price}` : 'Price unavailable',
					description: address,
					source: 'Marin Monitor'
				});
			});

			map.on('click', 'fitness-studios-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const feature = e.features?.[0];
				const name = String(feature?.properties?.name ?? 'Fitness Studio');
				const price = String(feature?.properties?.price ?? '');
				const typeName = String(feature?.properties?.typeName ?? '');
				const town = String(feature?.properties?.town ?? '');
				onFeatureClick?.({
					kind: 'fitness-studio',
					title: name,
					subtitle: price ? `Drop-in: ${price}` : 'Price unavailable',
					description: [typeName, town].filter(Boolean).join(' \u00b7 '),
					source: 'Marin Monitor'
				});
			});

			map.on('click', 'fire-incidents-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const feature = e.features?.[0];
				const name = String(feature?.properties?.name ?? 'Fire');
				const acres = Number(feature?.properties?.acres ?? 0);
				const containment = Number(feature?.properties?.containment ?? 0);
				const url = String(feature?.properties?.url ?? '');
				onFeatureClick?.({
					kind: 'fire-incident',
					title: `${name} Fire`,
					subtitle: `${acres.toLocaleString()} acres · ${containment}% contained`,
					description: url ? `Details: ${url}` : undefined,
					source: String(feature?.properties?.source ?? 'CAL FIRE')
				});
			});

			map.on('click', 'airports-layer', (e: MapLayerMouseEvent) => {
				if (clickHitsVisibleStravaFeature(map, e)) return;
				const feature = e.features?.[0];
				const code = String(feature?.properties?.code ?? '');
				const name = String(feature?.properties?.name ?? 'Airport');
				const statusLabel = String(feature?.properties?.statusLabel ?? 'Unknown');
				const weatherSummary = String(feature?.properties?.weatherSummary ?? '');
				onFeatureClick?.({
					kind: 'airport',
					title: `${code} — ${name}`,
					subtitle: statusLabel,
					description: weatherSummary || undefined,
					source: 'FAA / Aviation Weather'
				});
			});

			bindInteractiveHover(map, { layerId: 'airports-layer', sourceId: 'airports' });
			bindInteractiveHover(map, { layerId: 'gas-stations-layer', sourceId: 'gas-stations' });
			bindInteractiveHover(map, {
				layerId: 'ev-charging-stations-layer',
				sourceId: 'ev-charging-stations'
			});
			bindInteractiveHover(map, { layerId: 'coffee-shops-layer', sourceId: 'coffee-shops' });
			bindInteractiveHover(map, {
				layerId: 'fitness-studios-layer',
				sourceId: 'fitness-studios'
			});
			bindInteractiveHover(map, {
				layerId: 'fire-incidents-layer',
				sourceId: 'fire-incidents'
			});
			bindInteractiveHover(map, {
				layerId: 'towns-layer',
				sourceId: 'towns',
				onFeatureChange: (feature) => {
					const slug = feature?.properties?.slug;
					if (slug && onTownHover) {
						onTownHover(String(slug));
						return;
					}
					if (onTownHover) onTownHover(null);
				}
			});
			bindInteractiveHover(map, { layerId: 'news-pins-hit-layer', sourceId: 'news-pins' });
			bindInteractiveHover(map, { layerId: 'landmarks-layer', sourceId: 'landmarks' });
			bindInteractiveHover(map, { layerId: 'fire-zones-layer', sourceId: 'fire-zones' });
			bindInteractiveHover(map, {
				layerId: 'traffic-events-layer',
				sourceId: 'traffic-events'
			});
			bindInteractiveHover(map, { layerId: 'earthquakes-layer', sourceId: 'earthquakes' });
		}
	}

	function updateData(map: MapLibreMap) {
		const items = get(allNewsItems);
		const mapState = get(mapStore);
		const currentTownFilter = get(townFilter);
		const activeItems = items.filter((item) => {
			const layer = CATEGORY_TO_LAYER[item.category];
			return Boolean(layer && mapState.activeLayers[layer]);
		});
		const storyCounts = getStoryCountsByTown(activeItems);

		// Town dots GeoJSON
		const townFeatures = MARIN_TOWNS.map((town) => {
			const stats = storyCounts.get(town.slug);
			const total = stats?.total || 0;
			const hasData = total > 0;
			const isSelected = currentTownFilter === town.slug;
			const isDimmed = currentTownFilter && !isSelected;
			const radius = isDimmed ? 2 : hasData ? Math.max(6, Math.min(16, 5 + total * 0.8)) : 3;
			const color = isDimmed
				? 'rgba(255, 255, 255, 0.1)'
				: hasData
					? getDominantColor(stats!.byLayer)
					: 'rgba(255, 255, 255, 0.2)';
			const opacity = isDimmed ? 0.08 : hasData ? 0.88 : 0.16;
			const labelOpacity = isDimmed ? 0.08 : hasData ? 0.72 : 0.28;

			return {
				type: 'Feature' as const,
				id: town.slug,
				properties: {
					name: town.name,
					slug: town.slug,
					total,
					radius,
					opacity,
					labelOpacity,
					color,
					headline: stats?.topHeadline || '',
					selected: mapState.selectedTown === town.slug
				},
				geometry: {
					type: 'Point' as const,
					coordinates: [town.lon, town.lat]
				}
			};
		});

		const townsSource = map.getSource('towns') as GeoJSONSource;
		if (townsSource) {
			townsSource.setData({ type: 'FeatureCollection', features: townFeatures });
		}

		// News pins — only show exact coordinates. Town-only items stay in town aggregates.
		const pinFeatures: GeoJSON.Feature[] = [];
		for (const item of activeItems) {
			const layer = CATEGORY_TO_LAYER[item.category];
			if (!layer) continue;
			if (typeof item.lat !== 'number' || typeof item.lon !== 'number') continue;
			if (currentTownFilter && item.townSlug !== currentTownFilter) continue;

			pinFeatures.push({
				type: 'Feature',
				id: item.id,
				properties: {
					id: item.id,
					title: item.title,
					color: LAYER_COLORS[layer] || LAYER_COLORS.news,
					layer,
					source: item.source,
					locationType: item.locationConfidence || 'exact',
					timestamp: item.timestamp
				},
				geometry: {
					type: 'Point',
					coordinates: [item.lon, item.lat]
				}
			});
		}

		const pinsSource = map.getSource('news-pins') as GeoJSONSource;
		if (pinsSource) {
			pinsSource.setData({ type: 'FeatureCollection', features: pinFeatures });
		}

		// Alert pulses — items with isAlert at their town centroid
		const alertFeatures: GeoJSON.Feature[] = [];
		for (const item of activeItems) {
			if (!item.isAlert || !item.townSlug) continue;
			if (currentTownFilter && item.townSlug !== currentTownFilter) continue;
			const town = TOWN_BY_SLUG[item.townSlug];
			if (!town) continue;

			alertFeatures.push({
				type: 'Feature',
				properties: { title: item.title, keyword: item.alertKeyword },
				geometry: {
					type: 'Point',
					coordinates: [town.lon, town.lat]
				}
			});
		}

		const alertSource = map.getSource('alert-pulses') as GeoJSONSource;
		if (alertSource) {
			alertSource.setData({ type: 'FeatureCollection', features: alertFeatures });
		}

		// Earthquakes — use lat/lon from the items if available
		const quakeFeatures: GeoJSON.Feature[] = earthquakes
			.filter((eq) => eq.lat && eq.lon)
			.map((eq) => ({
				type: 'Feature' as const,
				id: eq.id,
				properties: {
					title: eq.title,
					magnitude: parseFloat(eq.title?.match(/M ([\d.]+)/)?.[1] || '2')
				},
				geometry: {
					type: 'Point' as const,
					coordinates: [eq.lon!, eq.lat!]
				}
			}));

		const quakeSource = map.getSource('earthquakes') as GeoJSONSource;
		if (quakeSource) {
			quakeSource.setData({ type: 'FeatureCollection', features: quakeFeatures });
		}

		// Fire incidents overlay
		const fireFeatures: GeoJSON.Feature[] = fireIncidents.map((fire) => ({
			type: 'Feature' as const,
			id: fire.id,
			properties: {
				id: fire.id,
				name: fire.name,
				acres: fire.acres,
				containment: fire.containment,
				url: fire.url,
				source: fire.source
			},
			geometry: {
				type: 'Point' as const,
				coordinates: [fire.lon, fire.lat]
			}
		}));

		const fireSource = map.getSource('fire-incidents') as GeoJSONSource;
		if (fireSource) {
			fireSource.setData({ type: 'FeatureCollection', features: fireFeatures });
		}

		// Gas stations
		const gasStations = get(currentGasStations);
		const mapGasVisible = mapState.activeLayers['gas'];
		const gasFeatures: GeoJSON.Feature[] = mapGasVisible
			? gasStations
					.filter(
						(s) =>
							!currentTownFilter || findNearestTown(s.lat, s.lon) === currentTownFilter
					)
					.map((station) => {
					const regularPrice = station.fuelPrices.find(
						(fp) => fp.type === 'REGULAR_UNLEADED'
					)?.price;
					return {
						type: 'Feature' as const,
						id: station.placeId,
						properties: {
							placeId: station.placeId,
							name: station.name,
							address: station.address,
							price: regularPrice !== undefined ? `$${regularPrice.toFixed(3)}` : ''
						},
						geometry: {
							type: 'Point' as const,
							coordinates: [station.lon, station.lat]
						}
					};
				})
			: [];

		const gasSource = map.getSource('gas-stations') as GeoJSONSource;
		if (gasSource) {
			gasSource.setData({ type: 'FeatureCollection', features: gasFeatures });
		}

		if (map.getLayer('gas-stations-layer')) {
			map.setLayoutProperty(
				'gas-stations-layer',
				'visibility',
				mapGasVisible ? 'visible' : 'none'
			);
		}
		if (map.getLayer('gas-stations-label')) {
			map.setLayoutProperty(
				'gas-stations-label',
				'visibility',
				mapGasVisible ? 'visible' : 'none'
			);
		}

		// EV charging stations (filter to Marin bounds for cached data that may include out-of-county)
		const evStations = get(currentChargingStations)
			.filter((s) => isWithinMarinView(s.lon, s.lat))
			.filter((s) => !currentTownFilter || findNearestTown(s.lat, s.lon) === currentTownFilter);
		const mapEvVisible = mapState.activeLayers['ev-charging'];
		const evFeatures: GeoJSON.Feature[] = mapEvVisible
			? evStations.map((station) => {
					const level = station.chargingLevels.includes('DCFast') ? 'DC Fast' : 'Level 2';
					const connectorTypes = station.connectors.map((c) => c.type).join(', ');
					return {
						type: 'Feature' as const,
						id: station.stationId,
						properties: {
							stationId: station.stationId,
							name: station.name,
							network: station.network,
							level,
							connectors: connectorTypes,
							pricing: station.pricingInfo ?? ''
						},
						geometry: {
							type: 'Point' as const,
							coordinates: [station.lon, station.lat]
						}
					};
				})
			: [];

		const evSource = map.getSource('ev-charging-stations') as GeoJSONSource;
		if (evSource) {
			evSource.setData({ type: 'FeatureCollection', features: evFeatures });
		}

		if (map.getLayer('ev-charging-stations-layer')) {
			map.setLayoutProperty(
				'ev-charging-stations-layer',
				'visibility',
				mapEvVisible ? 'visible' : 'none'
			);
		}
		if (map.getLayer('ev-charging-stations-label')) {
			map.setLayoutProperty(
				'ev-charging-stations-label',
				'visibility',
				mapEvVisible ? 'visible' : 'none'
			);
		}

		// Coffee shops
		const coffeeShops = get(currentCoffeeShops);
		const mapCoffeeVisible = mapState.activeLayers['coffee'];
		const coffeeFeatures: GeoJSON.Feature[] = mapCoffeeVisible
			? coffeeShops
					.filter(
						(s) =>
							!currentTownFilter || findNearestTown(s.lat, s.lon) === currentTownFilter
					)
					.filter((s) => s.price !== null)
					.map((s) => ({
						type: 'Feature' as const,
						id: s.id,
						geometry: {
							type: 'Point' as const,
							coordinates: [s.lon, s.lat]
						},
						properties: {
							name: s.name,
							price: `$${s.price!.toFixed(2)}`,
							address: s.address,
							town: s.town
						}
					}))
			: [];

		const coffeeSource = map.getSource('coffee-shops') as GeoJSONSource;
		if (coffeeSource) {
			coffeeSource.setData({ type: 'FeatureCollection', features: coffeeFeatures });
		}

		if (map.getLayer('coffee-shops-layer')) {
			map.setLayoutProperty(
				'coffee-shops-layer',
				'visibility',
				mapCoffeeVisible ? 'visible' : 'none'
			);
		}
		if (map.getLayer('coffee-shops-label')) {
			map.setLayoutProperty(
				'coffee-shops-label',
				'visibility',
				mapCoffeeVisible ? 'visible' : 'none'
			);
		}

		// Fitness studios
		const fitnessStudios = get(currentFitnessStudios);
		const mapFitnessVisible = mapState.activeLayers['fitness'];
		const fitnessFeatures: GeoJSON.Feature[] = mapFitnessVisible
			? fitnessStudios
					.filter(
						(s) =>
							!currentTownFilter || findNearestTown(s.lat, s.lon) === currentTownFilter
					)
					.map((s) => ({
						type: 'Feature' as const,
						id: s.id,
						geometry: {
							type: 'Point' as const,
							coordinates: [s.lon, s.lat]
						},
						properties: {
							name: s.name,
							price: `$${s.dropInPrice}`,
							town: s.town,
							typeName: FITNESS_TYPE_LABELS[s.type],
							color: FITNESS_TYPE_COLORS[s.type]
						}
					}))
			: [];

		const fitnessSource = map.getSource('fitness-studios') as GeoJSONSource;
		if (fitnessSource) {
			fitnessSource.setData({ type: 'FeatureCollection', features: fitnessFeatures });
		}

		if (map.getLayer('fitness-studios-layer')) {
			map.setLayoutProperty(
				'fitness-studios-layer',
				'visibility',
				mapFitnessVisible ? 'visible' : 'none'
			);
		}
		if (map.getLayer('fitness-studios-label')) {
			map.setLayoutProperty(
				'fitness-studios-label',
				'visibility',
				mapFitnessVisible ? 'visible' : 'none'
			);
		}

		applyTrafficVisibility(map);
	}

	async function refreshAirportStatus(map: MapLibreMap) {
		if (!map.getSource('airports')) return;
		try {
			const data = await fetchAirportStatus();
			if (!data?.airports) return;
			const statusMap = new Map<string, AirportStatus>();
			for (const ap of data.airports) statusMap.set(ap.code, ap);

			const features: GeoJSON.Feature[] = AIRPORT_PINS.map((pin) => {
				const info = statusMap.get(pin.code);
				const status = info?.status ?? 'on-time';
				const color = AIRPORT_STATUS_COLORS[status] ?? '#6b7280';

				const statusLabel =
					status === 'on-time'
						? 'On Time'
						: status === 'delays'
							? 'Delays'
							: status === 'ground-delay'
								? 'Ground Delay'
								: status === 'ground-stop'
									? 'Ground Stop'
									: status === 'closed'
										? 'Closed'
										: status;

				let weatherSummary = '';
				if (info?.weather) {
					const w = info.weather;
					const parts: string[] = [w.fltCat];
					parts.push(`${w.visibility} vis`);
					if (w.ceiling !== null) parts.push(`Ceiling ${w.ceiling} ft`);
					parts.push(`${w.windDir}° ${w.windSpeed}${w.windGust ? `g${w.windGust}` : ''} kt`);
					if (w.fogRisk) parts.push('Fog Risk');
					weatherSummary = parts.join(' · ');
				}

				return {
					type: 'Feature' as const,
					id: pin.code,
					properties: { code: pin.code, name: pin.name, color, statusLabel, weatherSummary },
					geometry: {
						type: 'Point' as const,
						coordinates: [pin.lon, pin.lat]
					}
				};
			});

			const source = map.getSource('airports') as GeoJSONSource;
			source.setData({ type: 'FeatureCollection', features });
		} catch {
			// Silent fail: airport pins are additive
		}
	}

	let unsubscribeNews: (() => void) | null = null;
	let unsubscribeMap: (() => void) | null = null;
	let unsubscribeGas: (() => void) | null = null;
	let unsubscribeEv: (() => void) | null = null;
	let unsubscribeCoffee: (() => void) | null = null;
	let unsubscribeFitness: (() => void) | null = null;
	let updateDataTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		const unsubReady = mapReady.subscribe((ready) => {
			if (!ready) return;
			const map = getMap();
			if (!map) return;

			setupSources(map);
			updateData(map);
			void refreshTrafficEvents(map);
			void refreshAirportStatus(map);

			removeStyleLoadListener?.();
			const handleStyleLoad = () => {
				setupSources(map);
				updateData(map);
				void refreshTrafficEvents(map);
				void refreshAirportStatus(map);
			};
			map.on('style.load', handleStyleLoad);
			removeStyleLoadListener = () => map.off('style.load', handleStyleLoad);

			if (!trafficRefreshTimer) {
				trafficRefreshTimer = setInterval(() => {
					const m = getMap();
					if (!m || !m.getSource('traffic-events')) return;
					void refreshTrafficEvents(m);
				}, TRAFFIC_REFRESH_MS);
			}

			// Re-render when news or map state changes (debounced to avoid rapid redraws)
			if (!unsubscribeNews) {
				unsubscribeNews = allNewsItems.subscribe(() => {
					if (updateDataTimer) clearTimeout(updateDataTimer);
					updateDataTimer = setTimeout(() => {
						const m = getMap();
						if (!m || !m.getSource('towns')) return;
						updateData(m);
					}, 100);
				});
			}

			if (!unsubscribeMap) {
				unsubscribeMap = mapStore.subscribe(() => {
					if (updateDataTimer) clearTimeout(updateDataTimer);
					updateDataTimer = setTimeout(() => {
						const m = getMap();
						if (!m || !m.getSource('towns')) return;
						updateData(m);
					}, 100);
				});
			}

			if (!unsubscribeGas) {
				unsubscribeGas = currentGasStations.subscribe(() => {
					if (updateDataTimer) clearTimeout(updateDataTimer);
					updateDataTimer = setTimeout(() => {
						const m = getMap();
						if (!m || !m.getSource('gas-stations')) return;
						updateData(m);
					}, 100);
				});
			}

			if (!unsubscribeEv) {
				unsubscribeEv = currentChargingStations.subscribe(() => {
					if (updateDataTimer) clearTimeout(updateDataTimer);
					updateDataTimer = setTimeout(() => {
						const m = getMap();
						if (!m || !m.getSource('ev-charging-stations')) return;
						updateData(m);
					}, 100);
				});
			}

			if (!unsubscribeCoffee) {
				unsubscribeCoffee = currentCoffeeShops.subscribe(() => {
					if (updateDataTimer) clearTimeout(updateDataTimer);
					updateDataTimer = setTimeout(() => {
						const m = getMap();
						if (!m || !m.getSource('coffee-shops')) return;
						updateData(m);
					}, 100);
				});
			}

			if (!unsubscribeFitness) {
				unsubscribeFitness = currentFitnessStudios.subscribe(() => {
					if (updateDataTimer) clearTimeout(updateDataTimer);
					updateDataTimer = setTimeout(() => {
						const m = getMap();
						if (!m || !m.getSource('fitness-studios')) return;
						updateData(m);
					}, 100);
				});
			}
		});

		return () => {
			unsubReady();
		};
	});

	// Sync map view when town filter changes (from header picker or other sources)
	onMount(() => {
		// Load boundary data once
		fetch('/data/marin-boundaries.geojson')
			.then((r) => r.json())
			.then((d: GeoJSON.FeatureCollection) => {
				boundaryData = d;
			})
			.catch(() => {
				/* boundary data is optional enhancement */
			});

		unsubscribeTownFilter = townFilter.subscribe((slug) => {
			// Skip initial subscription call
			if (lastTownSlug === undefined) {
				lastTownSlug = slug;
				return;
			}
			if (slug === lastTownSlug) return;
			lastTownSlug = slug;

			// Keep mapStore in sync for backward compat (inspector, town dots)
			mapStore.selectTown(slug);

			const map = getMap();
			if (!map) return;

			// Update boundary highlight
			const boundarySource = map.getSource('town-boundary') as GeoJSONSource;
			if (boundarySource) {
				if (slug && boundaryData) {
					const matchingFeatures = boundaryData.features.filter(
						(f) => f.properties?.slug === slug
					);
					boundarySource.setData({
						type: 'FeatureCollection',
						features: matchingFeatures
					});
				} else {
					boundarySource.setData({ type: 'FeatureCollection', features: [] });
				}
			}

			// Re-filter map features
			if (map.getSource('towns')) {
				updateData(map);
			}

			// Re-filter traffic events with updated town filter
			const trafficSource = map.getSource('traffic-events') as GeoJSONSource;
			if (trafficSource && rawTrafficFeatures.length > 0) {
				trafficSource.setData({
					type: 'FeatureCollection',
					features: filterTrafficByTown(rawTrafficFeatures)
				});
			}

			// Fly to town or fit county bounds
			if (slug) {
				const town = TOWN_BY_SLUG[slug];
				if (town) {
					map.flyTo({ center: [town.lon, town.lat], zoom: 13, duration: 1200 });
				}
			} else {
				map.fitBounds(
					[
						[MARIN_BOUNDS.west, MARIN_BOUNDS.south],
						[MARIN_BOUNDS.east, MARIN_BOUNDS.north]
					],
					{ padding: 20, duration: 1200 }
				);
			}
		});
	});

	onDestroy(() => {
		const map = getMap();
		if (map) {
			hoveredFeatureIds.clear();
			map.getCanvas().style.cursor = '';
		}
		removeStyleLoadListener?.();
		unsubscribeNews?.();
		unsubscribeMap?.();
		unsubscribeGas?.();
		unsubscribeEv?.();
		unsubscribeCoffee?.();
		unsubscribeFitness?.();
		unsubscribeTownFilter?.();
		if (trafficRefreshTimer) {
			clearInterval(trafficRefreshTimer);
			trafficRefreshTimer = null;
		}
	});
</script>
