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
		return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
	}

	function fmtDollarsWhole(n: number | null | undefined): string {
		if (n == null) return '—';
		return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	}

	function fmtDelta(current: number | undefined, previous: number | undefined): { text: string; color: string } | null {
		if (current == null || previous == null) return null;
		const diff = current - previous;
		if (Math.abs(diff) < 0.5) return { text: '—', color: 'text-zinc-500' };
		const sign = diff > 0 ? '+' : '';
		// Up = red (costs went up = bad), Down = green (costs went down = good)
		const color = diff > 0 ? 'text-red-400' : 'text-emerald-400';
		return { text: `${sign}$${Math.round(Math.abs(diff))}`, color };
	}

	/** Sparkline for composite Marin Number over time */
	const heroSparkline = $derived.by(() => {
		const history = data?.history;
		if (!history || history.length < 2) return null;
		const values = history.map((h) => h.marinNumber.total).filter((v) => v != null);
		if (values.length < 2) return null;
		const w = 320, h = 80;
		const x = scaleLinear().domain([0, values.length - 1]).range([0, w]);
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

	/** Get previous snapshot's tier total for delta calculation */
	function getPreviousTierTotal(category: CompositeCategory): number | undefined {
		const prev = data?.history?.[1];
		if (!prev) return undefined;
		return prev.tiers.find((t) => t.category === category)?.monthlyTotal;
	}
</script>

{#if !snapshot}
	<div class="h-full flex items-center justify-center">
		<p class="text-lg text-zinc-500">Loading cost data...</p>
	</div>
{:else}
	<div class="h-full flex flex-col px-12 py-8">
		<!-- Title -->
		<p class="text-lg font-medium uppercase tracking-widest text-zinc-400">Cost of Being Marin</p>

		<!-- Hero section: Marin Number + sparkline -->
		<div class="flex-1 flex flex-col items-center justify-center">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">The Marin Number</p>
			<p class="mt-2 text-8xl font-bold tabular-nums text-white leading-none">
				{fmtDollars(snapshot.marinNumber.total)}
			</p>
			<p class="mt-2 text-2xl text-zinc-400">per month</p>
			<p class="mt-1 text-xl text-zinc-500">
				{fmtDollars(snapshot.marinNumber.annualized)} / year
			</p>

			<!-- Sparkline -->
			{#if heroSparkline}
				<div class="mt-4 w-80">
					<svg
						viewBox="0 0 {heroSparkline.w} {heroSparkline.h}"
						class="w-full h-20"
						preserveAspectRatio="none"
					>
						<path d={heroSparkline.areaPath} fill="#dc2626" opacity="0.12" />
						<path
							d={heroSparkline.linePath}
							fill="none"
							stroke="#dc2626"
							stroke-width="2.5"
						/>
					</svg>
					<p class="text-xs text-zinc-600 text-center mt-1">
						{data?.history?.length ?? 0} weekly snapshots
					</p>
				</div>
			{/if}
		</div>

		<!-- Tier cards -->
		<div class="grid grid-cols-4 gap-5 mb-4">
			{#each snapshot.tiers as tier}
				{@const accent = tierAccents[tier.category]}
				{@const delta = fmtDelta(tier.monthlyTotal, getPreviousTierTotal(tier.category))}
				<div
					class="rounded-xl bg-zinc-800/60 p-5 text-center"
					style="border-top: 4px solid {accent}"
				>
					<p class="text-sm font-medium uppercase tracking-wider text-zinc-400">
						{categoryLabels[tier.category] ?? tier.label}
					</p>
					<p class="mt-3 text-4xl font-bold tabular-nums text-white">
						{fmtDollarsWhole(tier.monthlyTotal)}
					</p>
					{#if delta}
						<p class="mt-2 text-lg font-semibold tabular-nums {delta.color}">
							{delta.text}
						</p>
					{/if}
					<p class="mt-1 text-sm text-zinc-500">
						score: <span class="tabular-nums" style="color: {accent}">{tier.score.toFixed(0)}</span>
					</p>
				</div>
			{/each}
		</div>

		<!-- Bottom strip: Marin Number line items -->
		<div class="flex flex-wrap justify-center gap-x-6 gap-y-1 pb-2">
			{#each snapshot.marinNumber.items.slice(0, 8) as item}
				<span class="text-sm text-zinc-500">
					{item.label}: <span class="tabular-nums text-zinc-400">{fmtDollars(item.monthly)}</span>
				</span>
			{/each}
		</div>
	</div>
{/if}
