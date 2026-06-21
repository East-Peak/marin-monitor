<script lang="ts">
	import type { CompositeData, CompositeCategory } from '$lib/types/composite';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';

	interface Props {
		data: CompositeData | null;
	}
	let { data }: Props = $props();

	const snapshot = $derived(data?.current ?? null);

	const categoryLabels: Record<CompositeCategory, string> = {
		'daily-life': 'Daily Life',
		lifestyle: 'Lifestyle',
		housing: 'Housing',
		structural: 'Structural'
	};

	const tierAccents: Record<CompositeCategory, string> = {
		'daily-life': '#f59e0b',
		lifestyle: '#7c3aed',
		housing: '#3b82f6',
		structural: '#6b7280'
	};

	function fmtDollars(n: number | null | undefined): string {
		if (n == null) return '—';
		return n.toLocaleString('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 0
		});
	}

	function fmtDollarsWhole(n: number | null | undefined): string {
		if (n == null) return '—';
		return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	}

	function fmtDelta(
		current: number | undefined,
		previous: number | undefined
	): { text: string; color: string } | null {
		if (current == null || previous == null) return null;
		const diff = current - previous;
		if (Math.abs(diff) < 0.5) return { text: '—', color: 'text-zinc-500' };
		const sign = diff > 0 ? '+' : '';
		const color = diff > 0 ? 'text-red-400' : 'text-emerald-400';
		return { text: `${sign}$${Math.round(Math.abs(diff))}`, color };
	}

	function fmtScoreDelta(
		current: number | undefined,
		previous: number | undefined
	): { text: string; color: string } | null {
		if (current == null || previous == null) return null;
		const diff = current - previous;
		if (Math.abs(diff) < 0.05) return { text: '—', color: 'text-zinc-500' };
		const sign = diff > 0 ? '+' : '';
		const color = diff > 0 ? 'text-red-400' : 'text-emerald-400';
		return { text: `${sign}${diff.toFixed(1)}`, color };
	}

	/** Sparkline for composite score over time */
	const heroSparkline = $derived.by(() => {
		const history = data?.history;
		if (!history || history.length < 2) return null;
		const values = history.map((h) => h.compositeScore).filter((v) => v != null && v > 0);
		if (values.length < 2) return null;
		const w = 280,
			h = 60;
		const x = scaleLinear()
			.domain([0, values.length - 1])
			.range([0, w]);
		const y = scaleLinear()
			.domain([Math.min(...values) * 0.97, Math.max(...values) * 1.03])
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

	/** Get previous snapshot for delta calculations */
	const prevSnapshot = $derived(data?.history?.[1] ?? null);

	const marinNumberDelta = $derived(
		fmtDelta(snapshot?.marinNumber.total, prevSnapshot?.marinNumber.total)
	);

	const compositeScoreDelta = $derived(
		fmtScoreDelta(snapshot?.compositeScore, prevSnapshot?.compositeScore)
	);

	function getPreviousTierTotal(category: CompositeCategory): number | undefined {
		return prevSnapshot?.tiers.find((t) => t.category === category)?.monthlyTotal;
	}

	/** Clamp bar width for tier score visualization (score is base-100) */
	function tierBarWidth(score: number): number {
		// Score of 100 = baseline. Scale to percentage of bar width.
		// Cap at 150 for display, show at least 5% for low scores.
		return Math.max(5, Math.min(100, (score / 150) * 100));
	}
</script>

{#if !snapshot}
	<div class="h-full flex items-center justify-center">
		<p class="text-lg text-zinc-500">Loading cost data...</p>
	</div>
{:else}
	<div class="h-full flex flex-col overflow-hidden px-6 py-3">
		<h2 class="text-base font-semibold text-gray-100 mb-2 shrink-0">Cost of Being Marin</h2>

		<div class="flex-1 grid grid-cols-3 gap-3 min-h-0">
			<!-- LEFT COLUMN: Marin Number Hero -->
			<div
				class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden"
			>
				<!-- Hero header -->
				<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
					<div class="flex items-baseline justify-between">
						<span class="text-[10px] font-semibold uppercase tracking-wider" style="color: #dc2626"
							>The Marin Number</span
						>
						<span class="text-[10px] text-zinc-500"
							>{fmtDollars(snapshot.marinNumber.annualized)}/yr</span
						>
					</div>
					<div class="flex items-baseline gap-2 mt-1">
						<span class="text-4xl font-bold tabular-nums text-white">
							{fmtDollars(snapshot.marinNumber.total)}
						</span>
						<span class="text-[10px] text-zinc-500">/mo</span>
						{#if marinNumberDelta}
							<span class="text-sm font-semibold tabular-nums {marinNumberDelta.color}">
								{marinNumberDelta.text}
							</span>
						{/if}
					</div>
				</div>

				<!-- Marin Number line items (2 columns) -->
				<div class="flex-1 px-3 py-2 overflow-hidden">
					<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
						Breakdown
					</div>
					<div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
						{#each snapshot.marinNumber.items.slice(0, 8) as item}
							<div class="flex items-center justify-between py-0.5">
								<div class="flex items-center gap-1 min-w-0 flex-1 mr-1">
									<span class="text-xs text-zinc-300 truncate">{item.label}</span>
									{#if item.source === 'live'}
										<span
											class="text-[7px] font-bold uppercase px-1 py-px rounded bg-emerald-500/15 text-emerald-400 shrink-0"
											>live</span
										>
									{:else}
										<span
											class="text-[7px] font-bold uppercase px-1 py-px rounded bg-zinc-700/40 text-zinc-500 shrink-0"
											>static</span
										>
									{/if}
								</div>
								<span class="text-xs font-bold tabular-nums text-zinc-100 shrink-0">
									{fmtDollarsWhole(item.monthly)}
								</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Tagline -->
				<div class="px-3 pb-2">
					<p class="text-[9px] text-zinc-600 italic">This does not include your Rivian payment.</p>
				</div>
			</div>

			<!-- CENTER COLUMN: Composite Score + Tier Bars -->
			<div
				class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden"
			>
				<!-- Composite score header -->
				<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
					<div class="flex items-baseline justify-between">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
							>Composite Index</span
						>
						<span class="text-[10px] text-zinc-500">base 100</span>
					</div>
					<div class="flex items-baseline gap-2 mt-1">
						<span class="text-3xl font-bold tabular-nums" style="color: #dc2626">
							{snapshot.compositeScore.toFixed(1)}
						</span>
						{#if compositeScoreDelta}
							<span class="text-sm font-semibold tabular-nums {compositeScoreDelta.color}">
								{compositeScoreDelta.text}
							</span>
						{/if}
					</div>
				</div>

				<!-- Tier bars -->
				<div class="flex-1 px-3 py-2 overflow-hidden">
					<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
						Tier Breakdown
					</div>
					{#each snapshot.tiers as tier}
						{@const accent = tierAccents[tier.category]}
						{@const delta = fmtDelta(tier.monthlyTotal, getPreviousTierTotal(tier.category))}
						<div class="mb-2.5">
							<div class="flex items-center justify-between mb-0.5">
								<span class="text-xs font-semibold" style="color: {accent}">
									{categoryLabels[tier.category] ?? tier.label}
								</span>
								<div class="flex items-center gap-2">
									<span class="text-[10px] text-zinc-500">{Math.round(tier.weight * 100)}%</span>
									<span class="text-xs font-bold tabular-nums text-zinc-200">
										{fmtDollarsWhole(tier.monthlyTotal)}/mo
									</span>
									{#if delta}
										<span class="text-[10px] font-semibold tabular-nums {delta.color}">
											{delta.text}
										</span>
									{/if}
								</div>
							</div>
							<!-- Bar track -->
							<div class="relative h-4 rounded bg-zinc-700/30 overflow-hidden">
								<div
									class="h-full rounded"
									style="width: {tierBarWidth(tier.score)}%; background: {accent}; opacity: 0.6;"
								></div>
								<span
									class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums text-white drop-shadow-sm"
								>
									{tier.score.toFixed(1)}
								</span>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- RIGHT COLUMN: Trend Sparkline + Summary -->
			<div
				class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden"
			>
				<!-- Trend header -->
				<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
					<div class="flex items-baseline justify-between">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
							>Composite Trend</span
						>
						<span class="text-[10px] text-zinc-500">{data?.history?.length ?? 0} snapshots</span>
					</div>
				</div>

				<!-- Sparkline -->
				<div class="shrink-0 h-8 px-3 pt-2">
					{#if heroSparkline}
						<svg
							viewBox="0 0 {heroSparkline.w} {heroSparkline.h}"
							class="w-full h-full"
							preserveAspectRatio="none"
						>
							<path d={heroSparkline.areaPath} fill="#dc2626" opacity="0.12" />
							<path d={heroSparkline.linePath} fill="none" stroke="#dc2626" stroke-width="2" />
						</svg>
					{:else}
						<div class="h-full flex items-center justify-center">
							<span class="text-[10px] text-zinc-600">Not enough data for trend</span>
						</div>
					{/if}
				</div>

				<!-- Summary stats grid -->
				<div class="flex-1 px-3 py-2 overflow-hidden">
					<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
						Quick Stats
					</div>
					<div class="space-y-1">
						<div class="flex items-center justify-between py-0.5 border-b border-gray-700/20">
							<span class="text-xs text-zinc-400">Monthly Total</span>
							<span class="text-xs font-bold tabular-nums text-white"
								>{fmtDollars(snapshot.marinNumber.total)}</span
							>
						</div>
						<div class="flex items-center justify-between py-0.5 border-b border-gray-700/20">
							<span class="text-xs text-zinc-400">Annual Cost</span>
							<span class="text-xs font-bold tabular-nums text-white"
								>{fmtDollars(snapshot.marinNumber.annualized)}</span
							>
						</div>
						<div class="flex items-center justify-between py-0.5 border-b border-gray-700/20">
							<span class="text-xs text-zinc-400">Composite Score</span>
							<span class="text-xs font-bold tabular-nums" style="color: #dc2626"
								>{snapshot.compositeScore.toFixed(1)}</span
							>
						</div>
						<div class="flex items-center justify-between py-0.5 border-b border-gray-700/20">
							<span class="text-xs text-zinc-400">Live Data Sources</span>
							<span class="text-xs font-bold tabular-nums text-emerald-400">
								{snapshot.marinNumber.items.filter((i) => i.source === 'live').length} / {snapshot
									.marinNumber.items.length}
							</span>
						</div>
						{#each snapshot.tiers as tier}
							{@const accent = tierAccents[tier.category]}
							<div class="flex items-center justify-between py-0.5 border-b border-gray-700/20">
								<span class="text-xs text-zinc-400">{categoryLabels[tier.category]}</span>
								<span class="text-xs font-bold tabular-nums" style="color: {accent}"
									>{tier.score.toFixed(1)}</span
								>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
