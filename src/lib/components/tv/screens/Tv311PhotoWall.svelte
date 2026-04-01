<script lang="ts">
	import type { NewsItem } from '$lib/types';
	import TvScroller from '../TvScroller.svelte';

	interface Props {
		items: NewsItem[];
		active?: boolean;
	}
	let { items, active = true }: Props = $props();

	let failedIds = $state(new Set<string>());

	const photoItems = $derived(items.filter((it) => it.imageUrl));

	const colCount = $derived(
		photoItems.length < 3 ? 1 : photoItems.length < 6 ? 2 : 3
	);

	function timeAgo(ts: number): string {
		const diffMs = Date.now() - ts;
		const hours = Math.floor(diffMs / 3_600_000);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	function parseTitle(title: string): { category: string; street: string } {
		const parts = title.split(' \u00b7 ');
		return {
			category: parts[0]?.trim() ?? title,
			street: parts[1]?.trim() ?? ''
		};
	}

	function handleImgError(id: string) {
		failedIds = new Set([...failedIds, id]);
	}

	/** Map 311 categories to simple placeholder labels */
	function categoryIcon(category: string): string {
		const lower = category.toLowerCase();
		if (lower.includes('pothole') || lower.includes('road')) return 'Road';
		if (lower.includes('graffiti')) return 'Graffiti';
		if (lower.includes('dumping') || lower.includes('trash')) return 'Dumping';
		if (lower.includes('tree') || lower.includes('vegetation')) return 'Tree';
		if (lower.includes('sidewalk') || lower.includes('curb')) return 'Sidewalk';
		if (lower.includes('sign')) return 'Sign';
		if (lower.includes('light') || lower.includes('lamp')) return 'Light';
		if (lower.includes('water') || lower.includes('drain')) return 'Water';
		return '311';
	}
</script>

{#if photoItems.length === 0}
	<!-- Skip screen: no photos -->
{:else}
	<div class="h-full flex flex-col px-12 py-8">
		<div class="flex items-center gap-3">
			<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Fix It Marin</h2>
			<span class="rounded-full bg-zinc-700 px-2.5 py-0.5 text-xs font-medium tabular-nums text-zinc-300">
				{photoItems.length}
			</span>
		</div>

		<div class="mt-6 flex-1 min-h-0">
			<TvScroller screenId="311-photos" {active} speed={25}>
				<div
					class="grid gap-6"
					style:grid-template-columns="repeat({colCount}, minmax(0, 1fr))"
				>
					{#each photoItems as item, i (item.id + '-' + i)}
						{@const parsed = parseTitle(item.title)}
						<div class="rounded-xl bg-zinc-800/60 overflow-hidden">
							{#if failedIds.has(item.id)}
								<div class="aspect-[4/3] w-full flex flex-col items-center justify-center bg-zinc-700/40">
									<span class="text-4xl font-bold text-zinc-500">{categoryIcon(parsed.category)}</span>
									<p class="mt-2 text-xs text-zinc-500">Photo unavailable</p>
								</div>
							{:else}
								<img
									src={item.imageUrl}
									alt={item.title}
									class="aspect-[4/3] w-full object-cover"
									loading="lazy"
									onerror={() => handleImgError(item.id)}
								/>
							{/if}
							<div class="p-3">
								<p class="text-sm font-medium text-zinc-300">{parsed.category}</p>
								{#if parsed.street}
									<p class="text-xs text-zinc-500">{parsed.street}</p>
								{/if}
								<div class="mt-1 flex items-center gap-2">
									{#if item.town}
										<span class="text-xs text-zinc-500">{item.town}</span>
									{/if}
									<span class="text-xs text-zinc-600">{timeAgo(item.timestamp)}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</TvScroller>
		</div>
	</div>
{/if}
