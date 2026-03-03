<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type { Map as MapLibreMap, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
	import { allNewsItems } from '$lib/stores/news';
	import { mapStore, CATEGORY_TO_LAYER } from '$lib/stores/map';
	import { currentGasStations } from '$lib/stores/gas-prices';
	import { currentChargingStations } from '$lib/stores/ev-charging';
	import { MARIN_TOWNS, TOWN_BY_SLUG, LAYER_COLORS, MARIN_BOUNDS } from '$lib/config';
	import { FIRE_ZONES, LANDMARKS } from '$lib/config/map';
	import { MAPBOX_TOKEN } from '$lib/config/api';
	import type { NewsItem, MapLayer } from '$lib/types';

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
		onFeatureClick?: (feature: {
			kind: 'landmark' | 'fire-zone' | 'traffic-event' | 'earthquake' | 'fire-incident' | 'gas-station' | 'ev-charging-station';
			title: string;
			subtitle?: string;
			description?: string;
			severity?: string;
			source?: string;
		}) => void;
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

	const TRAFFIC_REFRESH_MS = 3 * 60 * 1000;
	const TRAFFIC_BOUNDS_BUFFER = 0.12;
	const mapboxToken = MAPBOX_TOKEN.trim();

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

			features.push({
				type: 'Feature',
				properties: {
					id: String(event.id ?? event.Id ?? ''),
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
			const features = buildTrafficEventFeatures(events);
			const source = map.getSource('traffic-events') as GeoJSONSource;
			source.setData({
				type: 'FeatureCollection',
				features
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
					properties: { name: lm.name, type: lm.type },
					geometry: {
						type: 'Point' as const,
						coordinates: [lm.lon, lm.lat]
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

		// --- Layers ---

		// Fire zones (semi-transparent red circles)
		map.addLayer({
			id: 'fire-zones-layer',
			type: 'circle',
			source: 'fire-zones',
			paint: {
				'circle-radius': 20,
				'circle-color': 'rgba(239, 68, 68, 0.12)',
				'circle-stroke-width': 1,
				'circle-stroke-color': 'rgba(239, 68, 68, 0.3)'
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
				'circle-radius': [
					'case',
					['==', ['get', 'severity'], 'SEVERE'],
					8,
					['==', ['get', 'severity'], 'MAJOR'],
					6,
					5
				],
				'circle-color': [
					'case',
					['==', ['get', 'severity'], 'SEVERE'],
					'#dc2626',
					['==', ['get', 'severity'], 'MAJOR'],
					'#f97316',
					'#f59e0b'
				],
				'circle-opacity': 0.7,
				'circle-stroke-width': 1,
				'circle-stroke-color': 'rgba(10, 10, 10, 0.8)'
			}
		});

		// Landmarks (subtle small markers)
		map.addLayer({
			id: 'landmarks-layer',
			type: 'circle',
			source: 'landmarks',
			paint: {
				'circle-radius': 3,
				'circle-color': 'rgba(255, 255, 255, 0.2)',
				'circle-stroke-width': 0.5,
				'circle-stroke-color': 'rgba(255, 255, 255, 0.3)'
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

		// Earthquake dots (red, sized by magnitude)
		map.addLayer({
			id: 'earthquakes-layer',
			type: 'circle',
			source: 'earthquakes',
			paint: {
				'circle-radius': ['*', ['get', 'magnitude'], 4],
				'circle-color': 'rgba(255, 68, 68, 0.6)',
				'circle-stroke-width': 1,
				'circle-stroke-color': '#ef4444'
			}
		});

		// Active fire incidents (pulsing orange/red circles, sized by acreage)
		map.addLayer({
			id: 'fire-incidents-layer',
			type: 'circle',
			source: 'fire-incidents',
			paint: {
				'circle-radius': [
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
				],
				'circle-color': 'rgba(255, 120, 0, 0.7)',
				'circle-stroke-width': 2,
				'circle-stroke-color': '#ef4444'
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
				'circle-radius': 5,
				'circle-color': '#22d3ee',
				'circle-opacity': 0.8,
				'circle-stroke-width': 1,
				'circle-stroke-color': 'rgba(10, 10, 10, 0.8)'
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
				'circle-radius': 5,
				'circle-color': '#a855f7',
				'circle-opacity': 0.8,
				'circle-stroke-width': 1,
				'circle-stroke-color': 'rgba(10, 10, 10, 0.8)'
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

		// News pins (small dots per item)
		map.addLayer({
			id: 'news-pins-layer',
			type: 'circle',
			source: 'news-pins',
			paint: {
				'circle-radius': 3,
				'circle-color': ['get', 'color'],
				'circle-opacity': 0.7,
				'circle-stroke-width': 0.5,
				'circle-stroke-color': 'rgba(255, 255, 255, 0.3)'
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
				'circle-radius': ['coalesce', ['get', 'radius'], 3],
				'circle-color': ['coalesce', ['get', 'color'], '#8b5cf6'],
				'circle-opacity': ['coalesce', ['get', 'opacity'], 0.18],
				'circle-stroke-width': 1.5,
				'circle-stroke-color': 'rgba(255, 255, 255, 0.5)',
				'circle-stroke-opacity': ['case', ['>', ['coalesce', ['get', 'total'], 0], 0], 0.5, 0.2]
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
				'text-color': 'rgba(232, 232, 232, 0.7)',
				'text-halo-color': 'rgba(10, 10, 10, 0.9)',
				'text-halo-width': 1,
				'text-opacity': ['coalesce', ['get', 'labelOpacity'], 0.25]
			}
		});

		applyTrafficVisibility(map);

		// --- Interactions ---
		if (!interactionsBound) {
			interactionsBound = true;

			map.on('click', 'towns-layer', (e: MapLayerMouseEvent) => {
				const slug = e.features?.[0]?.properties?.slug;
				if (slug && onTownClick) onTownClick(slug);
			});

			map.on('click', 'news-pins-hit-layer', (e: MapLayerMouseEvent) => {
				const id = e.features?.[0]?.properties?.id;
				if (id && onPinClick) onPinClick(String(id));
			});

			map.on('click', 'landmarks-layer', (e: MapLayerMouseEvent) => {
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

			map.on('click', 'fire-incidents-layer', (e: MapLayerMouseEvent) => {
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

			map.on('mouseenter', 'gas-stations-layer', () => {
				map.getCanvas().style.cursor = 'pointer';
			});

			map.on('mouseleave', 'gas-stations-layer', () => {
				map.getCanvas().style.cursor = '';
			});

			map.on('mouseenter', 'ev-charging-stations-layer', () => {
				map.getCanvas().style.cursor = 'pointer';
			});

			map.on('mouseleave', 'ev-charging-stations-layer', () => {
				map.getCanvas().style.cursor = '';
			});

			map.on('mouseenter', 'fire-incidents-layer', () => {
				map.getCanvas().style.cursor = 'pointer';
			});

			map.on('mouseleave', 'fire-incidents-layer', () => {
				map.getCanvas().style.cursor = '';
			});

			map.on('mouseenter', 'towns-layer', (e: MapLayerMouseEvent) => {
				map.getCanvas().style.cursor = 'pointer';
				const slug = e.features?.[0]?.properties?.slug;
				if (slug && onTownHover) onTownHover(slug);
			});

			map.on('mouseleave', 'towns-layer', () => {
				map.getCanvas().style.cursor = '';
				if (onTownHover) onTownHover(null);
			});

			map.on('mouseenter', 'news-pins-hit-layer', () => {
				map.getCanvas().style.cursor = 'pointer';
			});

			map.on('mouseleave', 'news-pins-hit-layer', () => {
				map.getCanvas().style.cursor = '';
			});

			map.on('mouseenter', 'landmarks-layer', () => {
				map.getCanvas().style.cursor = 'pointer';
			});

			map.on('mouseleave', 'landmarks-layer', () => {
				map.getCanvas().style.cursor = '';
			});

			map.on('mouseenter', 'fire-zones-layer', () => {
				map.getCanvas().style.cursor = 'pointer';
			});

			map.on('mouseleave', 'fire-zones-layer', () => {
				map.getCanvas().style.cursor = '';
			});

			map.on('mouseenter', 'traffic-events-layer', () => {
				map.getCanvas().style.cursor = 'pointer';
			});

			map.on('mouseleave', 'traffic-events-layer', () => {
				map.getCanvas().style.cursor = '';
			});

			map.on('mouseenter', 'earthquakes-layer', () => {
				map.getCanvas().style.cursor = 'pointer';
			});

			map.on('mouseleave', 'earthquakes-layer', () => {
				map.getCanvas().style.cursor = '';
			});
		}
	}

	function updateData(map: MapLibreMap) {
		const items = get(allNewsItems);
		const mapState = get(mapStore);
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
			const radius = hasData ? Math.max(6, Math.min(16, 5 + total * 0.8)) : 3;
			const color = hasData ? getDominantColor(stats!.byLayer) : 'rgba(255, 255, 255, 0.2)';
			const opacity = hasData ? 0.88 : 0.16;
			const labelOpacity = hasData ? 0.72 : 0.28;

			return {
				type: 'Feature' as const,
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

			pinFeatures.push({
				type: 'Feature',
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
			? gasStations.map((station) => {
					const regularPrice = station.fuelPrices.find(
						(fp) => fp.type === 'REGULAR_UNLEADED'
					)?.price;
					return {
						type: 'Feature' as const,
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

		// EV charging stations
		const evStations = get(currentChargingStations);
		const mapEvVisible = mapState.activeLayers['ev-charging'];
		const evFeatures: GeoJSON.Feature[] = mapEvVisible
			? evStations.map((station) => {
					const level = station.chargingLevels.includes('DCFast') ? 'DC Fast' : 'Level 2';
					const connectorTypes = station.connectors.map((c) => c.type).join(', ');
					return {
						type: 'Feature' as const,
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

		applyTrafficVisibility(map);
	}

	let unsubscribeNews: (() => void) | null = null;
	let unsubscribeMap: (() => void) | null = null;
	let unsubscribeGas: (() => void) | null = null;
	let unsubscribeEv: (() => void) | null = null;
	let updateDataTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		const unsubReady = mapReady.subscribe((ready) => {
			if (!ready) return;
			const map = getMap();
			if (!map) return;

			setupSources(map);
			updateData(map);
			void refreshTrafficEvents(map);

			removeStyleLoadListener?.();
			const handleStyleLoad = () => {
				setupSources(map);
				updateData(map);
				void refreshTrafficEvents(map);
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
					const m = getMap();
					if (!m || !m.getSource('towns')) return;
					updateData(m);
				});
			}

			if (!unsubscribeGas) {
				unsubscribeGas = currentGasStations.subscribe(() => {
					const m = getMap();
					if (!m || !m.getSource('gas-stations')) return;
					updateData(m);
				});
			}

			if (!unsubscribeEv) {
				unsubscribeEv = currentChargingStations.subscribe(() => {
					const m = getMap();
					if (!m || !m.getSource('ev-charging-stations')) return;
					updateData(m);
				});
			}
		});

		return () => {
			unsubReady();
		};
	});

	onDestroy(() => {
		removeStyleLoadListener?.();
		unsubscribeNews?.();
		unsubscribeMap?.();
		unsubscribeGas?.();
		unsubscribeEv?.();
		if (trafficRefreshTimer) {
			clearInterval(trafficRefreshTimer);
			trafficRefreshTimer = null;
		}
	});
</script>
