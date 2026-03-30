<script lang="ts">
	import { getContext } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type { Map as MapLibreMap } from 'maplibre-gl';

	interface Props {
		center: [number, number];
		zoom: number;
		duration?: number;
	}

	let { center, zoom, duration = 0 }: Props = $props();

	let lastViewSignature = '';

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Writable<boolean>;
	}>('maplibre-map');

	// React to center/zoom changes — jumpTo whenever props change
	$effect(() => {
		const c = center;
		const z = zoom;
		const animationDuration = duration;
		const nextSignature = `${c[0].toFixed(4)},${c[1].toFixed(4)},${z.toFixed(2)}`;
		let unsub: (() => void) | null = null;
		let cancelled = false;

		function setPosition() {
			const map = getMap();
			if (map) {
				if (cancelled || nextSignature === lastViewSignature) return;

				const isFirstPosition = lastViewSignature === '';
				lastViewSignature = nextSignature;
				map.stop();

				if (isFirstPosition || animationDuration <= 0) {
					map.jumpTo({ center: c, zoom: z });
					return;
				}

				map.easeTo({
					center: c,
					zoom: z,
					duration: animationDuration,
					essential: true
				});
			}
		}

		if (get(mapReady)) {
			setPosition();
		} else {
			unsub = mapReady.subscribe((ready) => {
				if (ready) {
					unsub?.();
					unsub = null;
					setPosition();
				}
			});
		}

		// Cleanup: unsubscribe if effect re-runs before map was ready
		return () => {
			cancelled = true;
			unsub?.();
		};
	});
</script>
