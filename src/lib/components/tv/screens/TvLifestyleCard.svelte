<script lang="ts">
	import type { WineIndexData, WineCategory } from '$lib/types/wine';
	import type { FitnessData, FitnessType } from '$lib/types/fitness';
	import { scaleLinear } from 'd3-scale';
	import { line, curveMonotoneX } from 'd3-shape';

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

	/** Mini sparkline for a wine category's median price over history */
	function makeWineSparkline(
		category: WineCategory
	): { linePath: string | null; w: number; h: number } | null {
		const history = wine?.history;
		if (!history || history.length < 2) return null;
		const values = history
			.map((h) => h.categories.find((c) => c.category === category)?.medianPrice)
			.filter((v): v is number => v != null);
		if (values.length < 2) return null;
		const w = 120,
			h = 36;
		const x = scaleLinear().domain([0, values.length - 1]).range([0, w]);
		const y = scaleLinear()
			.domain([Math.min(...values) * 0.9, Math.max(...values) * 1.1])
			.range([h, 0]);
		const linePath = line<number>()
			.x((_, i) => x(i))
			.y((d) => y(d))
			.curve(curveMonotoneX)(values);
		return { linePath, w, h };
	}

	/** Total product count across wine categories */
	const totalWineProducts = $derived(
		wine?.current?.categories?.reduce((sum, c) => sum + c.productCount, 0) ?? 0
	);

	/** Staff picks count */
	const staffPickCount = $derived(wine?.current?.staffPicks?.length ?? 0);

	/** Studio count from current fitness snapshot */
	const studioCount = $derived(fitness?.current?.studioCount ?? 0);

	/** Fitness price range bars — compute min and max across all types for the scale */
	const fitnessBarData = $derived.by(() => {
		if (!fitness?.current) return null;
		const current = fitness.current;
		const allPrices: number[] = [];

		// Gather all per-type medians to find the global range
		for (const ft of fitnessTypes) {
			const median = current.medianByType?.[ft];
			if (median != null) allPrices.push(median);
		}

		// Also use the studio-level data for true min/max per type if available
		const byType: Record<
			string,
			{ min: number; max: number; median: number }
		> = {};
		for (const ft of fitnessTypes) {
			const studios = current.studios?.filter((s) => s.type === ft) ?? [];
			const prices = studios.map((s) => s.dropInPrice).filter((p) => p > 0);
			const median = current.medianByType?.[ft];
			if (prices.length > 0 && median != null) {
				byType[ft] = {
					min: Math.min(...prices),
					max: Math.max(...prices),
					median
				};
				allPrices.push(...prices);
			} else if (median != null) {
				byType[ft] = { min: median, max: median, median };
			}
		}

		if (allPrices.length === 0) return null;
		const globalMin = Math.min(...allPrices);
		const globalMax = Math.max(...allPrices);
		return { byType, globalMin, globalMax };
	});
</script>

<div class="h-full flex flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Lifestyle</h2>

	<div class="mt-4 grid flex-1 grid-cols-2 gap-6">
		<!-- Wine Index -->
		<div class="rounded-xl bg-zinc-800/60 flex flex-col overflow-hidden">
			<!-- Header with accent underline -->
			<div class="px-6 pt-5 pb-3">
				<div class="flex items-baseline justify-between">
					<p class="text-base font-medium uppercase tracking-wider text-zinc-300">
						Wine Index
					</p>
					<div class="flex gap-4 text-sm text-zinc-500">
						{#if totalWineProducts > 0}
							<span>{totalWineProducts} bottles tracked</span>
						{/if}
						{#if staffPickCount > 0}
							<span>{staffPickCount} staff picks</span>
						{/if}
					</div>
				</div>
				<div class="mt-2 h-0.5 w-full" style="background: #7c3aed"></div>
			</div>

			<!-- Wine categories -->
			<div class="flex-1 flex flex-col justify-center px-6 pb-5 gap-5">
				{#each wine?.current?.categories ?? [] as cat}
					{@const sparkline = makeWineSparkline(cat.category)}
					<div class="flex items-center gap-4">
						<!-- Label + count -->
						<div class="w-44 shrink-0">
							<p class="text-lg text-zinc-200">
								{wineCategoryLabels[cat.category] ?? cat.label}
							</p>
							<p class="text-sm text-zinc-500">{cat.productCount} bottles</p>
						</div>

						<!-- Sparkline -->
						<div class="flex-1 flex items-center justify-center">
							{#if sparkline}
								<svg
									viewBox="0 0 {sparkline.w} {sparkline.h}"
									class="w-full h-9"
									preserveAspectRatio="none"
								>
									<path
										d={sparkline.linePath}
										fill="none"
										stroke="#7c3aed"
										stroke-width="2"
										opacity="0.7"
									/>
								</svg>
							{/if}
						</div>

						<!-- Price + range -->
						<div class="text-right shrink-0 w-32">
							<p class="text-3xl font-bold tabular-nums text-white">
								{fmtPrice(cat.medianPrice)}
							</p>
							{#if cat.minPrice != null && cat.maxPrice != null}
								<p class="text-sm text-zinc-500 tabular-nums">
									{fmtPrice(cat.minPrice)}–{fmtPrice(cat.maxPrice)}
								</p>
							{/if}
						</div>
					</div>
				{/each}
				{#if !wine?.current?.categories?.length}
					<p class="text-base text-zinc-500">No wine data</p>
				{/if}
			</div>
		</div>

		<!-- Fitness Drop-in -->
		<div class="rounded-xl bg-zinc-800/60 flex flex-col overflow-hidden">
			<!-- Header with accent underline -->
			<div class="px-6 pt-5 pb-3">
				<div class="flex items-baseline justify-between">
					<p class="text-base font-medium uppercase tracking-wider text-zinc-300">
						Fitness Drop-in
					</p>
					{#if studioCount > 0}
						<span class="text-sm text-zinc-500">{studioCount} studios</span>
					{/if}
				</div>
				<div class="mt-2 h-0.5 w-full" style="background: #ec4899"></div>
			</div>

			<!-- Fitness types with horizontal bar chart -->
			<div class="flex-1 flex flex-col justify-center px-6 pb-5 gap-4">
				{#each fitnessTypes as ft}
					{@const median = fitness?.current?.medianByType?.[ft]}
					{@const barInfo = fitnessBarData?.byType[ft]}
					<div class="flex items-center gap-4">
						<!-- Label -->
						<div class="w-24 shrink-0">
							<p class="text-lg text-zinc-200">{fitnessTypeLabels[ft]}</p>
						</div>

						<!-- Horizontal bar (min—max range with median dot) -->
						<div class="flex-1 h-8 relative">
							{#if barInfo && fitnessBarData}
								{@const scale = scaleLinear()
									.domain([fitnessBarData.globalMin * 0.8, fitnessBarData.globalMax * 1.1])
									.range([0, 100])}
								{@const leftPct = scale(barInfo.min)}
								{@const rightPct = scale(barInfo.max)}
								{@const medianPct = scale(barInfo.median)}
								<!-- Track background -->
								<div class="absolute inset-0 rounded bg-zinc-700/30"></div>
								<!-- Range bar -->
								<div
									class="absolute top-1/2 -translate-y-1/2 h-3 rounded-full"
									style="left: {leftPct}%; width: {Math.max(rightPct - leftPct, 2)}%; background: #ec4899; opacity: 0.35;"
								></div>
								<!-- Median dot -->
								<div
									class="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-zinc-900"
									style="left: {medianPct}%; transform: translate(-50%, -50%); background: #ec4899;"
								></div>
							{:else}
								<div class="absolute inset-0 rounded bg-zinc-700/20"></div>
							{/if}
						</div>

						<!-- Price -->
						<div class="w-20 text-right shrink-0">
							<p class="text-2xl font-bold tabular-nums text-white">
								{fmtPrice(median)}
							</p>
						</div>
					</div>
				{/each}

				<!-- Overall median -->
				{#if fitness?.current?.medianPrice != null}
					<div class="mt-2 pt-3 border-t border-zinc-700/50 flex items-baseline justify-between">
						<span class="text-sm uppercase tracking-wider text-zinc-500">Overall Median</span>
						<span class="text-2xl font-bold tabular-nums" style="color: #ec4899">
							{fmtPrice(fitness.current.medianPrice)}
						</span>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
