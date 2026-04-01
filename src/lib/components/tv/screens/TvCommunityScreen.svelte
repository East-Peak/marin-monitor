<script lang="ts">
	import { outdoorsNews, civicNews } from '$lib/stores';
	import TvScroller from '$lib/components/tv/TvScroller.svelte';
	import { timeAgo } from '$lib/utils';

	interface Props {
		active?: boolean;
	}
	let { active = true }: Props = $props();

	const outdoorItems = $derived($outdoorsNews.items.slice(0, 12));
	const civicItems = $derived($civicNews.items.slice(0, 12));
</script>

<div class="h-full flex flex-col p-4 gap-3">
	<div class="flex gap-6 shrink-0">
		<h2 class="text-xl font-bold text-gray-100 flex-1">Outdoors & Lifestyle</h2>
		<h2 class="text-xl font-bold text-gray-100 flex-1">Civic</h2>
	</div>
	<div class="flex-1 min-h-0">
		<TvScroller screenId="community" {active}>
			<div class="grid grid-cols-2 gap-x-6 gap-y-2">
				{#each Array(Math.max(outdoorItems.length, civicItems.length)) as _, i}
					<div>
						{#if outdoorItems[i]}
							<div class="bg-gray-800/60 rounded-lg p-2.5 border border-gray-700/50">
								<h3 class="text-sm font-medium text-gray-100 line-clamp-2">{outdoorItems[i].title}</h3>
								<div class="flex items-center gap-2 mt-1">
									<span class="text-[10px] text-gray-400">{outdoorItems[i].source}</span>
									<span class="text-[10px] text-gray-500">{timeAgo(outdoorItems[i].timestamp)}</span>
								</div>
							</div>
						{/if}
					</div>
					<div>
						{#if civicItems[i]}
							<div class="bg-gray-800/60 rounded-lg p-2.5 border border-gray-700/50">
								<h3 class="text-sm font-medium text-gray-100 line-clamp-2">{civicItems[i].title}</h3>
								<div class="flex items-center gap-2 mt-1">
									<span class="text-[10px] text-gray-400">{civicItems[i].source}</span>
									<span class="text-[10px] text-gray-500">{timeAgo(civicItems[i].timestamp)}</span>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</TvScroller>
	</div>
</div>
