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

<div class="h-full flex flex-col overflow-hidden px-5 py-4">
	<h2 class="mb-3 shrink-0 text-[1.75rem] font-bold text-gray-100">Local News Wire</h2>
	<div class="flex-1 min-h-0">
		<TvScroller screenId="news-wire" {active} speed={34}>
			<div class="grid grid-cols-2 gap-3">
				{#each items as item, i (item.id + '-' + i)}
					<div class="rounded-lg border border-gray-700/50 bg-gray-800/60 p-3.5">
						<div class="mb-1.5 flex items-center gap-2">
							<span class="rounded bg-gray-700 px-2 py-0.5 text-[11px] font-medium text-gray-300">
								{item.source}
							</span>
							<span class="text-[11px] text-gray-500">{timeAgo(item.timestamp)}</span>
						</div>
						<h3 class="line-clamp-2 text-[1.05rem] font-semibold leading-snug text-gray-100">
							{item.title}
						</h3>
						{#if item.description}
							<p class="mt-1 text-[0.92rem] leading-snug text-gray-400 line-clamp-2">
								{item.description}
							</p>
						{/if}
					</div>
				{/each}
			</div>
		</TvScroller>
	</div>
</div>
