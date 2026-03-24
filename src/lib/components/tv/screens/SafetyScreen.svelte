<script lang="ts">
	import { safetyNews, alerts } from '$lib/stores';
	import TvAutoScroll from '$lib/components/tv/TvAutoScroll.svelte';
	import { timeAgo } from '$lib/utils';

	const safetyItems = $derived($safetyNews.items.slice(0, 20));
	const activeAlerts = $derived($alerts.slice(0, 4));
</script>

<div class="h-full flex flex-col p-4 gap-3">
	<h2 class="text-xl font-bold text-gray-100 shrink-0">Crime & Safety</h2>

	{#if activeAlerts.length > 0}
		<div class="flex gap-2 shrink-0 overflow-x-auto">
			{#each activeAlerts as alert (alert.id)}
				<div class="bg-red-900/30 border border-red-700/50 rounded px-3 py-2 shrink-0 max-w-sm">
					<span class="text-[10px] font-bold text-red-400 uppercase">Alert</span>
					<p class="text-xs text-gray-200 mt-0.5 line-clamp-1">{alert.title}</p>
				</div>
			{/each}
		</div>
	{/if}

	<div class="flex-1 min-h-0">
		<TvAutoScroll>
			<div class="grid grid-cols-2 gap-2">
				{#each safetyItems as item (item.id)}
					<div class="bg-gray-800/60 rounded-lg p-2.5 border border-gray-700/50">
						<div class="flex justify-between items-start">
							<h3 class="text-sm font-medium text-gray-100 line-clamp-2">{item.title}</h3>
							<span class="text-[10px] text-gray-500 shrink-0 ml-2">{timeAgo(item.timestamp)}</span>
						</div>
						<span class="text-[10px] text-gray-400">{item.source}</span>
					</div>
				{/each}
			</div>
		</TvAutoScroll>
	</div>
</div>
