<script lang="ts">
	import type { NewsItem } from '$lib/types';
	import TvScroller from '../TvScroller.svelte';

	interface Props {
		items: NewsItem[];
		active?: boolean;
	}
	let { items, active = true }: Props = $props();

	const ORANGE = '#ff6b35';

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

	/** Map 311 categories to emoji-style icons for fallback cards */
	function categoryIcon(category: string): string {
		const lower = category.toLowerCase();
		if (lower.includes('pothole') || lower.includes('road')) return 'ROAD';
		if (lower.includes('graffiti')) return 'GRAFFITI';
		if (lower.includes('dumping') || lower.includes('trash')) return 'DUMPING';
		if (lower.includes('tree') || lower.includes('vegetation')) return 'TREE';
		if (lower.includes('sidewalk') || lower.includes('curb')) return 'SIDEWALK';
		if (lower.includes('sign')) return 'SIGN';
		if (lower.includes('light') || lower.includes('lamp')) return 'LIGHT';
		if (lower.includes('water') || lower.includes('drain')) return 'WATER';
		return '311';
	}
</script>

{#if photoItems.length === 0}
	<!-- Skip screen: no photos -->
{:else}
	<div class="h-full flex flex-col px-12 py-8">
		<!-- Header -->
		<div class="flex items-center gap-4">
			<h2 class="text-2xl font-bold uppercase tracking-widest" style="color: {ORANGE}">
				Fix It Marin
			</h2>
			<div
				class="rounded-full px-3 py-1 text-sm font-bold tabular-nums text-white"
				style="background: {ORANGE}"
			>
				{photoItems.length}
			</div>
			<div class="flex-1"></div>
			<span class="text-sm text-zinc-500">Recent reports with photos</span>
		</div>

		<div class="mt-5 flex-1 min-h-0">
			<TvScroller screenId="311-photos" {active} speed={25}>
				<div
					class="grid gap-5"
					style:grid-template-columns="repeat({colCount}, minmax(0, 1fr))"
				>
					{#each photoItems as item, i (item.id + '-' + i)}
						{@const parsed = parseTitle(item.title)}
						<div
							class="rounded-lg overflow-hidden shadow-lg"
							style="border-bottom: 3px solid {ORANGE}; background: rgba(39, 39, 42, 0.7);"
						>
							{#if failedIds.has(item.id)}
								<!-- Styled fallback when photo fails -->
								<div
									class="aspect-[4/3] w-full flex flex-col items-center justify-center relative overflow-hidden"
								>
									<!-- Gradient background -->
									<div
										class="absolute inset-0"
										style="background: linear-gradient(135deg, rgba(255, 107, 53, 0.25) 0%, rgba(255, 107, 53, 0.08) 100%);"
									></div>
									<div class="relative z-10 text-center px-4">
										<span class="text-sm font-bold uppercase tracking-widest" style="color: {ORANGE}">
											{categoryIcon(parsed.category)}
										</span>
										<p class="mt-3 text-xl font-bold text-white leading-snug">
											{parsed.category}
										</p>
										{#if parsed.street}
											<p class="mt-1 text-sm text-zinc-400">{parsed.street}</p>
										{/if}
									</div>
								</div>
							{:else}
								<!-- Photo with dark gradient overlay for text readability -->
								<div class="relative aspect-[4/3] w-full">
									<img
										src={item.imageUrl}
										alt={item.title}
										class="absolute inset-0 w-full h-full object-cover"
										loading="lazy"
										onerror={() => handleImgError(item.id)}
									/>
									<!-- Bottom gradient overlay -->
									<div
										class="absolute inset-x-0 bottom-0 h-1/3"
										style="background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%);"
									></div>
								</div>
							{/if}
							<div class="p-3">
								<p class="text-sm font-bold text-white">{parsed.category}</p>
								{#if parsed.street}
									<p class="text-xs text-zinc-400 mt-0.5">{parsed.street}</p>
								{/if}
								<div class="mt-1.5 flex items-center gap-2">
									{#if item.town}
										<span class="text-xs text-zinc-400">{item.town}</span>
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
