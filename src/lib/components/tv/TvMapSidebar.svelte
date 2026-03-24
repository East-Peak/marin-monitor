<script lang="ts">
  import type { NewsItem } from '$lib/types';

  interface Props {
    regionLabel: string;
    weather: { temp: number; wind: string; shortForecast: string } | null;
    stories: NewsItem[];
    alerts: NewsItem[];
    loading: boolean;
  }

  let { regionLabel, weather, stories, alerts, loading }: Props = $props();

  function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
</script>

<div class="h-full flex flex-col bg-gray-900/95 border-l border-gray-700/50 overflow-y-auto">
  <div class="p-4 border-b border-gray-800/50">
    <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wide">{regionLabel}</h3>
    {#if loading}
      <p class="text-sm text-gray-500 mt-2">Loading weather...</p>
    {:else if weather}
      <div class="mt-2">
        <span class="text-3xl font-bold text-gray-100">{weather.temp}&deg;F</span>
        <p class="text-sm text-gray-300 mt-1">{weather.shortForecast}</p>
        <p class="text-xs text-gray-500">{weather.wind}</p>
      </div>
    {/if}
  </div>

  {#if alerts.length > 0}
    <div class="p-4 border-b border-gray-800/50 space-y-2">
      {#each alerts.slice(0, 3) as alert (alert.id)}
        <div class="bg-red-900/30 border border-red-700/50 rounded p-2">
          <span class="text-[10px] font-bold text-red-400 uppercase">Alert</span>
          <p class="text-xs text-gray-200 mt-0.5 line-clamp-2">{alert.title}</p>
        </div>
      {/each}
    </div>
  {/if}

  {#if stories.length > 0}
    <div class="p-4 flex-1 space-y-2">
      <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Nearby</h4>
      {#each stories.slice(0, 5) as item (item.id)}
        <div class="bg-gray-800/40 rounded p-2 border border-gray-700/30">
          <p class="text-sm text-gray-200 line-clamp-2">{item.title}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-[10px] text-gray-500">{item.source}</span>
            <span class="text-[10px] text-gray-600">{relativeTime(item.timestamp)}</span>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="p-4 flex-1">
      <p class="text-xs text-gray-600">No pinned stories in this area</p>
    </div>
  {/if}
</div>
