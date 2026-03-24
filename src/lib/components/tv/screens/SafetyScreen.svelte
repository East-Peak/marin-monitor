<script lang="ts">
  import { safetyNews, alerts } from '$lib/stores';
  import CamerasPanel from '$lib/components/panels/CamerasPanel.svelte';

  const safetyItems = $derived($safetyNews.items.slice(0, 8));
  const activeAlerts = $derived($alerts.slice(0, 4));

  function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }
</script>

<div class="flex h-full gap-2 p-2">
  <div class="flex-1 min-w-0 overflow-y-auto p-4">
    <h2 class="text-2xl font-bold text-gray-100 mb-4">Crime & Safety</h2>
    {#if activeAlerts.length > 0}
      <div class="mb-4 space-y-2">
        {#each activeAlerts as alert (alert.id)}
          <div class="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
            <span class="text-xs font-bold text-red-400 uppercase">Alert</span>
            <p class="text-sm text-gray-200 mt-1">{alert.title}</p>
          </div>
        {/each}
      </div>
    {/if}
    <div class="space-y-3">
      {#each safetyItems as item (item.id)}
        <div class="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
          <div class="flex justify-between items-start">
            <h3 class="text-base font-medium text-gray-100 line-clamp-2">{item.title}</h3>
            <span class="text-xs text-gray-500 shrink-0 ml-2">{relativeTime(item.timestamp)}</span>
          </div>
          <span class="text-xs text-gray-400">{item.source}</span>
        </div>
      {/each}
    </div>
  </div>
  <div class="w-96 shrink-0">
    <CamerasPanel />
  </div>
</div>
