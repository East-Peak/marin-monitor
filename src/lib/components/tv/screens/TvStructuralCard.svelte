<script lang="ts">
	import type { SchoolIndexData } from '$lib/types/school';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';

	interface Props {
		tuition: SchoolIndexData | null;
	}
	let { tuition }: Props = $props();

	const CYAN = '#0891b2';
	const HOUSING_BLUE = '#3b82f6';

	/** Static housing PITI from composite config */
	const HOUSING_PITI = 8_566;
	const HOUSING_ANNUAL = HOUSING_PITI * 12;

	function fmtTuitionK(n: number | null | undefined): string {
		if (n == null) return '—';
		return '$' + Math.round(n / 1000) + 'K';
	}

	function fmtDollars(n: number): string {
		return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	}

	/** Max tuition across all tiers for bar scaling */
	const maxTuition = $derived(
		Math.max(...(tuition?.current?.tiers?.map((t) => t.avgTuition) ?? [1]), 1)
	);

	/** Sparkline of cumulative K-12 cost over history */
	const k12Sparkline = $derived.by(() => {
		const history = tuition?.history;
		if (!history || history.length < 2) return null;
		const values = history.map((h) => h.cumulativeK12).filter((v) => v != null);
		if (values.length < 2) return null;
		const w = 280, h = 70;
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
</script>

<div class="h-full flex flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Structural Marin</h2>

	<div class="mt-6 grid flex-1 grid-cols-2 gap-6">
		<!-- Private School Tuition -->
		<div
			class="rounded-xl bg-zinc-800/60 flex flex-col overflow-hidden"
			style="border-top: 4px solid {CYAN}"
		>
			<div class="flex-1 p-6">
				<p class="text-base font-medium uppercase tracking-wider text-zinc-400">
					Private School Tuition
				</p>

				<!-- Horizontal bar chart for tiers -->
				<div class="mt-5 space-y-4">
					{#each tuition?.current?.tiers ?? [] as tier}
						{@const barPct = (tier.avgTuition / maxTuition) * 100}
						<div>
							<div class="flex items-baseline justify-between mb-1.5">
								<span class="text-base text-zinc-300">{tier.label}</span>
								<div class="flex items-baseline gap-3">
									<span class="text-sm tabular-nums text-zinc-500">
										{tier.pctOfMedianIncome.toFixed(0)}% of income
									</span>
									<span class="text-xl font-bold tabular-nums text-white">
										{fmtTuitionK(tier.avgTuition)}
									</span>
								</div>
							</div>
							<div class="w-full h-3 rounded-full bg-zinc-700/40 overflow-hidden">
								<div
									class="h-full rounded-full transition-all"
									style="width: {barPct}%; background: {CYAN}; opacity: 0.7;"
								></div>
							</div>
						</div>
					{/each}
					{#if !tuition?.current?.tiers?.length}
						<p class="text-sm text-zinc-500">—</p>
					{/if}
				</div>

				<!-- K-12 cumulative total -->
				{#if tuition?.current?.cumulativeK12 != null}
					<div class="mt-5 pt-4 border-t border-zinc-700">
						<div class="flex items-baseline justify-between">
							<span class="text-base font-semibold text-zinc-300">K-12 Cumulative</span>
							<span class="text-3xl font-bold tabular-nums text-white">
								{fmtDollars(tuition.current.cumulativeK12)}
							</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- K-12 sparkline -->
			{#if k12Sparkline}
				<div class="px-5 pb-4">
					<svg
						viewBox="0 0 {k12Sparkline.w} {k12Sparkline.h}"
						class="w-full h-16"
						preserveAspectRatio="none"
					>
						<path d={k12Sparkline.areaPath} fill={CYAN} opacity="0.15" />
						<path d={k12Sparkline.linePath} fill="none" stroke={CYAN} stroke-width="2" />
					</svg>
					<p class="text-xs text-zinc-600 text-center mt-1">
						{tuition?.history?.length ?? 0} snapshots
					</p>
				</div>
			{/if}
		</div>

		<!-- Housing -->
		<div
			class="rounded-xl bg-zinc-800/60 flex flex-col overflow-hidden"
			style="border-top: 4px solid {HOUSING_BLUE}"
		>
			<div class="flex-1 flex flex-col items-center justify-center p-6">
				<p class="text-base font-medium uppercase tracking-wider text-zinc-400">
					Housing
				</p>
				<p class="mt-4 text-7xl font-bold tabular-nums text-white leading-none">
					{fmtDollars(HOUSING_PITI)}
				</p>
				<p class="mt-3 text-2xl text-zinc-400">per month</p>

				<div class="mt-6 w-full max-w-xs space-y-3">
					<div class="flex items-baseline justify-between">
						<span class="text-base text-zinc-400">Annual PITI</span>
						<span class="text-xl font-bold tabular-nums text-white">{fmtDollars(HOUSING_ANNUAL)}</span>
					</div>
					<div class="h-px bg-zinc-700/50"></div>
					<div class="flex items-baseline justify-between">
						<span class="text-base text-zinc-400">% of median income</span>
						<span class="text-xl font-bold tabular-nums" style="color: {HOUSING_BLUE}">
							64%
						</span>
					</div>
				</div>

				<p class="mt-6 text-sm text-zinc-500 text-center leading-relaxed">
					PITI on median Marin home<br />
					County-level &middot; Redfin tracker
				</p>
			</div>
		</div>
	</div>
</div>
