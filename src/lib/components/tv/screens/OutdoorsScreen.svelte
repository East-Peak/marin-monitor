<script lang="ts">
  import TidesPanel from '$lib/components/panels/TidesPanel.svelte';
  import ConditionsPanel from '$lib/components/panels/ConditionsPanel.svelte';
  import { outdoorsNews } from '$lib/stores';

  const outdoorItems = $derived($outdoorsNews.items.slice(0, 6));

  function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }
</script>

<div class="flex h-full gap-2 p-2">
  <div class="flex-1 min-w-0 flex flex-col gap-2">
    <div class="flex-1">
      <TidesPanel />
    </div>
    <div class="flex-1">
      <ConditionsPanel />
    </div>
  </div>
  <div class="w-96 shrink-0 overflow-y-auto p-4">
    <h2 class="text-xl font-bold text-gray-100 mb-3">Outdoors & Lifestyle</h2>
    <div class="space-y-3">
      {#each outdoorItems as item (item.id)}
        <div class="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
          <h3 class="text-base font-medium text-gray-100 line-clamp-2">{item.title}</h3>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs text-gray-400">{item.source}</span>
            <span class="text-xs text-gray-500">{relativeTime(item.timestamp)}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
