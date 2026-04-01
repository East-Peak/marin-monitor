<script lang="ts">
  import { localNews } from '$lib/stores';
  import TvScroller from '$lib/components/tv/TvScroller.svelte';
  import { timeAgo } from '$lib/utils';

  interface Props {
    active?: boolean;
  }
  let { active = true }: Props = $props();

  const items = $derived($localNews.items.slice(0, 16));
</script>

<div class="h-full flex flex-col p-6">
  <h2 class="text-2xl font-bold text-gray-100 mb-4 shrink-0">Local News Wire</h2>
  <div class="flex-1 min-h-0">
    <TvScroller screenId="news-wire" {active}>
      <div class="grid grid-cols-2 gap-4">
        {#each items as item, i (item.id + '-' + i)}
          <div class="bg-gray-800/60 rounded-lg p-4 border border-gray-700/50">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-medium px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                {item.source}
              </span>
              <span class="text-xs text-gray-500">{timeAgo(item.timestamp)}</span>
            </div>
            <h3 class="text-lg font-semibold text-gray-100 leading-snug line-clamp-3">{item.title}</h3>
            {#if item.description}
              <p class="text-sm text-gray-400 mt-1 line-clamp-2">{item.description}</p>
            {/if}
          </div>
        {/each}
      </div>
    </TvScroller>
  </div>
</div>
