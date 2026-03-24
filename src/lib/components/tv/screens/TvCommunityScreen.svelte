<script lang="ts">
  import { outdoorsNews, civicNews } from '$lib/stores';

  const outdoorItems = $derived($outdoorsNews.items.slice(0, 8));
  const civicItems = $derived($civicNews.items.slice(0, 8));

  function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
</script>

<div class="h-full p-6 overflow-hidden">
  <div class="grid grid-cols-2 gap-6 h-full">
    <div>
      <h2 class="text-2xl font-bold text-gray-100 mb-4">Outdoors & Lifestyle</h2>
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
    <div>
      <h2 class="text-2xl font-bold text-gray-100 mb-4">Civic</h2>
      <div class="space-y-3">
        {#each civicItems as item (item.id)}
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
</div>
