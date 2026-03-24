<script lang="ts">
	import { getContext } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type { Map as MapLibreMap } from 'maplibre-gl';

	interface Props {
		center: [number, number];
		zoom: number;
	}

	let { center, zoom }: Props = $props();

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Writable<boolean>;
	}>('maplibre-map');

	// React to center/zoom changes — jumpTo whenever props change
	$effect(() => {
		const c = center;
		const z = zoom;
		function setPosition() {
			const map = getMap();
			if (map) {
				map.jumpTo({ center: c, zoom: z });
			}
		}

		if (get(mapReady)) {
			setPosition();
		} else {
			const unsub = mapReady.subscribe((ready) => {
				if (ready) {
					unsub();
					setPosition();
				}
			});
		}
	});
</script>
