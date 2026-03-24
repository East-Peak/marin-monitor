<script lang="ts">
	import { outdoorsNews, civicNews } from '$lib/stores';
	import TvAutoScroll from '$lib/components/tv/TvAutoScroll.svelte';

	const outdoorItems = $derived($outdoorsNews.items.slice(0, 12));
	const civicItems = $derived($civicNews.items.slice(0, 12));

	function relativeTime(ts: number): string {
		const diff = Math.floor((Date.now() - ts) / 1000);
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return `${Math.floor(diff / 86400)}d ago`;
	}
</script>

<div class="h-full flex flex-col p-4 gap-3">
	<div class="flex gap-6 shrink-0">
		<h2 class="text-xl font-bold text-gray-100 flex-1">Outdoors & Lifestyle</h2>
		<h2 class="text-xl font-bold text-gray-100 flex-1">Civic</h2>
	</div>
	<div class="flex-1 min-h-0">
		<TvAutoScroll>
			<div class="grid grid-cols-2 gap-x-6 gap-y-2">
				{#each Array(Math.max(outdoorItems.length, civicItems.length)) as _, i}
					<div>
						{#if outdoorItems[i]}
							<div class="bg-gray-800/60 rounded-lg p-2.5 border border-gray-700/50">
								<h3 class="text-sm font-medium text-gray-100 line-clamp-2">{outdoorItems[i].title}</h3>
								<div class="flex items-center gap-2 mt-1">
									<span class="text-[10px] text-gray-400">{outdoorItems[i].source}</span>
									<span class="text-[10px] text-gray-500">{relativeTime(outdoorItems[i].timestamp)}</span>
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
									<span class="text-[10px] text-gray-500">{relativeTime(civicItems[i].timestamp)}</span>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</TvAutoScroll>
	</div>
</div>
