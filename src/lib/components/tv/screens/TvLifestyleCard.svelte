<script lang="ts">
	import type { WineIndexData, WineCategory, WineCategorySnapshot, WineStaffPick } from '$lib/types/wine';
	import type { FitnessData, FitnessStudio, FitnessType } from '$lib/types/fitness';
	import { WINE_ACCENT, WINE_CATEGORY_ORDER } from '$lib/config/wine';
	import { FITNESS_ACCENT, TYPE_ORDER, TYPE_LABELS, TYPE_COLORS, computeMedian } from '$lib/config/fitness';
	import { scaleLinear } from 'd3-scale';
	import { line, curveMonotoneX } from 'd3-shape';

	interface Props {
		wine: WineIndexData | null;
		fitness: FitnessData | null;
	}
	let { wine, fitness }: Props = $props();

	// --- Wine helpers ---

	const wineCategoryLabels: Record<WineCategory, string> = {
		'napa-sonoma': 'Napa/Sonoma Cab',
		burgundy: 'Burgundy',
		champagne: 'Champagne'
	};

	const orderedCategories = $derived.by<WineCategorySnapshot[]>(() => {
		if (!wine?.current) return [];
		const result: WineCategorySnapshot[] = [];
		for (const cat of WINE_CATEGORY_ORDER) {
			const snap = wine.current.categories.find((c) => c.category === cat);
			if (snap) result.push(snap);
		}
		return result;
	});

	function computeWeeklyChange(category: WineCategory): { value: number; label: string } | null {
		const history = wine?.history;
		if (!history || history.length < 2) return null;
		const sorted = [...history].sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
		const latest = sorted[sorted.length - 1].categories.find((c) => c.category === category);
		const previous = sorted[sorted.length - 2].categories.find((c) => c.category === category);
		if (!latest?.medianPrice || !previous?.medianPrice) return null;
		const diff = Math.round((latest.medianPrice - previous.medianPrice) * 100) / 100;
		const pct = previous.medianPrice !== 0 ? Math.round((diff / previous.medianPrice) * 1000) / 10 : 0;
		return { value: diff, label: `${diff >= 0 ? '+' : ''}${pct.toFixed(1)}%` };
	}

	function makeWineSparkline(
		category: WineCategory
	): { linePath: string | null; w: number; h: number } | null {
		const history = wine?.history;
		if (!history || history.length < 2) return null;
		const sorted = [...history].sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
		const values = sorted
			.map((h) => h.categories.find((c) => c.category === category)?.medianPrice)
			.filter((v): v is number => v != null);
		if (values.length < 2) return null;
		const w = 100, h = 28;
		const x = scaleLinear().domain([0, values.length - 1]).range([2, w - 2]);
		const y = scaleLinear()
			.domain([Math.min(...values) * 0.9, Math.max(...values) * 1.1])
			.range([h - 2, 2]);
		const linePath = line<number>()
			.x((_, i) => x(i))
			.y((d) => y(d))
			.curve(curveMonotoneX)(values);
		return { linePath, w, h };
	}

	const totalWineProducts = $derived(
		wine?.current?.categories?.reduce((sum, c) => sum + c.productCount, 0) ?? 0
	);

	const staffPicks = $derived<WineStaffPick[]>(wine?.current?.staffPicks ?? []);

	// --- Fitness helpers ---

	const fitnessStudios = $derived.by<FitnessStudio[]>(() => {
		if (!fitness?.current?.studios) return [];
		return [...fitness.current.studios].sort((a, b) => a.dropInPrice - b.dropInPrice);
	});

	const studioCount = $derived(fitness?.current?.studioCount ?? 0);

	const filteredMedianByType = $derived.by<Partial<Record<FitnessType, number>>>(() => {
		const result: Partial<Record<FitnessType, number>> = {};
		if (!fitness?.current?.studios) return result;
		for (const type of TYPE_ORDER) {
			const prices = fitness.current.studios
				.filter((s) => s.type === type)
				.map((s) => s.dropInPrice);
			const median = computeMedian(prices);
			if (median !== null) result[type] = median;
		}
		return result;
	});

	const studioCountByType = $derived.by<Partial<Record<FitnessType, number>>>(() => {
		const result: Partial<Record<FitnessType, number>> = {};
		if (!fitness?.current?.studios) return result;
		for (const type of TYPE_ORDER) {
			const count = fitness.current.studios.filter((s) => s.type === type).length;
			if (count > 0) result[type] = count;
		}
		return result;
	});

	function fmtPrice(n: number | null | undefined, decimals = 0): string {
		if (n == null) return '--';
		return '$' + n.toFixed(decimals);
	}
</script>

<div class="h-full flex flex-col overflow-hidden px-6 py-3">
	<h2 class="text-base font-semibold text-gray-100 mb-2 shrink-0">Lifestyle</h2>

	<div class="flex-1 grid grid-cols-2 gap-3 min-h-0">
		<!-- WINE INDEX COLUMN -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Wine Index</span>
					<span class="text-[10px] text-zinc-500">{totalWineProducts} bottles tracked</span>
				</div>
			</div>

			<!-- Category cards -->
			<div class="px-3 py-2 space-y-2 border-b border-gray-700/30">
				{#each orderedCategories as cat}
					{@const sparkline = makeWineSparkline(cat.category)}
					{@const change = computeWeeklyChange(cat.category)}
					<div class="flex items-center gap-2 bg-zinc-800/40 rounded px-2.5 py-1.5 border border-zinc-700/30">
						<div class="flex-1 min-w-0">
							<div class="flex items-baseline gap-1.5">
								<span class="text-xs font-semibold text-zinc-200">
									{wineCategoryLabels[cat.category]}
								</span>
								<span class="text-[9px] text-zinc-500">{cat.productCount} wines</span>
							</div>
							<div class="flex items-baseline gap-1.5 mt-0.5">
								<span class="text-lg font-bold tabular-nums" style="color: {WINE_ACCENT}">
									{fmtPrice(cat.medianPrice)}
								</span>
								<span class="text-[9px] text-zinc-500">median</span>
								{#if change}
									<span class="text-[10px] font-semibold {change.value > 0 ? 'text-amber-400' : 'text-emerald-400'}">
										{change.label}
									</span>
								{/if}
							</div>
						</div>
						{#if sparkline}
							<svg
								width={sparkline.w}
								height={sparkline.h}
								viewBox="0 0 {sparkline.w} {sparkline.h}"
								class="shrink-0"
							>
								<path
									d={sparkline.linePath}
									fill="none"
									stroke={WINE_ACCENT}
									stroke-width="1.5"
									opacity="0.7"
								/>
							</svg>
						{/if}
					</div>
				{/each}
				{#if orderedCategories.length === 0}
					<p class="text-[10px] text-zinc-600">No wine data</p>
				{/if}
			</div>

			<!-- Staff Picks -->
			<div class="flex-1 px-3 py-2 overflow-hidden">
				<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Staff Picks</div>
				{#each staffPicks.slice(0, 4) as pick}
					<div class="flex items-center justify-between py-0.5">
						<div class="flex flex-col min-w-0 flex-1 mr-2">
							<span class="text-xs font-medium text-zinc-200 truncate">{pick.title}</span>
							<span class="text-[9px] text-zinc-500 truncate">{pick.vendor}</span>
						</div>
						<div class="flex items-center gap-1 shrink-0">
							{#if pick.compareAtPrice}
								<span class="text-[9px] text-zinc-600 line-through">${pick.compareAtPrice.toFixed(0)}</span>
							{/if}
							<span class="text-xs font-bold tabular-nums {pick.compareAtPrice ? 'text-emerald-400' : 'text-zinc-100'}">
								${pick.price.toFixed(0)}
							</span>
							{#if !pick.available}
								<span class="text-[8px] font-semibold uppercase px-1 py-0.5 rounded bg-amber-500/15 text-amber-400">Out</span>
							{/if}
						</div>
					</div>
				{/each}
				{#if staffPicks.length === 0}
					<p class="text-[10px] text-zinc-600">No staff picks available</p>
				{/if}
			</div>

			<!-- Attribution -->
			<div class="shrink-0 px-3 pb-1 text-[8px] text-zinc-600 text-center">
				Data via PlumpJack Wine & Spirits
			</div>
		</div>

		<!-- FITNESS DROP-IN COLUMN -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Fitness Drop-in</span>
					<span class="text-[10px] text-zinc-500">{studioCount} studios</span>
				</div>
				{#if fitness?.current}
					<div class="flex items-baseline gap-3 mt-1">
						<div class="flex items-baseline gap-1">
							<span class="text-lg font-bold tabular-nums" style="color: {FITNESS_ACCENT}">
								{fmtPrice(fitness.current.medianPrice)}
							</span>
							<span class="text-[9px] text-zinc-500">median</span>
						</div>
						{#if fitness.current.minPrice != null}
							<div class="flex items-baseline gap-1">
								<span class="text-sm font-semibold tabular-nums text-emerald-400">
									{fmtPrice(fitness.current.minPrice)}
								</span>
								<span class="text-[9px] text-zinc-500">low</span>
							</div>
						{/if}
						{#if fitness.current.maxPrice != null}
							<div class="flex items-baseline gap-1">
								<span class="text-sm font-semibold tabular-nums text-amber-400">
									{fmtPrice(fitness.current.maxPrice)}
								</span>
								<span class="text-[9px] text-zinc-500">high</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Type summary -->
			<div class="px-3 py-2 border-b border-gray-700/30">
				<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">By Type</div>
				<div class="space-y-1">
					{#each TYPE_ORDER as type}
						{@const median = filteredMedianByType[type]}
						{@const count = studioCountByType[type]}
						{#if median != null}
							<div class="flex items-center gap-2">
								<span class="w-2 h-2 rounded-full shrink-0" style="background: {TYPE_COLORS[type]}"></span>
								<span class="text-xs text-zinc-300 flex-1">{TYPE_LABELS[type]}</span>
								<span class="text-[9px] text-zinc-500 mr-1">{count ?? 0}</span>
								<span class="text-sm font-bold tabular-nums text-zinc-100">{fmtPrice(median)}</span>
							</div>
						{/if}
					{/each}
				</div>
			</div>

			<!-- Individual studios -->
			<div class="flex-1 px-3 py-2 overflow-hidden">
				<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Studios (cheapest first)</div>
				{#each fitnessStudios.slice(0, 6) as studio}
					<div class="flex items-center justify-between py-0.5">
						<div class="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
							<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background: {TYPE_COLORS[studio.type]}"></span>
							<div class="flex flex-col min-w-0 flex-1">
								<span class="text-xs font-medium text-zinc-200 truncate">{studio.name}</span>
								<span class="text-[9px] text-zinc-500 truncate">{studio.town}</span>
							</div>
						</div>
						<span class="text-sm font-bold tabular-nums text-zinc-100 shrink-0">
							{fmtPrice(studio.dropInPrice)}
						</span>
					</div>
				{/each}
				{#if fitnessStudios.length === 0}
					<p class="text-[10px] text-zinc-600">No fitness data</p>
				{/if}
			</div>
		</div>
	</div>
</div>
