<script lang="ts">
	import type { DrivewayData } from '$lib/types/driveway';
	import { FUEL_TYPE_COLORS, FUEL_TYPE_LABELS } from '$lib/config/driveway';
	import type { FuelType } from '$lib/types/driveway';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';

	interface Props {
		data: DrivewayData | null;
	}
	let { data }: Props = $props();

	const INDIGO = '#6366f1';

	const snapshot = $derived(data?.current ?? null);

	/** Filter fuel types above 1% for the stacked bar */
	const filteredFuel = $derived(
		(snapshot?.fuelBreakdown ?? []).filter((f) => f.pct >= 0.5)
	);

	/** Max count among top makes for bar scaling */
	const maxMakeCount = $derived(
		Math.max(...(snapshot?.topMakes?.slice(0, 6).map((m) => m.count) ?? [1]), 1)
	);

	function fmtCount(n: number): string {
		return n.toLocaleString('en-US');
	}

	function fuelColor(ft: FuelType): string {
		return FUEL_TYPE_COLORS[ft] ?? '#6b7280';
	}

	function fuelLabel(ft: FuelType): string {
		return FUEL_TYPE_LABELS[ft] ?? ft;
	}

	/** EV penetration sparkline from history */
	const evSparkline = $derived.by(() => {
		const history = data?.history;
		if (!history || history.length < 2) return null;
		const values = history
			.map((h) => {
				const ev = h.fuelBreakdown.find((f) => f.fuelType === 'battery-electric');
				return ev?.pct ?? null;
			})
			.filter((v): v is number => v != null);
		if (values.length < 2) return null;
		const w = 200, h = 60;
		const x = scaleLinear().domain([0, values.length - 1]).range([0, w]);
		const y = scaleLinear()
			.domain([0, Math.max(...values) * 1.2])
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

{#if !snapshot}
	<div class="h-full flex items-center justify-center">
		<p class="text-lg text-zinc-500">Loading driveway data...</p>
	</div>
{:else}
	<div class="h-full flex flex-col px-12 py-8">
		<div class="flex items-center gap-4">
			<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">The Marin Driveway</h2>
			<span class="text-base tabular-nums text-zinc-500">
				{fmtCount(snapshot.totalVehicles)} registered vehicles
			</span>
		</div>

		<!-- Stacked fuel breakdown bar -->
		<div class="mt-5">
			<div class="w-full h-8 rounded-lg overflow-hidden flex">
				{#each filteredFuel as fuel}
					<div
						class="h-full relative group"
						style="width: {fuel.pct}%; background: {fuelColor(fuel.fuelType)};"
						title="{fuelLabel(fuel.fuelType)}: {fuel.pct.toFixed(1)}%"
					>
						{#if fuel.pct >= 5}
							<span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-sm">
								{fuel.pct.toFixed(0)}%
							</span>
						{/if}
					</div>
				{/each}
			</div>
			<!-- Fuel legend -->
			<div class="mt-2 flex flex-wrap gap-x-5 gap-y-1">
				{#each filteredFuel as fuel}
					<div class="flex items-center gap-1.5">
						<div
							class="w-2.5 h-2.5 rounded-sm"
							style="background: {fuelColor(fuel.fuelType)}"
						></div>
						<span class="text-xs text-zinc-400">
							{fuelLabel(fuel.fuelType)} {fuel.pct.toFixed(1)}%
						</span>
					</div>
				{/each}
			</div>
		</div>

		<div class="mt-5 grid flex-1 grid-cols-2 gap-6 min-h-0">
			<!-- Top Makes bar chart -->
			<div
				class="rounded-xl bg-zinc-800/60 flex flex-col overflow-hidden"
				style="border-top: 4px solid {INDIGO}"
			>
				<div class="p-5 flex-1">
					<p class="text-sm font-medium uppercase tracking-wider text-zinc-400">Top Makes</p>
					<div class="mt-3 space-y-2.5">
						{#each snapshot.topMakes.slice(0, 6) as make}
							{@const barPct = (make.count / maxMakeCount) * 100}
							<div class="flex items-center gap-3">
								<span class="w-28 shrink-0 text-base text-zinc-300 truncate">{make.make}</span>
								<div class="flex-1 h-5 rounded bg-zinc-700/30 overflow-hidden">
									<div
										class="h-full rounded"
										style="width: {barPct}%; background: {INDIGO}; opacity: 0.6;"
									></div>
								</div>
								<span class="w-16 text-right text-base font-bold tabular-nums text-white shrink-0">
									{fmtCount(make.count)}
								</span>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Fun Stats + EV sparkline -->
			<div class="rounded-xl bg-zinc-800/60 flex flex-col overflow-hidden">
				<div class="p-5 flex-1 flex flex-col">
					<p class="text-sm font-medium uppercase tracking-wider text-zinc-400">Notable</p>

					<!-- Fun stat badges -->
					<div class="mt-4 grid grid-cols-2 gap-3">
						<div class="rounded-lg bg-zinc-700/40 p-3 text-center">
							<p class="text-3xl font-bold tabular-nums text-white">{fmtCount(snapshot.funStats.tesla)}</p>
							<p class="text-sm text-zinc-400 mt-1">Teslas</p>
						</div>
						<div class="rounded-lg bg-zinc-700/40 p-3 text-center">
							<p class="text-3xl font-bold tabular-nums text-white">{fmtCount(snapshot.funStats.porsche)}</p>
							<p class="text-sm text-zinc-400 mt-1">Porsches</p>
						</div>
						<div class="rounded-lg p-3 text-center" style="background: rgba(6, 182, 212, 0.15);">
							<p class="text-2xl font-bold tabular-nums" style="color: #06b6d4">{fmtCount(snapshot.funStats.hydrogen)}</p>
							<p class="text-sm text-zinc-400 mt-1">Hydrogen FCEVs</p>
						</div>
						<div class="rounded-lg p-3 text-center" style="background: rgba(99, 102, 241, 0.15);">
							<p class="text-2xl font-bold tabular-nums" style="color: {INDIGO}">{fmtCount(snapshot.funStats.lucid)}</p>
							<p class="text-sm text-zinc-400 mt-1">Lucids</p>
						</div>
					</div>

					<!-- EV adoption sparkline -->
					{#if evSparkline}
						<div class="mt-auto pt-3">
							<p class="text-xs text-zinc-500 mb-1">EV adoption trend</p>
							<svg
								viewBox="0 0 {evSparkline.w} {evSparkline.h}"
								class="w-full h-14"
								preserveAspectRatio="none"
							>
								<path d={evSparkline.areaPath} fill="#22c55e" opacity="0.15" />
								<path d={evSparkline.linePath} fill="none" stroke="#22c55e" stroke-width="2" />
							</svg>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
