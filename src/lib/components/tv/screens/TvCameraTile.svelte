<!-- src/lib/components/tv/screens/TvCameraTile.svelte -->
<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { Action } from 'svelte/action';
	import type { CameraConfig } from '$lib/config/cameras';
	import {
		forgetFrame,
		initialTileState,
		lastGoodFrame,
		priorFailures,
		rememberFailure,
		onFrameFailed,
		onFrameLoaded,
		rememberFrame,
		staleAfterMs,
		tileStatus,
		versionedFrameUrl,
		type TileState
	} from '../camera-frame';
	import { readCameraFrame, type CameraPreload } from '../camera-read';

	interface Props {
		cam: CameraConfig;
		preload?: CameraPreload;
		isPlaceholder?: (img: HTMLImageElement) => boolean;
		now?: () => number;
	}

	let { cam, preload, isPlaceholder, now = Date.now }: Props = $props();

	// Seeded once: each tile is keyed by camera id, so `cam` never changes underneath it.
	let tile = $state<TileState>(
		untrack(() => initialTileState(lastGoodFrame(cam.id), priorFailures(cam.id)))
	);
	// The decoded element on screen. Mounting it (not a new <img src>) means a
	// remount never refetches, even after the CDN's short max-age has expired.
	let shownImg = $state.raw(untrack(() => lastGoodFrame(cam.id)?.img ?? null));
	let clock = $state(untrack(() => now()));
	let inFlight = false;
	let destroyed = false;
	let timer: ReturnType<typeof setInterval> | null = null;

	// Caltrans' stand-in card: a definite answer, not a failed load, until a real frame returns.
	let unavailable = $state(false);
	const status = $derived(
		unavailable ? 'unavailable' : tileStatus(tile, clock, staleAfterMs(cam.refreshInterval))
	);
	const ageMin = $derived(tile.shownAt === null ? 0 : Math.round((clock - tile.shownAt) / 60_000));

	async function refresh() {
		clock = now();
		const url = versionedFrameUrl(cam.url, cam.refreshInterval, clock);
		if (inFlight || url === tile.shownUrl) return;
		inFlight = true;
		const read = await readCameraFrame(url, preload, isPlaceholder);
		inFlight = false;
		if (destroyed) return;
		const at = now();
		if (read.kind === 'frame') {
			unavailable = false;
			tile = onFrameLoaded(tile, url, at);
			shownImg = read.img;
			rememberFrame(cam.id, url, at, read.img);
		} else if (read.kind === 'placeholder') {
			unavailable = true;
			tile = initialTileState();
			shownImg = null;
			forgetFrame(cam.id);
		} else {
			tile = onFrameFailed(tile);
			rememberFailure(cam.id);
		}
		clock = at;
	}

	const showFrame: Action<HTMLElement, HTMLImageElement> = (host, img) => {
		const mount = (frame: HTMLImageElement) => {
			frame.alt = cam.name;
			frame.className = 'block h-full w-full object-contain';
			host.replaceChildren(frame);
		};
		mount(img);
		// Detach on unmount: the cached element outlives the slide and must not pin it.
		return { update: mount, destroy: () => host.replaceChildren() };
	};

	onMount(() => {
		void refresh();
		if (cam.refreshInterval) timer = setInterval(() => void refresh(), cam.refreshInterval * 1000);
	});

	onDestroy(() => {
		destroyed = true;
		if (timer) clearInterval(timer);
	});
</script>

<!-- CAMBAR1: the frame shows whole (contain, square corners) and our labels sit under it, never
     on it: ALERTCalifornia asks that their frame and its bottom info bar not be cropped or covered. -->
<div
	class="flex h-full w-full min-h-0 min-w-0 flex-col gap-0.5"
	data-camera-id={cam.id}
	data-status={status}
>
	<div class="relative min-h-0 flex-1 bg-gray-800">
		{#if shownImg}
			<div class="h-full w-full" use:showFrame={shownImg}></div>
		{/if}
		{#if status === 'connecting'}
			<div class="absolute inset-0 flex items-center justify-center">
				<span class="text-sm text-gray-400">Connecting…</span>
			</div>
		{:else if status === 'offline'}
			<div class="absolute inset-0 flex items-center justify-center">
				<span class="text-sm text-gray-400">Camera offline</span>
			</div>
		{:else if status === 'unavailable'}
			<div class="absolute inset-0 flex items-center justify-center">
				<span class="text-sm text-gray-400">Camera temporarily unavailable</span>
			</div>
		{/if}
	</div>
	<div class="flex shrink-0 items-baseline gap-1.5 px-0.5 text-xs leading-tight whitespace-nowrap">
		<span class="min-w-0 truncate font-medium text-white">{cam.name}</span>
		<span class="min-w-0 truncate text-gray-400">{cam.location}</span>
		{#if status === 'stale'}
			<span class="min-w-0 truncate text-amber-300">Last frame {ageMin} min ago</span>
		{/if}
		<span class="ml-auto shrink-0 text-[10px] text-gray-400">{cam.source}</span>
	</div>
</div>
