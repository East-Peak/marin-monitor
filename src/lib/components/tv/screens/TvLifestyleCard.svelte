<script lang="ts">
	import type { WineIndexData, WineCategory } from '$lib/types/wine';
	import type { FitnessData, FitnessType } from '$lib/types/fitness';

	interface Props {
		wine: WineIndexData | null;
		fitness: FitnessData | null;
	}
	let { wine, fitness }: Props = $props();

	const wineCategoryLabels: Record<WineCategory, string> = {
		'napa-sonoma': 'Napa/Sonoma Cab',
		burgundy: 'Burgundy',
		champagne: 'Champagne'
	};

	const fitnessTypeLabels: Record<FitnessType, string> = {
		yoga: 'Yoga',
		pilates: 'Pilates',
		cycling: 'Cycling',
		crossfit: 'CrossFit',
		hiit: 'HIIT'
	};

	const fitnessTypes: FitnessType[] = ['yoga', 'pilates', 'cycling', 'crossfit', 'hiit'];

	function fmtPrice(n: number | null | undefined): string {
		if (n == null) return '—';
		return '$' + n.toFixed(0);
	}
</script>

<div class="h-full flex flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Lifestyle</h2>

	<div class="mt-6 grid flex-1 grid-cols-2 gap-6">
		<!-- Wine Index -->
		<div class="rounded-xl bg-zinc-800/60 p-6">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Wine Index</p>
			<div class="mt-4 space-y-4">
				{#each wine?.current?.categories ?? [] as cat}
					<div class="flex items-baseline justify-between">
						<span class="text-base text-zinc-300">
							{wineCategoryLabels[cat.category] ?? cat.label}
						</span>
						<span class="text-2xl font-bold tabular-nums text-white">
							{fmtPrice(cat.medianPrice)}
						</span>
					</div>
				{/each}
				{#if !wine?.current?.categories?.length}
					<p class="text-sm text-zinc-500">—</p>
				{/if}
			</div>
		</div>

		<!-- Fitness Drop-in -->
		<div class="rounded-xl bg-zinc-800/60 p-6">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Fitness Drop-in</p>
			<div class="mt-4 space-y-4">
				{#each fitnessTypes as ft}
					<div class="flex items-baseline justify-between">
						<span class="text-base text-zinc-300">{fitnessTypeLabels[ft]}</span>
						<span class="text-2xl font-bold tabular-nums text-white">
							{fmtPrice(fitness?.current?.medianByType?.[ft])}
						</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
