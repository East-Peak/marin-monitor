<!-- The v2 map's way back and its key (Stuart, 2026-10-16): "All of Marin" whenever a town is
     chosen or the view has moved off the county overview, and a line per enabled layer saying
     how it is placed and how many are in view (stories sit in town circles, not street spots). -->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Readable } from 'svelte/store';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import { TOWN_BY_SLUG } from '$lib/config';
	import { fitMarinOverview, marinOverviewCamera } from '$lib/components/map/map-overview';
	import type { MapLayer } from '$lib/types';
	import type { V2MapData } from '$lib/dashboard/v2-map-data';
	import {
		mapLegend,
		showMarinReset,
		type InView,
		type MapView
	} from '$lib/dashboard/v2-map-legend';

	let {
		town,
		activeLayers,
		layers,
		onReset
	}: {
		town: string | null;
		activeLayers: Readonly<Partial<Record<MapLayer, boolean>>>;
		layers: V2MapData['layers'];
		/** Clears the town and any open inspector; the camera move follows it. */
		onReset: () => void;
	} = $props();

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Readable<boolean>;
	}>('maplibre-map');

	let home = $state<MapView | null>(null);
	let view = $state<MapView | null>(null);
	let seen = $state<InView | null>(null);
	let quakesShown = $state(true);

	const cameraOf = (map: MapLibreMap): MapView => {
		const { lng, lat } = map.getCenter();
		return { zoom: map.getZoom(), center: { lng, lat } };
	};
	const renderedOn = (map: MapLibreMap, id: string) =>
		map.getLayer(id) ? map.queryRenderedFeatures({ layers: [id] }) : [];

	function measure(map: MapLibreMap) {
		view = cameraOf(map);
		quakesShown = map.getLayoutProperty('earthquakes-layer', 'visibility') !== 'none';
		seen = {
			towns: renderedOn(map, 'towns-layer').map((f) => ({
				slug: String(f.properties?.slug ?? ''),
				total: Number(f.properties?.total ?? 0)
			})),
			fixIt: renderedOn(map, '311-reports-layer').length,
			quakes: renderedOn(map, 'earthquakes-layer').length
		};
	}

	onMount(() => {
		let detach = () => {};
		const stop = mapReady.subscribe((ready) => {
			const map = getMap();
			if (!ready || !map) return;
			detach();
			// Home is the overview fit at the map's current size: it moves when the map resizes.
			const onResize = () => (home = marinOverviewCamera(map) ?? home);
			home = marinOverviewCamera(map) ?? cameraOf(map);
			const onMove = () => (view = cameraOf(map));
			const onIdle = () => measure(map);
			map.on('resize', onResize);
			map.on('moveend', onMove);
			map.on('idle', onIdle);
			measure(map);
			detach = () => {
				map.off('resize', onResize);
				map.off('moveend', onMove);
				map.off('idle', onIdle);
			};
		});
		return () => {
			stop();
			detach();
		};
	});

	const showReset = $derived(showMarinReset(town, view, home));
	const key = $derived(
		mapLegend({
			activeLayers,
			earthquakesShown: quakesShown,
			layers,
			town,
			townName: (slug) => TOWN_BY_SLUG[slug]?.name ?? slug,
			inView: seen
		})
	);

	function reset() {
		onReset();
		const map = getMap();
		// After the town clear, so this camera move wins over the clear's own fly-out.
		if (map) fitMarinOverview(map, 800);
	}
</script>

<div class="v2-map-nav">
	{#if showReset}
		<button type="button" class="v2-map-reset" data-map-reset data-text-role="label" onclick={reset}
			>All of Marin</button
		>
	{/if}
	{#if key.length > 0}
		<ul
			class="v2-map-key"
			data-slot="map-key"
			data-text-role="meta"
			aria-label="What the map shows"
		>
			{#each key as line (line.key)}
				<li data-key={line.key}>
					<b>{line.label}</b>
					{line.how}{#if line.count}<span class="v2-map-key-count">{` · ${line.count}`}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.v2-map-nav {
		position: absolute;
		left: 0.5rem;
		bottom: 0.5rem;
		z-index: 20;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.375rem;
		max-width: min(360px, calc(100% - 7rem));
		pointer-events: none;
	}
	.v2-map-reset,
	.v2-map-key {
		pointer-events: auto;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: color-mix(in srgb, var(--surface) 93%, transparent);
		backdrop-filter: blur(6px);
	}
	.v2-map-reset {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-height: 2rem;
		padding: 0 0.75rem;
		color: var(--text-primary);
		cursor: pointer;
	}
	.v2-map-reset::before {
		content: '←';
	}
	.v2-map-reset:hover {
		border-color: var(--text-secondary);
	}
	.v2-map-key {
		margin: 0;
		padding: 0.375rem 0.625rem;
		list-style: none;
		color: var(--text-secondary);
	}
	.v2-map-key b {
		color: var(--text-primary);
		font-weight: 600;
	}
	/* Phone: the expand button holds this corner; the overlay is a desktop/tablet aid. */
	@media (max-width: 767px) {
		.v2-map-nav {
			display: none;
		}
	}
</style>
