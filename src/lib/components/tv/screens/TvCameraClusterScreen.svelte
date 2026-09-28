<script lang="ts">
	import { CAMERAS } from '$lib/config/cameras';
	import { TV_CAMERA_CLUSTERS, type TvCameraCluster } from '$lib/config/tv';
	import TvCameraTile from './TvCameraTile.svelte';

	interface Props {
		clusterId: TvCameraCluster;
	}

	let { clusterId }: Props = $props();

	const clusterLabel = $derived(
		TV_CAMERA_CLUSTERS.find((c) => c.id === clusterId)?.label ?? clusterId
	);
	const cameras = $derived(CAMERAS.filter((c) => c.tvCluster === clusterId));
</script>

<div class="h-full min-h-0 overflow-hidden flex flex-col p-2">
	<h2 class="text-lg font-bold leading-tight text-gray-100 mb-1.5 px-2 shrink-0">{clusterLabel}</h2>
	<div class="flex-1 grid min-h-0 grid-cols-4 grid-rows-2 gap-1.5 overflow-hidden">
		{#each cameras as cam (cam.id)}
			{#if cam.type === 'image'}
				<div class="min-h-0 min-w-0 overflow-hidden"><TvCameraTile {cam} /></div>
			{:else}
				<div class="relative min-h-0 min-w-0 overflow-hidden rounded bg-gray-800">
					<iframe
						src={cam.url}
						title={cam.name}
						class="block h-full w-full border-0"
						loading="eager"
						allow="autoplay"
					></iframe>
					<div
						class="absolute top-0 left-0 right-0 flex justify-between items-start p-1.5 pointer-events-none"
					>
						<span class="text-xs font-medium text-white bg-black/60 px-1.5 py-0.5 rounded"
							>{cam.name}</span
						>
						<span class="text-xs text-gray-300 bg-black/60 px-1.5 py-0.5 rounded"
							>{cam.location}</span
						>
					</div>
				</div>
			{/if}
		{/each}
	</div>
</div>
