<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { CAMERAS } from '$lib/config/cameras';
	import { TV_CAMERA_CLUSTERS, type TvCameraCluster } from '$lib/config/tv';

	interface Props {
		clusterId: TvCameraCluster;
	}

	let { clusterId }: Props = $props();

	const clusterLabel = $derived(
		TV_CAMERA_CLUSTERS.find((c) => c.id === clusterId)?.label ?? clusterId
	);

	const cameras = $derived(CAMERAS.filter((c) => c.tvCluster === clusterId));

	let timestamps = $state<Record<string, number>>({});
	let refreshTimers: ReturnType<typeof setInterval>[] = [];

	onMount(() => {
		for (const cam of cameras) {
			if (cam.type === 'image' && cam.refreshInterval) {
				timestamps[cam.id] = Date.now();
				const timer = setInterval(() => {
					timestamps[cam.id] = Date.now();
				}, cam.refreshInterval * 1000);
				refreshTimers.push(timer);
			}
		}
	});

	onDestroy(() => {
		refreshTimers.forEach(clearInterval);
	});

	function imageUrl(cam: (typeof CAMERAS)[0]): string {
		const ts = timestamps[cam.id];
		return ts ? `${cam.url}?t=${ts}` : cam.url;
	}
</script>

<div class="h-full min-h-0 overflow-hidden flex flex-col p-2">
	<h2 class="text-lg font-bold leading-tight text-gray-100 mb-1.5 px-2 shrink-0">{clusterLabel}</h2>
	<div class="flex-1 grid min-h-0 grid-cols-4 grid-rows-2 gap-1.5 overflow-hidden">
		{#each cameras as cam (cam.id)}
			<div class="relative min-h-0 min-w-0 overflow-hidden rounded bg-gray-800">
				{#if cam.type === 'image'}
					<img
						src={imageUrl(cam)}
						alt={cam.name}
						class="block h-full w-full object-cover"
						loading="eager"
						onerror={(e) => {
							const el = e.currentTarget as HTMLImageElement;
							el.style.display = 'none';
						}}
					/>
				{:else if cam.type === 'iframe'}
					<iframe
						src={cam.url}
						title={cam.name}
						class="block h-full w-full border-0"
						loading="eager"
						allow="autoplay"
					></iframe>
				{/if}
				<div class="camera-offline-fallback">
					<span class="text-xs text-gray-500">Camera offline</span>
				</div>
				<div
					class="absolute top-0 left-0 right-0 flex justify-between items-start p-1.5 pointer-events-none"
				>
					<span class="text-xs font-medium text-white bg-black/60 px-1.5 py-0.5 rounded"
						>{cam.name}</span
					>
					<span class="text-xs text-gray-300 bg-black/60 px-1.5 py-0.5 rounded">{cam.location}</span
					>
				</div>
				<div class="absolute bottom-0 right-0 p-1.5 pointer-events-none">
					<span class="text-[10px] text-gray-400 bg-black/60 px-1 py-0.5 rounded">{cam.source}</span
					>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.camera-offline-fallback {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 0;
	}
</style>
