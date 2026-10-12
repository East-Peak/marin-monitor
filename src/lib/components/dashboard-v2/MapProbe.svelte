<!-- With ?probe, exposes the v2 map as window.__v2ProbeMap (rendered-feature checks in e2e). -->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import { exposeMapForProbe } from '$lib/components/tv/tv-probe-hook';

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Writable<boolean>;
	}>('maplibre-map');
	onMount(() => {
		let remove = () => {};
		const stop = mapReady.subscribe((ready) => {
			const map = getMap();
			if (!ready || !map) return;
			remove();
			remove = exposeMapForProbe(
				location.search,
				window as unknown as Record<string, unknown>,
				map,
				'__v2ProbeMap'
			);
		});
		return () => {
			stop();
			remove();
		};
	});
</script>
