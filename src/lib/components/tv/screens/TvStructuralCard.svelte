<script lang="ts">
	import type { SchoolIndexData, School } from '$lib/types/school';
	import type { HousingMetric } from '$lib/api/marin/housing';
	import { LEVEL_LABELS } from '$lib/config/schools';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';

	interface Props {
		tuition: SchoolIndexData | null;
		housing: HousingMetric[];
	}
	let { tuition, housing }: Props = $props();

	const CYAN = '#0891b2';
	const HOUSING_BLUE = '#3b82f6';

	// --- Tuition helpers ---

	function fmtCurrency(n: number | null | undefined): string {
		if (n == null) return '--';
		return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	}

	function fmtTuitionK(n: number | null | undefined): string {
		if (n == null) return '--';
		return '$' + Math.round(n / 1000) + 'K';
	}

	const maxTuition = $derived(
		Math.max(...(tuition?.current?.tiers?.map((t) => t.avgTuition) ?? [1]), 1)
	);

	/** Sort schools by tuition descending, take top entries */
	const topSchools = $derived.by<School[]>(() => {
		if (!tuition?.current?.schools) return [];
		return [...tuition.current.schools].sort((a, b) => b.tuition - a.tuition).slice(0, 5);
	});

	const schoolCount = $derived(tuition?.current?.schools?.length ?? 0);

	/** Sparkline of cumulative K-12 cost over history */
	const k12Sparkline = $derived.by(() => {
		const history = tuition?.history;
		if (!history || history.length < 2) return null;
		const values = history.map((h) => h.cumulativeK12).filter((v) => v != null);
		if (values.length < 2) return null;
		const w = 200, h = 36;
		const x = scaleLinear().domain([0, values.length - 1]).range([0, w]);
		const y = scaleLinear()
			.domain([Math.min(...values) * 0.95, Math.max(...values) * 1.05])
			.range([h, 0]);
		const linePath = line<number>()
			.x((_, i) => x(i))
			.y((d) => y(d))
			.curve(curveMonotoneX)(values);
		const areaPath = area<number>()
			.x((_, i) => x(i))
			.y0(h)
			.y1((d) => y(d))
			.curve(curveMonotoneX)(values);
		return { linePath, areaPath, w, h };
	});

	// --- Housing helpers ---

	const latestHousing = $derived<HousingMetric | null>(
		housing.length > 0 ? housing[housing.length - 1] : null
	);

	const previousHousing = $derived<HousingMetric | null>(
		housing.length > 1 ? housing[housing.length - 2] : null
	);

	function housingDelta(
		current: number | null | undefined,
		previous: number | null | undefined
	): { text: string; color: string } | null {
		if (current == null || previous == null) return null;
		const diff = current - previous;
		if (Math.abs(diff) < 1) return null;
		const pct = previous !== 0 ? Math.round((diff / previous) * 1000) / 10 : 0;
		const sign = pct >= 0 ? '+' : '';
		const color = pct >= 0 ? 'text-emerald-400' : 'text-red-400';
		return { text: `${sign}${pct.toFixed(1)}%`, color };
	}

	const priceDelta = $derived(housingDelta(latestHousing?.medianPrice, previousHousing?.medianPrice));

	/** Sparkline of median price over 12 months */
	const housingSparkline = $derived.by(() => {
		if (housing.length < 2) return null;
		const values = housing.map((h) => h.medianPrice).filter((v): v is number => v != null);
		if (values.length < 2) return null;
		const w = 200, h = 36;
		const x = scaleLinear().domain([0, values.length - 1]).range([0, w]);
		const y = scaleLinear()
			.domain([Math.min(...values) * 0.95, Math.max(...values) * 1.05])
			.range([h, 0]);
		const linePath = line<number>()
			.x((_, i) => x(i))
			.y((d) => y(d))
			.curve(curveMonotoneX)(values);
		const areaPath = area<number>()
			.x((_, i) => x(i))
			.y0(h)
			.y1((d) => y(d))
			.curve(curveMonotoneX)(values);
		return { linePath, areaPath, w, h };
	});

	function fmtCompact(n: number | null | undefined): string {
		if (n == null) return '--';
		if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
		if (n >= 1_000) return '$' + Math.round(n / 1000) + 'K';
		return '$' + n.toFixed(0);
	}
</script>

<div class="h-full flex flex-col p-4">
	<h2 class="text-xl font-bold text-gray-100 mb-3 shrink-0">Structural Marin</h2>

	<div class="flex-1 grid grid-cols-2 gap-3 min-h-0">
		<!-- PRIVATE SCHOOL TUITION COLUMN -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Private School Tuition</span>
					<span class="text-[10px] text-zinc-500">{schoolCount} schools</span>
				</div>
			</div>

			<!-- Tier summary -->
			<div class="px-3 py-2 border-b border-gray-700/30">
				<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Tier Averages</div>
				{#each tuition?.current?.tiers ?? [] as tier}
					{@const barPct = (tier.avgTuition / maxTuition) * 100}
					<div class="mb-1.5">
						<div class="flex items-baseline justify-between mb-0.5">
							<span class="text-xs text-zinc-300">{tier.label}</span>
							<div class="flex items-baseline gap-2">
								<span class="text-[9px] tabular-nums text-zinc-500">
									{tier.pctOfMedianIncome.toFixed(0)}% income
								</span>
								<span class="text-sm font-bold tabular-nums text-zinc-100">
									{fmtTuitionK(tier.avgTuition)}
								</span>
							</div>
						</div>
						<div class="w-full h-1.5 rounded-full bg-zinc-700/40 overflow-hidden">
							<div
								class="h-full rounded-full"
								style="width: {barPct}%; background: {CYAN}; opacity: 0.6;"
							></div>
						</div>
					</div>
				{/each}
			</div>

			<!-- K-12 Cumulative -->
			{#if tuition?.current?.cumulativeK12 != null}
				<div class="px-3 py-2 border-b border-gray-700/30 bg-cyan-900/10">
					<div class="flex items-baseline justify-between">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">K-12 Cumulative</span>
						<span class="text-xl font-bold tabular-nums" style="color: {CYAN}">
							{fmtCurrency(tuition.current.cumulativeK12)}
						</span>
					</div>
				</div>
			{/if}

			<!-- Individual schools -->
			<div class="flex-1 px-3 py-2 overflow-hidden">
				<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Top Schools</div>
				{#each topSchools as school}
					<div class="flex items-center justify-between py-0.5">
						<div class="flex flex-col min-w-0 flex-1 mr-2">
							<span class="text-xs font-medium text-zinc-200 truncate">{school.name}</span>
							<div class="flex items-center gap-1">
								<span class="text-[9px] text-zinc-500">{school.town}</span>
								<span class="text-[8px] px-1 py-0 rounded bg-zinc-700/60 text-zinc-400">{LEVEL_LABELS[school.level]}</span>
							</div>
						</div>
						<span class="text-sm font-bold tabular-nums text-zinc-100 shrink-0">
							{fmtCurrency(school.tuition)}
						</span>
					</div>
				{/each}
			</div>

			<!-- K-12 Sparkline -->
			{#if k12Sparkline}
				<div class="px-3 pb-2">
					<svg
						viewBox="0 0 {k12Sparkline.w} {k12Sparkline.h}"
						class="w-full"
						style="height: 32px"
						preserveAspectRatio="none"
					>
						<path d={k12Sparkline.areaPath} fill={CYAN} opacity="0.12" />
						<path d={k12Sparkline.linePath} fill="none" stroke={CYAN} stroke-width="1.5" />
					</svg>
				</div>
			{/if}
		</div>

		<!-- HOUSING COLUMN -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Housing Market</span>
					<span class="text-[10px] text-zinc-500">Marin County</span>
				</div>
			</div>

			{#if latestHousing}
				<!-- Median price headline -->
				<div class="px-3 py-2 border-b border-gray-700/30">
					<div class="flex items-baseline gap-2">
						<span class="text-2xl font-bold tabular-nums" style="color: {HOUSING_BLUE}">
							{fmtCompact(latestHousing.medianPrice)}
						</span>
						<span class="text-[10px] text-zinc-500">median</span>
						{#if priceDelta}
							<span class="text-sm font-semibold tabular-nums {priceDelta.color}">
								{priceDelta.text}
							</span>
						{/if}
					</div>
				</div>

				<!-- Key metrics grid -->
				<div class="px-3 py-2 border-b border-gray-700/30">
					<div class="grid grid-cols-2 gap-2">
						<div class="bg-zinc-800/40 rounded px-2.5 py-1.5 border border-zinc-700/30">
							<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">$/sq ft</div>
							<div class="text-lg font-bold tabular-nums text-zinc-100 mt-0.5">
								{latestHousing.medianPpsf != null ? '$' + latestHousing.medianPpsf.toFixed(0) : '--'}
							</div>
						</div>
						<div class="bg-zinc-800/40 rounded px-2.5 py-1.5 border border-zinc-700/30">
							<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Active Listings</div>
							<div class="text-lg font-bold tabular-nums text-zinc-100 mt-0.5">
								{latestHousing.inventory ?? '--'}
							</div>
						</div>
						<div class="bg-zinc-800/40 rounded px-2.5 py-1.5 border border-zinc-700/30">
							<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Days on Market</div>
							<div class="text-lg font-bold tabular-nums text-zinc-100 mt-0.5">
								{latestHousing.daysOnMarket ?? '--'}
							</div>
						</div>
						<div class="bg-zinc-800/40 rounded px-2.5 py-1.5 border border-zinc-700/30">
							<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Homes Sold</div>
							<div class="text-lg font-bold tabular-nums text-zinc-100 mt-0.5">
								{latestHousing.homesSold ?? '--'}
								<span class="text-[9px] text-zinc-500 font-normal">/mo</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Monthly history table -->
				<div class="flex-1 px-3 py-2 overflow-hidden">
					<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">12-Month History</div>
					<div class="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-0.5">
						<!-- Header row -->
						<span class="text-[8px] font-semibold uppercase text-zinc-600">Month</span>
						<span class="text-[8px] font-semibold uppercase text-zinc-600 text-right">Median</span>
						<span class="text-[8px] font-semibold uppercase text-zinc-600 text-right">Sold</span>
						<span class="text-[8px] font-semibold uppercase text-zinc-600 text-right">DOM</span>
						{#each housing.slice(-8) as month}
							<span class="text-[10px] text-zinc-400">{month.month}</span>
							<span class="text-[10px] tabular-nums text-zinc-200 text-right font-medium">
								{fmtCompact(month.medianPrice)}
							</span>
							<span class="text-[10px] tabular-nums text-zinc-400 text-right">
								{month.homesSold ?? '--'}
							</span>
							<span class="text-[10px] tabular-nums text-zinc-400 text-right">
								{month.daysOnMarket ?? '--'}
							</span>
						{/each}
					</div>
				</div>

				<!-- Sparkline -->
				{#if housingSparkline}
					<div class="px-3 pb-2">
						<svg
							viewBox="0 0 {housingSparkline.w} {housingSparkline.h}"
							class="w-full"
							style="height: 36px"
							preserveAspectRatio="none"
						>
							<path d={housingSparkline.areaPath} fill={HOUSING_BLUE} opacity="0.12" />
							<path d={housingSparkline.linePath} fill="none" stroke={HOUSING_BLUE} stroke-width="1.5" />
						</svg>
					</div>
				{/if}
			{:else}
				<div class="flex-1 flex items-center justify-center">
					<p class="text-[10px] text-zinc-600">Housing data loading...</p>
				</div>
			{/if}

			<!-- Attribution -->
			<div class="px-3 pb-2 text-[8px] text-zinc-600 text-center">
				County-level data via Redfin
			</div>
		</div>
	</div>
</div>
