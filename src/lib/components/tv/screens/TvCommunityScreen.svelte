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

<div class="h-full flex flex-col overflow-hidden px-4 py-3 gap-2">
	<div class="flex gap-6 shrink-0">
		<h2 class="flex-1 text-[1.45rem] font-bold text-gray-100">Outdoors & Lifestyle</h2>
		<h2 class="flex-1 text-[1.45rem] font-bold text-gray-100">Civic</h2>
	</div>
	<div class="flex-1 min-h-0">
		<TvScroller screenId="community" {active} speed={34}>
			<div class="grid grid-cols-2 gap-x-4 gap-y-1.5">
				{#each Array(Math.max(outdoorItems.length, civicItems.length)) as _, i}
					<div>
						{#if outdoorItems[i]}
							<div class="rounded-lg border border-gray-700/50 bg-gray-800/60 p-2">
								<h3 class="line-clamp-2 text-[0.95rem] font-semibold text-gray-100">
									{outdoorItems[i].title}
								</h3>
								<div class="mt-0.5 flex items-center gap-2">
									<span class="text-[11px] text-gray-400">{outdoorItems[i].source}</span>
									<span class="text-[11px] text-gray-500">{timeAgo(outdoorItems[i].timestamp)}</span
									>
								</div>
							</div>
						{/if}
					</div>
					<div>
						{#if civicItems[i]}
							<div class="rounded-lg border border-gray-700/50 bg-gray-800/60 p-2">
								<h3 class="line-clamp-2 text-[0.95rem] font-semibold text-gray-100">
									{civicItems[i].title}
								</h3>
								<div class="mt-0.5 flex items-center gap-2">
									<span class="text-[11px] text-gray-400">{civicItems[i].source}</span>
									<span class="text-[11px] text-gray-500">{timeAgo(civicItems[i].timestamp)}</span>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</TvScroller>
	</div>
</div>
