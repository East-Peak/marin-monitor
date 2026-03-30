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
  let failedCameraIds = $state(new Set<string>());
  let refreshTimers: ReturnType<typeof setInterval>[] = [];

  function markCameraForRetry(cameraId: string) {
    if (!failedCameraIds.has(cameraId)) return;
    const next = new Set(failedCameraIds);
    next.delete(cameraId);
    failedCameraIds = next;
  }

  function markCameraFailed(cameraId: string) {
    if (failedCameraIds.has(cameraId)) return;
    failedCameraIds = new Set([...failedCameraIds, cameraId]);
  }

  onMount(() => {
    for (const cam of cameras) {
      if (cam.type === 'image' && cam.refreshInterval) {
        timestamps[cam.id] = Date.now();
        const timer = setInterval(() => {
          timestamps[cam.id] = Date.now();
          markCameraForRetry(cam.id);
        }, cam.refreshInterval * 1000);
        refreshTimers.push(timer);
      }
    }
  });

  onDestroy(() => {
    refreshTimers.forEach(clearInterval);
  });

  function imageUrl(cam: typeof CAMERAS[0]): string {
    const ts = timestamps[cam.id];
    return ts ? `${cam.url}?t=${ts}` : cam.url;
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-slate-950 px-3 py-3">
  <div class="mb-3 flex items-end justify-between gap-3 px-1">
    <div>
      <div class="text-[10px] font-bold uppercase tracking-[0.32em] text-sky-300/80">Camera Cluster</div>
      <h2 class="mt-1 text-2xl font-bold text-slate-100">{clusterLabel}</h2>
    </div>
    <div class="rounded-full border border-slate-700/80 bg-slate-900/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
      {cameras.length} feeds
    </div>
  </div>

  <div class="grid min-h-0 flex-1 grid-cols-2 gap-3 xl:grid-cols-4">
    {#each cameras as cam (cam.id)}
      <div class="relative min-h-0 overflow-hidden rounded-[1.4rem] border border-slate-800/80 bg-slate-900 shadow-[0_20px_40px_rgba(2,6,23,0.28)]">
        {#if cam.type === 'image'}
          <img
            src={imageUrl(cam)}
            alt={cam.name}
            class="h-full w-full object-cover"
            loading="eager"
            onload={() => markCameraForRetry(cam.id)}
            onerror={() => markCameraFailed(cam.id)}
          />
        {:else if cam.type === 'iframe'}
          <iframe
            src={cam.url}
            title={cam.name}
            class="h-full w-full border-0"
            loading="eager"
            allow="autoplay"
          ></iframe>
        {/if}

        <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/92 via-slate-950/12 to-transparent"></div>

        {#if cam.type === 'image' && failedCameraIds.has(cam.id)}
          <div class="camera-offline-fallback">
            <div class="rounded-2xl border border-rose-500/25 bg-slate-950/85 px-4 py-3 text-center shadow-[0_12px_30px_rgba(2,6,23,0.45)]">
              <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-rose-300">Offline</div>
              <div class="mt-1 text-sm text-slate-200">Latest image unavailable</div>
            </div>
          </div>
        {/if}

        <div class="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between gap-2 p-3">
          <span class="rounded-full border border-slate-700/70 bg-slate-950/78 px-2.5 py-1 text-xs font-semibold text-slate-100">
            {cam.name}
          </span>
          <span class="rounded-full border border-slate-700/60 bg-slate-950/72 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
            {cam.location}
          </span>
        </div>

        <div class="pointer-events-none absolute bottom-0 left-0 right-0 flex items-end justify-between gap-2 p-3">
          <div class="rounded-full border border-slate-700/70 bg-slate-950/78 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
            {cam.source}
          </div>
          {#if cam.type === 'image' && cam.refreshInterval}
            <div class="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-sky-200">
              Refresh {cam.refreshInterval}s
            </div>
          {/if}
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
