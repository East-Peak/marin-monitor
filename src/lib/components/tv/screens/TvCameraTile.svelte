<!-- src/lib/components/tv/screens/TvCameraTile.svelte -->
<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { CameraConfig } from '$lib/config/cameras';
	import {
		initialTileState,
		lastGoodFrame,
		onFrameFailed,
		onFrameLoaded,
		rememberFrame,
		staleAfterMs,
		tileStatus,
		versionedFrameUrl,
		type TileState
	} from '../camera-frame';
	import { preloadImage } from '../image-preload';

	interface Props {
		cam: CameraConfig;
		preload?: (url: string) => Promise<boolean>;
		now?: () => number;
	}

	let { cam, preload = preloadImage, now = Date.now }: Props = $props();

	// Seeded once: each tile is keyed by camera id, so `cam` never changes underneath it.
	let tile = $state<TileState>(untrack(() => initialTileState(lastGoodFrame(cam.id))));
	let clock = $state(untrack(() => now()));
	let inFlight = false;
	let destroyed = false;
	let timer: ReturnType<typeof setInterval> | null = null;

	const status = $derived(tileStatus(tile, clock, staleAfterMs(cam.refreshInterval)));
	const ageMin = $derived(tile.shownAt === null ? 0 : Math.round((clock - tile.shownAt) / 60_000));

	async function refresh() {
		clock = now();
		const url = versionedFrameUrl(cam.url, cam.refreshInterval, clock);
		if (inFlight || url === tile.shownUrl) return;
		inFlight = true;
		const ok = await preload(url);
		inFlight = false;
		if (destroyed) return;
		const at = now();
		if (ok) {
			tile = onFrameLoaded(tile, url, at);
			rememberFrame(cam.id, url, at);
		} else {
			tile = onFrameFailed(tile);
		}
		clock = at;
	}

	onMount(() => {
		void refresh();
		if (cam.refreshInterval) timer = setInterval(() => void refresh(), cam.refreshInterval * 1000);
	});

	onDestroy(() => {
		destroyed = true;
		if (timer) clearInterval(timer);
	});
</script>

<div
	class="relative h-full w-full min-h-0 min-w-0 overflow-hidden rounded bg-gray-800"
	data-camera-id={cam.id}
	data-status={status}
>
	{#if tile.shownUrl}
		<img src={tile.shownUrl} alt={cam.name} class="block h-full w-full object-cover" />
	{/if}
	{#if status === 'connecting'}
		<div class="absolute inset-0 flex items-center justify-center">
			<span class="text-sm text-gray-400">Connecting…</span>
		</div>
	{:else if status === 'offline'}
		<div class="absolute inset-0 flex items-center justify-center">
			<span class="text-sm text-gray-400">Camera offline</span>
		</div>
	{:else if status === 'stale'}
		<div class="absolute bottom-0 left-0 p-1.5 pointer-events-none">
			<span class="text-xs text-amber-300 bg-black/70 px-1.5 py-0.5 rounded"
				>Last frame {ageMin} min ago</span
			>
		</div>
	{/if}
	<div
		class="absolute top-0 left-0 right-0 flex justify-between items-start p-1.5 pointer-events-none"
	>
		<span class="text-xs font-medium text-white bg-black/60 px-1.5 py-0.5 rounded">{cam.name}</span>
		<span class="text-xs text-gray-300 bg-black/60 px-1.5 py-0.5 rounded">{cam.location}</span>
	</div>
	<div class="absolute bottom-0 right-0 p-1.5 pointer-events-none">
		<span class="text-[10px] text-gray-400 bg-black/60 px-1 py-0.5 rounded">{cam.source}</span>
	</div>
</div>
