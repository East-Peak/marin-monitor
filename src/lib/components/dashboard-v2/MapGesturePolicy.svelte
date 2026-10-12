<!-- Gesture policy for the v2 map (Decision 3; Codex r1 #13): while the phone preview is
     collapsed the map ignores drags, pinches, wheel and double-tap, so the page scrolls. -->
<script lang="ts">
	import { getContext } from 'svelte';
	import type { Readable } from 'svelte/store';

	type Handler = { enable(): void; disable(): void };
	type GestureMap = Record<
		'dragPan' | 'touchZoomRotate' | 'scrollZoom' | 'doubleClickZoom',
		Handler
	>;
	let { interactive }: { interactive: boolean } = $props();
	const { getMap, mapReady } = getContext<{
		getMap: () => GestureMap | null;
		mapReady: Readable<boolean>;
	}>('maplibre-map');
	const ready = mapReady;

	$effect(() => {
		if (!$ready) return;
		const map = getMap();
		if (!map) return;
		for (const h of ['dragPan', 'touchZoomRotate', 'scrollZoom', 'doubleClickZoom'] as const) {
			if (interactive) map[h].enable();
			else map[h].disable();
		}
	});
</script>
