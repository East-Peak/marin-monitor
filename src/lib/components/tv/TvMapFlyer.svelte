<script lang="ts">
	import { onDestroy, getContext } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import { TV_MAP_VIEWS, TV_MAP_VIEW_INTERVAL_MS } from '$lib/config/tv';

	interface Props {
		active: boolean;
		onViewChange?: (view: typeof TV_MAP_VIEWS[0]) => void;
	}

	let { active, onViewChange }: Props = $props();

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Writable<boolean>;
	}>('maplibre-map');

	let viewIdx = $state(0);
	let timer: ReturnType<typeof setInterval> | null = null;
	let currentLabel = $state(TV_MAP_VIEWS[0].label);

	function flyToView(idx: number) {
		const map = getMap();
		const view = TV_MAP_VIEWS[idx];
		if (!map || !view) return;

		currentLabel = view.label;
		onViewChange?.(view);

		if (view.duration === 0) {
			// Instant for county overview (initial view)
			map.jumpTo({ center: view.center, zoom: view.zoom });
		} else {
			map.flyTo({
				center: view.center,
				zoom: view.zoom,
				duration: view.duration,
				essential: true
			});
		}
	}

	function startSubCarousel() {
		stopSubCarousel();
		viewIdx = 0;

		// Wait for map to be ready before starting
		if (!get(mapReady)) {
			const unsub = mapReady.subscribe((ready) => {
				if (ready) {
					unsub();
					flyToView(0);
					timer = setInterval(() => {
						viewIdx = (viewIdx + 1) % TV_MAP_VIEWS.length;
						flyToView(viewIdx);
					}, TV_MAP_VIEW_INTERVAL_MS);
				}
			});
		} else {
			flyToView(0);
			timer = setInterval(() => {
				viewIdx = (viewIdx + 1) % TV_MAP_VIEWS.length;
				flyToView(viewIdx);
			}, TV_MAP_VIEW_INTERVAL_MS);
		}
	}

	function stopSubCarousel() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	// Start/stop based on whether this screen is active
	$effect(() => {
		if (active) {
			startSubCarousel();
		} else {
			stopSubCarousel();
			// Reset to county view when leaving
			const map = getMap();
			if (map && get(mapReady)) {
				map.jumpTo({
					center: TV_MAP_VIEWS[0].center,
					zoom: TV_MAP_VIEWS[0].zoom
				});
			}
		}
	});

	onDestroy(() => {
		stopSubCarousel();
	});
</script>

{#if active}
	<div class="absolute top-16 left-3 z-10 px-3 py-1.5 rounded bg-gray-900/80 backdrop-blur-sm border border-gray-700/50">
		<span class="text-sm font-medium text-gray-200">{currentLabel}</span>
	</div>
{/if}
