<script lang="ts">
	import { onMount, getContext } from 'svelte';
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

	onMount(() => {
		function setPosition() {
			const map = getMap();
			if (map) {
				map.jumpTo({ center, zoom });
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
