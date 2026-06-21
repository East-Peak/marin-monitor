<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type { Map as MapLibreMap, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
	import { allNewsItems, threeOneOneNews } from '$lib/stores/news';
	import { mapStore, CATEGORY_TO_LAYER } from '$lib/stores/map';
	import { townFilter } from '$lib/stores/town-filter';
	import { TOWN_BY_SLUG } from '$lib/config/towns';
	import { currentGasStations } from '$lib/stores/gas-prices';
	import { currentCoffeeShops } from '$lib/stores/coffee';
	import { currentFitnessStudios } from '$lib/stores/fitness';
	import { currentChargingStations } from '$lib/stores/ev-charging';
	import { MARIN_TOWNS, LAYER_COLORS, MARIN_BOUNDS } from '$lib/config';
	import {
		TYPE_COLORS as FITNESS_TYPE_COLORS,
		TYPE_LABELS as FITNESS_TYPE_LABELS
	} from '$lib/config/fitness';
	import { AIRPORT_PINS, AIRPORT_STATUS_COLORS } from '$lib/config/map';
	import { fetchAirportStatus } from '$lib/api/marin/airport-status';
	import type { AirportStatus } from '$lib/types/airport';
	import { findNearestTown } from '$lib/geo/proximity';
	// Coffee formatting now handled inside map-data.ts feature builders
	import type { NewsItem, MapFeatureInspectorData } from '$lib/types';

	// Extracted modules
	import {
		buildTrafficEventFeatures,
		filterTrafficByTown,
		getStoryCountsByTown,
		isWithinMarinView,
		buildTownFeatures,
		buildNewsPinFeatures,
		buildAlertPulseFeatures,
		buildEarthquakeFeatures,
		buildFireIncidentFeatures,
		buildGasStationFeatures,
		buildEvStationFeatures,
		buildCoffeeShopFeatures,
		buildFitnessStudioFeatures,
		build311ReportFeatures,
		buildAirportFeatures
	} from './map-data';
	import { setupSources } from './map-layers';
	import {
		hoveredFeatureIds,
		bindInteractiveHover,
		bindLayerGroupClick,
		clickHitsVisibleStravaFeature
	} from './map-interactions';

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

	// -------------------------------------------------------------------
	// Traffic data fetching
	// -------------------------------------------------------------------

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
				features: filterTrafficByTown(rawTrafficFeatures, get(townFilter))
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
		if (map.getLayer('traffic-events-hit-layer')) {
			map.setLayoutProperty(
				'traffic-events-hit-layer',
				'visibility',
				showTrafficEvents ? 'visible' : 'none'
			);
		}
	}

	// -------------------------------------------------------------------
	// Interaction bindings  (called once from setupAndBind)
	// -------------------------------------------------------------------

	function bindInteractions(map: MapLibreMap) {
		if (interactionsBound) return;
		interactionsBound = true;

		const townTriggerLayers = ['towns-layer', 'towns-label'];
		const newsTriggerLayers = ['news-pins-hit-layer', 'news-pins-layer'];
		const landmarkTriggerLayers = ['landmarks-layer', 'landmarks-hit-layer', 'landmarks-label'];
		const fireZoneTriggerLayers = ['fire-zones-layer'];
		const trafficTriggerLayers = ['traffic-events-layer', 'traffic-events-hit-layer'];
		const earthquakeTriggerLayers = ['earthquakes-layer', 'earthquakes-ring-layer'];
		const gasTriggerLayers = ['gas-stations-layer', 'gas-stations-hit-layer', 'gas-stations-label'];
		const evTriggerLayers = [
			'ev-charging-stations-layer',
			'ev-charging-stations-hit-layer',
			'ev-charging-stations-label'
		];
		const coffeeTriggerLayers = [
			'coffee-shops-layer',
			'coffee-shops-hit-layer',
			'coffee-shops-label'
		];
		const fitnessTriggerLayers = [
			'fitness-studios-layer',
			'fitness-studios-hit-layer',
			'fitness-studios-label'
		];
		const threeOneOneTriggerLayers = ['311-reports-layer', '311-reports-hit-layer'];
		const fireIncidentTriggerLayers = ['fire-incidents-layer', 'fire-incidents-label'];
		const airportTriggerLayers = ['airports-layer', 'airports-hit-layer', 'airports-label'];

		// --- Click handlers ---

		bindLayerGroupClick(map, townTriggerLayers, (e: MapLayerMouseEvent) => {
			if (clickHitsVisibleStravaFeature(map, e)) return;
			const slug = e.features?.[0]?.properties?.slug;
			if (slug && onTownClick) onTownClick(slug);
		});

		bindLayerGroupClick(map, newsTriggerLayers, (e: MapLayerMouseEvent) => {
			if (clickHitsVisibleStravaFeature(map, e)) return;
			const id = e.features?.[0]?.properties?.id;
			if (id && onPinClick) onPinClick(String(id));
		});

		bindLayerGroupClick(map, landmarkTriggerLayers, (e: MapLayerMouseEvent) => {
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

		bindLayerGroupClick(map, fireZoneTriggerLayers, (e: MapLayerMouseEvent) => {
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

		bindLayerGroupClick(map, trafficTriggerLayers, (e: MapLayerMouseEvent) => {
			if (clickHitsVisibleStravaFeature(map, e)) return;
			const feature = e.features?.[0];
			const title = String(feature?.properties?.title ?? 'Traffic event');
			const severity = String(feature?.properties?.severity ?? 'UNKNOWN');
			const eventType = String(feature?.properties?.type ?? 'incident');
			onFeatureClick?.({
				kind: 'traffic-event',
				title,
				subtitle: `${eventType} \u00b7 ${severity}`,
				severity,
				source: String(feature?.properties?.source ?? '511 Traffic')
			});
		});

		bindLayerGroupClick(map, earthquakeTriggerLayers, (e: MapLayerMouseEvent) => {
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

		bindLayerGroupClick(map, gasTriggerLayers, (e: MapLayerMouseEvent) => {
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

		bindLayerGroupClick(map, evTriggerLayers, (e: MapLayerMouseEvent) => {
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

		bindLayerGroupClick(map, coffeeTriggerLayers, (e: MapLayerMouseEvent) => {
			if (clickHitsVisibleStravaFeature(map, e)) return;
			const feature = e.features?.[0];
			const name = String(feature?.properties?.name ?? 'Coffee Shop');
			const price = String(feature?.properties?.price ?? '');
			const headlineLabel = String(feature?.properties?.headlineLabel ?? '');
			const address = String(feature?.properties?.address ?? '');
			const menuSummary = String(feature?.properties?.menuSummary ?? '');
			const statusLabel = String(feature?.properties?.statusLabel ?? 'Tracking soon');
			onFeatureClick?.({
				kind: 'coffee-shop',
				title: name,
				subtitle:
					price && headlineLabel ? `${headlineLabel}: ${price}` : price ? price : statusLabel,
				description: [address, menuSummary].filter(Boolean).join('\n'),
				source: 'Marin Coffee Index'
			});
		});

		bindLayerGroupClick(map, fitnessTriggerLayers, (e: MapLayerMouseEvent) => {
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

		bindLayerGroupClick(map, threeOneOneTriggerLayers, (e: MapLayerMouseEvent) => {
			const feature = e.features?.[0];
			if (!feature?.properties) return;
			const props = feature.properties;
			onFeatureClick?.({
				kind: '311-report',
				title: String(props.category ?? '311 Report'),
				subtitle: String(props.address ?? ''),
				description: String(props.description ?? ''),
				source: 'Fix It Marin',
				imageUrl: props.imageUrl ? String(props.imageUrl) : undefined
			});
		});

		bindLayerGroupClick(map, fireIncidentTriggerLayers, (e: MapLayerMouseEvent) => {
			if (clickHitsVisibleStravaFeature(map, e)) return;
			const feature = e.features?.[0];
			const name = String(feature?.properties?.name ?? 'Fire');
			const acres = Number(feature?.properties?.acres ?? 0);
			const containment = Number(feature?.properties?.containment ?? 0);
			const url = String(feature?.properties?.url ?? '');
			onFeatureClick?.({
				kind: 'fire-incident',
				title: `${name} Fire`,
				subtitle: `${acres.toLocaleString()} acres \u00b7 ${containment}% contained`,
				description: url ? `Details: ${url}` : undefined,
				source: String(feature?.properties?.source ?? 'CAL FIRE')
			});
		});

		bindLayerGroupClick(map, airportTriggerLayers, (e: MapLayerMouseEvent) => {
			if (clickHitsVisibleStravaFeature(map, e)) return;
			const feature = e.features?.[0];
			const code = String(feature?.properties?.code ?? '');
			const name = String(feature?.properties?.name ?? 'Airport');
			const statusLabel = String(feature?.properties?.statusLabel ?? 'Unknown');
			const weatherSummary = String(feature?.properties?.weatherSummary ?? '');
			onFeatureClick?.({
				kind: 'airport',
				title: `${code} \u2014 ${name}`,
				subtitle: statusLabel,
				description: weatherSummary || undefined,
				source: 'FAA / Aviation Weather'
			});
		});

		// --- Hover bindings ---

		bindInteractiveHover(map, {
			triggerLayerIds: airportTriggerLayers,
			sourceId: 'airports'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: gasTriggerLayers,
			sourceId: 'gas-stations'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: evTriggerLayers,
			sourceId: 'ev-charging-stations'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: coffeeTriggerLayers,
			sourceId: 'coffee-shops'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: fitnessTriggerLayers,
			sourceId: 'fitness-studios'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: threeOneOneTriggerLayers,
			sourceId: '311-reports'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: fireIncidentTriggerLayers,
			sourceId: 'fire-incidents'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: townTriggerLayers,
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
		bindInteractiveHover(map, {
			triggerLayerIds: newsTriggerLayers,
			sourceId: 'news-pins'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: landmarkTriggerLayers,
			sourceId: 'landmarks'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: fireZoneTriggerLayers,
			sourceId: 'fire-zones'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: trafficTriggerLayers,
			sourceId: 'traffic-events'
		});
		bindInteractiveHover(map, {
			triggerLayerIds: earthquakeTriggerLayers,
			sourceId: 'earthquakes'
		});
	}

	// -------------------------------------------------------------------
	// Source setup + interaction binding (single entry point)
	// -------------------------------------------------------------------

	function setupAndBind(map: MapLibreMap) {
		setupSources(map);
		bindInteractions(map);
		applyTrafficVisibility(map);
	}

	// -------------------------------------------------------------------
	// Data synchronization  (pushes store state into GeoJSON sources)
	// -------------------------------------------------------------------

	function updateData(map: MapLibreMap) {
		const items = get(allNewsItems);
		const mapState = get(mapStore);
		const currentTownFilter = get(townFilter);
		const activeItems = items.filter((item) => {
			const layer = CATEGORY_TO_LAYER[item.category];
			return Boolean(layer && mapState.activeLayers[layer]);
		});
		const storyCounts = getStoryCountsByTown(activeItems, CATEGORY_TO_LAYER);

		// Town dots GeoJSON
		const townFeatures = buildTownFeatures(
			MARIN_TOWNS,
			storyCounts,
			currentTownFilter,
			mapState.selectedTown,
			LAYER_COLORS
		);

		const townsSource = map.getSource('towns') as GeoJSONSource;
		if (townsSource) {
			townsSource.setData({ type: 'FeatureCollection', features: townFeatures });
		}

		// News pins — only show exact coordinates. Town-only items stay in town aggregates.
		const pinFeatures = buildNewsPinFeatures(
			activeItems,
			CATEGORY_TO_LAYER,
			currentTownFilter,
			LAYER_COLORS
		);

		const pinsSource = map.getSource('news-pins') as GeoJSONSource;
		if (pinsSource) {
			pinsSource.setData({ type: 'FeatureCollection', features: pinFeatures });
		}

		// Alert pulses — items with isAlert at their town centroid
		const alertFeatures = buildAlertPulseFeatures(activeItems, currentTownFilter, TOWN_BY_SLUG);

		const alertSource = map.getSource('alert-pulses') as GeoJSONSource;
		if (alertSource) {
			alertSource.setData({ type: 'FeatureCollection', features: alertFeatures });
		}

		// Earthquakes — use lat/lon from the items if available
		const quakeFeatures = buildEarthquakeFeatures(earthquakes);

		const quakeSource = map.getSource('earthquakes') as GeoJSONSource;
		if (quakeSource) {
			quakeSource.setData({ type: 'FeatureCollection', features: quakeFeatures });
		}

		// Fire incidents overlay
		const fireFeatures = buildFireIncidentFeatures(fireIncidents);

		const fireSource = map.getSource('fire-incidents') as GeoJSONSource;
		if (fireSource) {
			fireSource.setData({ type: 'FeatureCollection', features: fireFeatures });
		}

		// Gas stations
		const gasStations = get(currentGasStations);
		const mapGasVisible = mapState.activeLayers['gas'];
		const gasFeatures = mapGasVisible
			? buildGasStationFeatures(gasStations, currentTownFilter)
			: [];

		const gasSource = map.getSource('gas-stations') as GeoJSONSource;
		if (gasSource) {
			gasSource.setData({ type: 'FeatureCollection', features: gasFeatures });
		}

		if (map.getLayer('gas-stations-layer')) {
			map.setLayoutProperty('gas-stations-layer', 'visibility', mapGasVisible ? 'visible' : 'none');
		}
		if (map.getLayer('gas-stations-hit-layer')) {
			map.setLayoutProperty(
				'gas-stations-hit-layer',
				'visibility',
				mapGasVisible ? 'visible' : 'none'
			);
		}
		if (map.getLayer('gas-stations-label')) {
			map.setLayoutProperty('gas-stations-label', 'visibility', mapGasVisible ? 'visible' : 'none');
		}

		// EV charging stations (filter to Marin bounds for cached data that may include out-of-county)
		const evStations = get(currentChargingStations)
			.filter((s) => isWithinMarinView(s.lon, s.lat))
			.filter((s) => !currentTownFilter || findNearestTown(s.lat, s.lon) === currentTownFilter);
		const mapEvVisible = mapState.activeLayers['ev-charging'];
		const evFeatures = mapEvVisible ? buildEvStationFeatures(evStations) : [];

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
		if (map.getLayer('ev-charging-stations-hit-layer')) {
			map.setLayoutProperty(
				'ev-charging-stations-hit-layer',
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
		const coffeeFeatures = mapCoffeeVisible
			? buildCoffeeShopFeatures(coffeeShops, currentTownFilter)
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
		if (map.getLayer('coffee-shops-hit-layer')) {
			map.setLayoutProperty(
				'coffee-shops-hit-layer',
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
		const fitnessFeatures = mapFitnessVisible
			? buildFitnessStudioFeatures(
					fitnessStudios,
					currentTownFilter,
					FITNESS_TYPE_LABELS,
					FITNESS_TYPE_COLORS
				)
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
		if (map.getLayer('fitness-studios-hit-layer')) {
			map.setLayoutProperty(
				'fitness-studios-hit-layer',
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

		// 311 reports (SeeClickFix / Fix It Marin)
		const threeOneOneItems = get(threeOneOneNews).items ?? [];
		const map311Visible = mapState.activeLayers['311'];
		const threeOneOneFeatures = map311Visible
			? build311ReportFeatures(threeOneOneItems, currentTownFilter)
			: [];

		const threeOneOneSource = map.getSource('311-reports') as GeoJSONSource;
		if (threeOneOneSource) {
			threeOneOneSource.setData({ type: 'FeatureCollection', features: threeOneOneFeatures });
		}

		for (const layerId of ['311-reports-layer', '311-reports-hit-layer', '311-reports-label']) {
			if (map.getLayer(layerId)) {
				map.setLayoutProperty(layerId, 'visibility', map311Visible ? 'visible' : 'none');
			}
		}

		applyTrafficVisibility(map);
	}

	// -------------------------------------------------------------------
	// Airport status refresh
	// -------------------------------------------------------------------

	async function refreshAirportStatus(map: MapLibreMap) {
		if (!map.getSource('airports')) return;
		try {
			const data = await fetchAirportStatus();
			if (!data?.airports) return;
			const statusMap = new Map<string, AirportStatus>();
			for (const ap of data.airports) statusMap.set(ap.code, ap);

			const features = buildAirportFeatures(AIRPORT_PINS, statusMap, AIRPORT_STATUS_COLORS);
			const source = map.getSource('airports') as GeoJSONSource;
			source.setData({ type: 'FeatureCollection', features });
		} catch {
			// Silent fail: airport pins are additive
		}
	}

	// -------------------------------------------------------------------
	// Lifecycle & store subscriptions
	// -------------------------------------------------------------------

	let unsubscribeNews: (() => void) | null = null;
	let unsubscribeMap: (() => void) | null = null;
	let unsubscribeGas: (() => void) | null = null;
	let unsubscribeEv: (() => void) | null = null;
	let unsubscribeCoffee: (() => void) | null = null;
	let unsubscribeFitness: (() => void) | null = null;
	let unsubscribe311: (() => void) | null = null;
	let updateDataTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		const unsubReady = mapReady.subscribe((ready) => {
			if (!ready) return;
			const map = getMap();
			if (!map) return;

			setupAndBind(map);
			updateData(map);
			void refreshTrafficEvents(map);
			void refreshAirportStatus(map);

			removeStyleLoadListener?.();
			const handleStyleLoad = () => {
				setupAndBind(map);
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

			if (!unsubscribe311) {
				unsubscribe311 = threeOneOneNews.subscribe(() => {
					if (updateDataTimer) clearTimeout(updateDataTimer);
					updateDataTimer = setTimeout(() => {
						const m = getMap();
						if (!m || !m.getSource('311-reports')) return;
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
					const matchingFeatures = boundaryData.features.filter((f) => f.properties?.slug === slug);
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
					features: filterTrafficByTown(rawTrafficFeatures, slug)
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
		unsubscribe311?.();
		unsubscribe311 = null;
		unsubscribeTownFilter?.();
		if (trafficRefreshTimer) {
			clearInterval(trafficRefreshTimer);
			trafficRefreshTimer = null;
		}
	});
</script>
