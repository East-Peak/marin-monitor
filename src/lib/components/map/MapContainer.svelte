<script lang="ts">
	import { onMount, onDestroy, setContext } from 'svelte';
	import { get, writable } from 'svelte/store';
	import type { Snippet } from 'svelte';
	import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
	import { MAP_DEFAULT } from '$lib/config';
	import { settings } from '$lib/stores';
	import type { ThemeMode } from '$lib/stores/settings';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();

	let container: HTMLDivElement;
	let map: MapLibreMap | null = $state(null);
	const mapReady = writable(false);
	let currentMapStyle = '';
	let unsubscribeTheme: (() => void) | null = null;

	function getMapStyleUrl(theme: ThemeMode): string {
		return theme === 'light'
			? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
			: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
	}

	// Expose map instance to child components via context
	setContext('maplibre-map', {
		getMap: () => map,
		mapReady
	});

	onMount(async () => {
		// Dynamic import to avoid SSR issues with WebGL
		const maplibregl = await import('maplibre-gl');
		const initialTheme = get(settings).theme;
		currentMapStyle = getMapStyleUrl(initialTheme);

		map = new maplibregl.Map({
			container,
			style: currentMapStyle,
			center: [MAP_DEFAULT.center.lon, MAP_DEFAULT.center.lat],
			zoom: MAP_DEFAULT.zoom,
			minZoom: MAP_DEFAULT.minZoom,
			maxZoom: MAP_DEFAULT.maxZoom,
			attributionControl: false
		});

		map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

		map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

		map.on('load', () => {
			// Fixed default overview tuned to show the full county context while keeping detail.
			const marinOverviewBounds: LngLatBoundsLike = [
				[-123.08, 37.76],
				[-122.26, 38.38]
			];

			map?.fitBounds(marinOverviewBounds, {
				padding: { top: 12, right: 12, bottom: 12, left: 12 },
				maxZoom: 9.1,
				duration: 0
			});

			mapReady.set(true);
		});

		unsubscribeTheme = settings.subscribe(($settings) => {
			if (!map) return;
			const nextStyle = getMapStyleUrl($settings.theme);
			if (nextStyle === currentMapStyle) return;
			currentMapStyle = nextStyle;
			map.setStyle(nextStyle);
		});
	});

	onDestroy(() => {
		unsubscribeTheme?.();
		if (map) {
			map.remove();
			map = null;
		}
	});
</script>

<div class="map-wrapper" bind:this={container}>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.map-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.map-wrapper :global(.maplibregl-ctrl-attrib) {
		background: color-mix(in srgb, var(--surface) 82%, transparent) !important;
		color: var(--text-muted) !important;
		font-size: 0.55rem !important;
	}

	.map-wrapper :global(.maplibregl-ctrl-attrib a) {
		color: var(--text-dim) !important;
	}

	.map-wrapper :global(.maplibregl-ctrl-group) {
		background: var(--surface) !important;
		border: 1px solid var(--border) !important;
	}

	.map-wrapper :global(.maplibregl-ctrl-group button) {
		width: 26px !important;
		height: 26px !important;
	}

	.map-wrapper :global(.maplibregl-ctrl-group button + button) {
		border-top: 1px solid var(--border) !important;
	}

	.map-wrapper :global(.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon),
	.map-wrapper :global(.maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon) {
		filter: var(--map-control-icon-filter);
	}
</style>
