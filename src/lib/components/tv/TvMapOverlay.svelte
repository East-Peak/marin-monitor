<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
	import { TYPE_COLORS as FITNESS_TYPE_COLORS, TYPE_LABELS as FITNESS_TYPE_LABELS } from '$lib/config/fitness';
	import type { NewsItem } from '$lib/types';
	import type { GasStation } from '$lib/types/gas';
	import type { CoffeeShop } from '$lib/types/coffee';
	import type { FitnessStudio } from '$lib/types/fitness';

	interface Props {
		viewId: string;
		threeOneOneItems?: NewsItem[];
		coffeeShops?: CoffeeShop[];
		gasStations?: GasStation[];
		fitnessStudios?: FitnessStudio[];
	}

	let {
		viewId,
		threeOneOneItems = [],
		coffeeShops = [],
		gasStations = [],
		fitnessStudios = []
	}: Props = $props();

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Writable<boolean>;
	}>('maplibre-map');

	/**
	 * Map region viewId to which overlay layers to show.
	 * Each region gets a curated set of data overlays.
	 */
	const REGION_OVERLAYS: Record<string, string[]> = {
		county: ['311'],
		south: ['coffee', 'gas'],
		central: ['fitness'],
		north: ['gas'],
		west: [] // West Marin overlays (surf/trail) don't have map pins yet
	};

	/** All TV overlay source/layer IDs managed by this component */
	const TV_SOURCES = [
		'tv-overlay-311',
		'tv-overlay-coffee',
		'tv-overlay-gas',
		'tv-overlay-fitness'
	] as const;

	const TV_LAYER_GROUPS: Record<string, string[]> = {
		'311': ['tv-overlay-311-dots', 'tv-overlay-311-labels'],
		coffee: ['tv-overlay-coffee-dots', 'tv-overlay-coffee-labels'],
		gas: ['tv-overlay-gas-dots', 'tv-overlay-gas-labels'],
		fitness: ['tv-overlay-fitness-dots', 'tv-overlay-fitness-labels']
	};

	let sourcesAdded = false;
	let removeStyleLoadListener: (() => void) | null = null;

	function setupSources(map: MapLibreMap) {
		// Guard against duplicate adds (style swaps remove sources, so re-add)
		if (map.getSource('tv-overlay-311')) return;

		const emptyGeoJSON: GeoJSON.FeatureCollection = {
			type: 'FeatureCollection',
			features: []
		};

		// --- Sources ---
		map.addSource('tv-overlay-311', { type: 'geojson', data: emptyGeoJSON });
		map.addSource('tv-overlay-coffee', { type: 'geojson', data: emptyGeoJSON });
		map.addSource('tv-overlay-gas', { type: 'geojson', data: emptyGeoJSON });
		map.addSource('tv-overlay-fitness', { type: 'geojson', data: emptyGeoJSON });

		// --- Layers (TV-sized: larger circles, bigger text) ---

		// 311 complaints — orange dots
		map.addLayer({
			id: 'tv-overlay-311-dots',
			type: 'circle',
			source: 'tv-overlay-311',
			paint: {
				'circle-radius': 8,
				'circle-color': '#ff6b35',
				'circle-opacity': 0.85,
				'circle-stroke-width': 2,
				'circle-stroke-color': 'rgba(10, 10, 10, 0.8)'
			}
		});

		map.addLayer({
			id: 'tv-overlay-311-labels',
			type: 'symbol',
			source: 'tv-overlay-311',
			layout: {
				'text-field': ['get', 'label'],
				'text-size': 13,
				'text-offset': [0, 1.6],
				'text-anchor': 'top',
				'text-optional': true,
				'text-max-width': 12
			},
			paint: {
				'text-color': '#ff6b35',
				'text-halo-color': 'rgba(10, 10, 10, 0.95)',
				'text-halo-width': 2
			}
		});

		// Coffee shops — warm brown dots with price labels
		map.addLayer({
			id: 'tv-overlay-coffee-dots',
			type: 'circle',
			source: 'tv-overlay-coffee',
			paint: {
				'circle-radius': 8,
				'circle-color': '#a16207',
				'circle-opacity': 0.85,
				'circle-stroke-width': 2,
				'circle-stroke-color': 'rgba(10, 10, 10, 0.8)'
			}
		});

		map.addLayer({
			id: 'tv-overlay-coffee-labels',
			type: 'symbol',
			source: 'tv-overlay-coffee',
			layout: {
				'text-field': ['get', 'label'],
				'text-size': 14,
				'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
				'text-offset': [0, 1.6],
				'text-anchor': 'top',
				'text-optional': true,
				'text-max-width': 10
			},
			paint: {
				'text-color': '#d4a056',
				'text-halo-color': 'rgba(10, 10, 10, 0.95)',
				'text-halo-width': 2
			}
		});

		// Gas stations — cyan dots with price labels
		map.addLayer({
			id: 'tv-overlay-gas-dots',
			type: 'circle',
			source: 'tv-overlay-gas',
			paint: {
				'circle-radius': 8,
				'circle-color': '#22d3ee',
				'circle-opacity': 0.85,
				'circle-stroke-width': 2,
				'circle-stroke-color': 'rgba(10, 10, 10, 0.8)'
			}
		});

		map.addLayer({
			id: 'tv-overlay-gas-labels',
			type: 'symbol',
			source: 'tv-overlay-gas',
			layout: {
				'text-field': ['get', 'label'],
				'text-size': 14,
				'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
				'text-offset': [0, 1.6],
				'text-anchor': 'top',
				'text-optional': true,
				'text-max-width': 10
			},
			paint: {
				'text-color': '#22d3ee',
				'text-halo-color': 'rgba(10, 10, 10, 0.95)',
				'text-halo-width': 2
			}
		});

		// Fitness studios — type-colored dots
		map.addLayer({
			id: 'tv-overlay-fitness-dots',
			type: 'circle',
			source: 'tv-overlay-fitness',
			paint: {
				'circle-radius': 8,
				'circle-color': ['get', 'color'],
				'circle-opacity': 0.85,
				'circle-stroke-width': 2,
				'circle-stroke-color': 'rgba(10, 10, 10, 0.8)'
			}
		});

		map.addLayer({
			id: 'tv-overlay-fitness-labels',
			type: 'symbol',
			source: 'tv-overlay-fitness',
			layout: {
				'text-field': ['get', 'label'],
				'text-size': 13,
				'text-offset': [0, 1.6],
				'text-anchor': 'top',
				'text-optional': true,
				'text-max-width': 12
			},
			paint: {
				'text-color': '#ec4899',
				'text-halo-color': 'rgba(10, 10, 10, 0.95)',
				'text-halo-width': 2
			}
		});

		sourcesAdded = true;
	}

	function updateOverlayData(map: MapLibreMap) {
		if (!sourcesAdded) return;

		const activeOverlays = REGION_OVERLAYS[viewId] ?? [];

		// --- 311 reports ---
		const show311 = activeOverlays.includes('311');
		const threeOneOneFeatures: GeoJSON.Feature[] = show311
			? threeOneOneItems
					.filter((item) => typeof item.lat === 'number' && typeof item.lon === 'number')
					.map((item) => {
						const category = item.title.includes(' \u00b7 ')
							? item.title.split(' \u00b7 ')[0]
							: item.title;
						return {
							type: 'Feature' as const,
							id: item.id.replace('seeclickfix-', ''),
							geometry: {
								type: 'Point' as const,
								coordinates: [item.lon!, item.lat!]
							},
							properties: {
								label: category
							}
						};
					})
			: [];

		const src311 = map.getSource('tv-overlay-311') as GeoJSONSource | undefined;
		if (src311) {
			src311.setData({ type: 'FeatureCollection', features: threeOneOneFeatures });
		}

		// --- Coffee shops ---
		const showCoffee = activeOverlays.includes('coffee');
		const coffeeFeatures: GeoJSON.Feature[] = showCoffee
			? coffeeShops
					.filter((shop) => typeof shop.lat === 'number' && typeof shop.lon === 'number')
					.map((shop) => {
						const priceLabel =
							shop.price !== null && shop.price !== undefined
								? `$${shop.price.toFixed(2)}`
								: '';
						return {
							type: 'Feature' as const,
							id: shop.id,
							geometry: {
								type: 'Point' as const,
								coordinates: [shop.lon, shop.lat]
							},
							properties: {
								label: priceLabel
									? `${shop.name}\n${priceLabel}`
									: shop.name,
								name: shop.name,
								price: priceLabel
							}
						};
					})
			: [];

		const srcCoffee = map.getSource('tv-overlay-coffee') as GeoJSONSource | undefined;
		if (srcCoffee) {
			srcCoffee.setData({ type: 'FeatureCollection', features: coffeeFeatures });
		}

		// --- Gas stations ---
		const showGas = activeOverlays.includes('gas');
		const gasFeatures: GeoJSON.Feature[] = showGas
			? gasStations
					.filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number')
					.map((station) => {
						const regularPrice = station.fuelPrices.find(
							(fp) => fp.type === 'REGULAR_UNLEADED'
						)?.price;
						const priceLabel =
							regularPrice !== undefined ? `$${regularPrice.toFixed(3)}` : '';
						return {
							type: 'Feature' as const,
							id: station.placeId,
							geometry: {
								type: 'Point' as const,
								coordinates: [station.lon, station.lat]
							},
							properties: {
								label: priceLabel
									? `${station.name}\n${priceLabel}`
									: station.name,
								name: station.name,
								price: priceLabel
							}
						};
					})
			: [];

		const srcGas = map.getSource('tv-overlay-gas') as GeoJSONSource | undefined;
		if (srcGas) {
			srcGas.setData({ type: 'FeatureCollection', features: gasFeatures });
		}

		// --- Fitness studios ---
		const showFitness = activeOverlays.includes('fitness');
		const fitnessFeatures: GeoJSON.Feature[] = showFitness
			? fitnessStudios
					.filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number')
					.map((studio) => ({
						type: 'Feature' as const,
						id: studio.id,
						geometry: {
							type: 'Point' as const,
							coordinates: [studio.lon, studio.lat]
						},
						properties: {
							label: `${studio.name}\n$${studio.dropInPrice}`,
							name: studio.name,
							price: `$${studio.dropInPrice}`,
							color: FITNESS_TYPE_COLORS[studio.type],
							typeName: FITNESS_TYPE_LABELS[studio.type]
						}
					}))
			: [];

		const srcFitness = map.getSource('tv-overlay-fitness') as GeoJSONSource | undefined;
		if (srcFitness) {
			srcFitness.setData({ type: 'FeatureCollection', features: fitnessFeatures });
		}

		// --- Visibility toggle per overlay group ---
		for (const [overlayKey, layerIds] of Object.entries(TV_LAYER_GROUPS)) {
			const visible = activeOverlays.includes(overlayKey);
			for (const layerId of layerIds) {
				if (map.getLayer(layerId)) {
					map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
				}
			}
		}
	}

	function cleanupLayers(map: MapLibreMap) {
		// Remove layers first, then sources
		for (const layerIds of Object.values(TV_LAYER_GROUPS)) {
			for (const layerId of layerIds) {
				if (map.getLayer(layerId)) {
					map.removeLayer(layerId);
				}
			}
		}
		for (const sourceId of TV_SOURCES) {
			if (map.getSource(sourceId)) {
				map.removeSource(sourceId);
			}
		}
		sourcesAdded = false;
	}

	// React to viewId / data changes.
	// Accessing props in the $effect body registers them as dependencies in Svelte 5.
	$effect(() => {
		// Register reactive dependencies by reading them
		void viewId;
		void threeOneOneItems.length;
		void coffeeShops.length;
		void gasStations.length;
		void fitnessStudios.length;

		const map = getMap();
		if (!map || !get(mapReady)) return;

		if (!sourcesAdded) {
			setupSources(map);
		}
		updateOverlayData(map);
	});

	onMount(() => {
		const unsubReady = mapReady.subscribe((ready) => {
			if (!ready) return;
			const map = getMap();
			if (!map) return;

			setupSources(map);
			updateOverlayData(map);

			// Re-add on style swap (theme change removes custom layers)
			removeStyleLoadListener?.();
			const handleStyleLoad = () => {
				sourcesAdded = false;
				setupSources(map);
				updateOverlayData(map);
			};
			map.on('style.load', handleStyleLoad);
			removeStyleLoadListener = () => map.off('style.load', handleStyleLoad);
		});

		return () => {
			unsubReady();
		};
	});

	onDestroy(() => {
		removeStyleLoadListener?.();
		const map = getMap();
		if (map) {
			cleanupLayers(map);
		}
	});
</script>
