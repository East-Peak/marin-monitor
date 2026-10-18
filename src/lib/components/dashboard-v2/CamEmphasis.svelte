<!-- Lights the emphasised cameras' pins and wedges (CAMQUIET1): the hovered or selected camera's
     wedge shows full strength, the rest stay quiet. Renders nothing. -->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { Map as MapLibreMap, MapSourceDataEvent } from 'maplibre-gl';
	import { CAM_SOURCES, setCamEmphasis } from '$lib/dashboard/cam-emphasis';

	let { ids }: { ids: readonly string[] } = $props();

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Writable<boolean>;
	}>('maplibre-map');
	let map = $state<MapLibreMap | null>(null);
	let lit: readonly string[] = [];

	onMount(() => {
		// A style swap re-adds the sources without their feature state: light them again.
		const onSource = (e: MapSourceDataEvent) => {
			if (map && e.sourceDataType === 'metadata' && CAM_SOURCES.some((s) => s === e.sourceId))
				setCamEmphasis(map, [], lit);
		};
		const stop = mapReady.subscribe((ready) => {
			const m = getMap();
			if (!ready || !m || m === map) return;
			map = m;
			m.on('sourcedata', onSource);
		});
		return () => {
			stop();
			if (!map) return;
			map.off('sourcedata', onSource);
			setCamEmphasis(map, lit, []);
		};
	});

	$effect(() => {
		const next = [...ids];
		if (!map) return;
		setCamEmphasis(map, lit, next);
		lit = next;
	});
</script>
