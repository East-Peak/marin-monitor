<!-- src/lib/components/tv/TvChyron.svelte -->
<script lang="ts">
  import { tvTickerItems } from '$lib/stores/tv';
  import { CATEGORY_COLORS, type TickerCategory } from '$lib/config/tv';
  import { timeAgo } from '$lib/utils';

  function badgeBg(badge: TickerCategory): string {
    const hex = CATEGORY_COLORS[badge] ?? '#a3a3a3';
    return `${hex}33`; // 20% opacity
  }

  const items = $derived($tvTickerItems);
</script>

<div class="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 border-t border-gray-700/50">
  <div class="overflow-hidden" style="height: 44px;">
    <div class="chyron-track flex items-center gap-12 whitespace-nowrap px-4 h-full">
      {#each [...items, ...items] as item, i (item.id + '-' + i)}
        <div class="flex items-center gap-2 shrink-0">
          <span
            class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold tracking-wide"
            style="background: {badgeBg(item.badge)}; color: {CATEGORY_COLORS[item.badge]}"
          >
            {item.badge}
          </span>
          <span class="text-sm text-gray-200">{item.text}</span>
          <span class="text-xs text-gray-500">{timeAgo(item.timestamp)}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .chyron-track {
    animation: chyron-scroll 60s linear infinite;
  }
  .chyron-track:hover {
    animation-play-state: paused;
  }
  @keyframes chyron-scroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
</style>
