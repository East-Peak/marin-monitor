<script lang="ts">
	import type { DrivewayData } from '$lib/types/driveway';
	import { FUEL_TYPE_COLORS, FUEL_TYPE_LABELS, FUEL_TYPE_ORDER } from '$lib/config/driveway';
	import type { FuelType } from '$lib/types/driveway';
	import { buildTvSparkline } from '$lib/components/tv/sparkline';

	interface Props {
		data: DrivewayData | null;
	}
	let { data }: Props = $props();

	const INDIGO = '#6366f1';

	const snapshot = $derived(data?.current ?? null);

	/** Filter fuel types above 0.5% for display */
	const filteredFuel = $derived(
		(snapshot?.fuelBreakdown ?? []).filter((f) => f.pct >= 0.5)
	);

	/** All fuel entries for the legend */
	const orderedFuel = $derived.by(() => {
		if (!snapshot?.fuelBreakdown) return [];
		return FUEL_TYPE_ORDER
			.map((ft) => snapshot.fuelBreakdown.find((f) => f.fuelType === ft))
			.filter((f): f is NonNullable<typeof f> => f != null);
	});

	/** Max count among top makes for bar scaling */
	const maxMakeCount = $derived(
		Math.max(...(snapshot?.topMakes?.slice(0, 10).map((m) => m.count) ?? [1]), 1)
	);

	/** Gasoline percentage for headline stat */
	const gasPct = $derived(
		snapshot?.fuelBreakdown.find((f) => f.fuelType === 'gasoline')?.pct ?? 0
	);

	/** EV share (BEV + PHEV) */
	const evShare = $derived.by(() => {
		if (!snapshot?.fuelBreakdown) return 0;
		const bev = snapshot.fuelBreakdown.find((f) => f.fuelType === 'battery-electric')?.pct ?? 0;
		const phev = snapshot.fuelBreakdown.find((f) => f.fuelType === 'plug-in-hybrid')?.pct ?? 0;
		return Math.round((bev + phev) * 100) / 100;
	});

	function fmtCount(n: number): string {
		return n.toLocaleString('en-US');
	}

	function fuelColor(ft: FuelType): string {
		return FUEL_TYPE_COLORS[ft] ?? '#6b7280';
	}

	function fuelLabel(ft: FuelType): string {
		return FUEL_TYPE_LABELS[ft] ?? ft;
	}

	/** Convert small number to word for playful display */
	function numberToWord(n: number): string {
		const words: Record<number, string> = {
			1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
			6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
			11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen',
			15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen',
			19: 'nineteen', 20: 'twenty', 30: 'thirty', 40: 'forty',
			50: 'fifty', 60: 'sixty', 68: 'sixty-eight', 70: 'seventy',
			80: 'eighty', 90: 'ninety'
		};
		if (words[n]) return words[n];
		if (n < 100) {
			const tens = Math.floor(n / 10) * 10;
			const ones = n % 10;
			return `${words[tens] ?? tens}-${words[ones] ?? ones}`;
		}
		return String(n);
	}

	/** EV penetration sparkline from history */
	const evSparkline = $derived.by(() => {
		const history = data?.history;
		if (!history?.length) return null;
		return buildTvSparkline(
			history.map((entry) => {
				const ev = entry.fuelBreakdown.find((fuel) => fuel.fuelType === 'battery-electric');
				return ev?.pct ?? null;
			}),
			80,
			24
		);
	});
</script>

{#if !snapshot}
	<div class="h-full flex items-center justify-center">
		<p class="text-lg text-zinc-500">Loading driveway data...</p>
	</div>
{:else}
	<div class="h-full flex flex-col overflow-hidden px-6 py-3">
		<h2 class="text-base font-semibold text-gray-100 mb-2 shrink-0">The Marin Driveway</h2>

		<div class="flex-1 grid grid-cols-2 gap-3 min-h-0">
			<!-- LEFT COLUMN: Stats + Fuel Breakdown -->
			<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
				<!-- Stats header -->
				<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
					<div class="flex items-baseline justify-between">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Registration Stats</span>
						<span class="text-[10px] text-zinc-500">{snapshot.dataYear} data</span>
					</div>
					<div class="grid grid-cols-3 gap-2 mt-2">
						<div class="text-center">
							<span class="text-lg font-bold tabular-nums" style="color: {INDIGO}">{fmtCount(snapshot.totalVehicles)}</span>
							<p class="text-[9px] text-zinc-500 uppercase">Vehicles</p>
						</div>
						<div class="text-center">
							<span class="text-lg font-bold tabular-nums text-zinc-300">{gasPct}%</span>
							<p class="text-[9px] text-zinc-500 uppercase">Gasoline</p>
						</div>
						<div class="text-center">
							<div class="flex items-center justify-center gap-1.5">
								<span class="text-lg font-bold tabular-nums" style="color: #22c55e">{evShare}%</span>
								{#if evSparkline}
									<svg viewBox="0 0 {evSparkline.w} {evSparkline.h}" class="w-16 h-5 shrink-0">
										<path d={evSparkline.areaPath} fill="#22c55e" opacity="0.15" />
										<path d={evSparkline.linePath} fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" />
									</svg>
								{/if}
							</div>
							<p class="text-[9px] text-zinc-500 uppercase">EV</p>
						</div>
					</div>
				</div>

				<!-- Stacked fuel bar -->
				<div class="px-3 py-2 border-b border-gray-700/40">
					<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Fuel Type Breakdown</div>
					<div class="w-full h-5 rounded overflow-hidden flex">
						{#each filteredFuel as fuel}
							<div
								class="h-full"
								style="width: {fuel.pct}%; background: {fuelColor(fuel.fuelType)};"
								title="{fuelLabel(fuel.fuelType)}: {fuel.pct.toFixed(1)}%"
							>
								{#if fuel.pct >= 6}
									<span class="flex items-center justify-center h-full text-[9px] font-bold text-white drop-shadow-sm">
										{fuel.pct.toFixed(0)}%
									</span>
								{/if}
							</div>
						{/each}
					</div>
					<!-- Fuel legend -->
					<div class="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
						{#each orderedFuel as fuel}
							<div class="flex items-center gap-1">
								<div class="w-2 h-2 rounded-sm shrink-0" style="background: {fuelColor(fuel.fuelType)}"></div>
								<span class="text-[9px] text-zinc-400 truncate">{fuelLabel(fuel.fuelType)}</span>
								<span class="text-[9px] text-zinc-500 tabular-nums ml-auto shrink-0">{fmtCount(fuel.count)}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- Fun stats -->
				<div class="flex-1 px-3 py-2 overflow-hidden">
					<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Spotted in Marin</div>
					<div class="grid grid-cols-2 gap-1.5">
						<div class="rounded bg-zinc-700/30 px-2 py-1.5 text-center">
							<span class="text-lg font-bold tabular-nums text-white">{fmtCount(snapshot.funStats.tesla)}</span>
							<p class="text-[9px] text-zinc-400">Teslas (#3 overall)</p>
						</div>
						<div class="rounded bg-zinc-700/30 px-2 py-1.5 text-center">
							<span class="text-lg font-bold tabular-nums text-white">{fmtCount(snapshot.funStats.porsche)}</span>
							<p class="text-[9px] text-zinc-400">Porsches</p>
						</div>
						<div class="rounded bg-zinc-700/30 px-2 py-1.5 text-center">
							<span class="text-lg font-bold tabular-nums text-white">{fmtCount(snapshot.funStats.rivian)}</span>
							<p class="text-[9px] text-zinc-400">Rivians</p>
						</div>
						<div class="rounded bg-zinc-700/30 px-2 py-1.5 text-center">
							<span class="text-lg font-bold tabular-nums" style="color: {INDIGO}">{fmtCount(snapshot.funStats.lucid)}</span>
							<p class="text-[9px] text-zinc-400">Lucids</p>
						</div>
					</div>
					<div class="mt-1.5 rounded px-2 py-1.5 text-center" style="background: rgba(6, 182, 212, 0.1);">
						<span class="text-base font-bold tabular-nums" style="color: #06b6d4">{fmtCount(snapshot.funStats.hydrogen)}</span>
						<span class="text-[9px] text-zinc-400 ml-1">Hydrogen FCEVs (yes, {numberToWord(snapshot.funStats.hydrogen)})</span>
					</div>

				</div>
			</div>

			<!-- RIGHT COLUMN: Top Makes Ranked List -->
			<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
				<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
					<div class="flex items-baseline justify-between">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Top Makes Registered</span>
						<span class="text-[10px] text-zinc-500">{snapshot.topMakes.length} makes</span>
					</div>
				</div>

				<div class="flex-1 px-3 py-2 overflow-hidden">
					{#each snapshot.topMakes.slice(0, 10) as make, i}
						{@const barPct = (make.count / maxMakeCount) * 100}
						<div class="flex items-center gap-2 py-[3px]">
							<span class="text-[10px] text-zinc-500 w-4 text-right shrink-0 tabular-nums">#{i + 1}</span>
							<span class="text-xs font-medium text-zinc-200 w-24 shrink-0 truncate">{make.make}</span>
							<div class="flex-1 h-3.5 rounded bg-zinc-700/30 overflow-hidden">
								<div
									class="h-full rounded"
									style="width: {barPct}%; background: {INDIGO}; opacity: 0.6;"
								></div>
							</div>
							<span class="text-xs font-bold tabular-nums text-white w-14 text-right shrink-0">
								{fmtCount(make.count)}
							</span>
						</div>
					{/each}
				</div>

				<!-- Attribution footer -->
				<div class="px-3 py-2 border-t border-gray-700/40">
					<p class="text-[8px] text-zinc-600 text-center">
						Source: California DMV Vehicle Fuel Type Count by Zip Code ({snapshot.dataYear}) via data.ca.gov
					</p>
				</div>
			</div>
		</div>
	</div>
{/if}
