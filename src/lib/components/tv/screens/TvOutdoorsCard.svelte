<script lang="ts">
	interface TrailIntelItem {
		icon: string;
		label: string;
		detail: string;
		relevance: 'primary' | 'secondary';
	}

	interface Props {
		surf: Array<{ name: string; height: string; conditions: string }>;
		dirt: {
			condition: string;
			color: string;
			lastRain: string;
			score?: number;
			moistureEstimate?: number;
			dryingRate?: number;
			seasonalBaseline?: number;
			confidence?: 'high' | 'medium' | 'low';
			trailIntel?: TrailIntelItem[];
		} | null;
		streams: Array<{
			name: string;
			cfs: number;
			trend: 'rising' | 'falling' | 'stable';
			gageHeight?: number | null;
		}>;
	}
	let { surf, dirt, streams }: Props = $props();

	function trendArrow(trend: 'rising' | 'falling' | 'stable'): string {
		if (trend === 'rising') return '\u2191';
		if (trend === 'falling') return '\u2193';
		return '\u2192';
	}

	function trendColor(trend: 'rising' | 'falling' | 'stable'): string {
		if (trend === 'rising') return '#f59e0b';
		if (trend === 'falling') return '#3b82f6';
		return '#6b7280';
	}

	/** Flow level color based on CFS */
	function flowColor(cfs: number): string {
		if (cfs < 5) return '#22c55e';
		if (cfs < 50) return '#3b82f6';
		if (cfs < 200) return '#f59e0b';
		return '#ef4444';
	}

	/** Bar width (0-100%) based on CFS, log-scale */
	function flowBarPct(cfs: number): number {
		if (cfs <= 0) return 2;
		const pct = (Math.log10(cfs) / 3) * 100;
		return Math.max(2, Math.min(100, pct));
	}

	/** Moisture bar color */
	function moistureColor(pct: number): string {
		if (pct < 20) return '#f59e0b';
		if (pct < 40) return '#22c55e';
		if (pct < 60) return '#3b82f6';
		return '#ef4444';
	}

	/** Confidence badge color */
	function confidenceColor(c: string): string {
		if (c === 'high') return 'text-emerald-400 bg-emerald-500/15';
		if (c === 'medium') return 'text-amber-400 bg-amber-500/15';
		return 'text-zinc-400 bg-zinc-500/15';
	}

	const primaryIntel = $derived(
		(dirt?.trailIntel ?? []).filter((t) => t.relevance === 'primary').slice(0, 3)
	);
	const secondaryIntel = $derived(
		(dirt?.trailIntel ?? []).filter((t) => t.relevance === 'secondary').slice(0, 2)
	);
	const allIntel = $derived([...primaryIntel, ...secondaryIntel].slice(0, 4));
</script>

<div class="h-full flex flex-col overflow-hidden px-6 py-3">
	<h2 class="text-base font-semibold text-gray-100 mb-2 shrink-0">Outdoors</h2>

	<div class="flex-1 grid grid-cols-2 gap-3 min-h-0">
		<!-- LEFT COLUMN: Hero Dirt Tracker -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header with score -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
						>Hero Dirt Tracker</span
					>
					{#if dirt?.confidence}
						<span
							class="text-[8px] font-bold uppercase px-1.5 py-px rounded {confidenceColor(
								dirt.confidence
							)}"
						>
							{dirt.confidence}
						</span>
					{/if}
				</div>
				{#if dirt}
					<div class="flex items-baseline gap-2 mt-1">
						<span class="text-2xl font-bold leading-none" style="color: {dirt.color}">
							{dirt.condition}
						</span>
						{#if dirt.score != null}
							<span class="text-sm font-semibold tabular-nums text-zinc-400">
								{dirt.score.toFixed(0)}/100
							</span>
						{/if}
					</div>
				{:else}
					<span class="text-2xl font-bold text-zinc-600 mt-1">—</span>
				{/if}
			</div>

			{#if dirt}
				<!-- Moisture & drying stats -->
				<div class="px-3 py-2 border-b border-gray-700/40">
					<div class="grid grid-cols-2 gap-2">
						{#if dirt.moistureEstimate != null}
							<div>
								<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-0.5">
									Moisture
								</div>
								<div class="flex items-center gap-1.5">
									<span
										class="text-lg font-bold tabular-nums"
										style="color: {moistureColor(dirt.moistureEstimate)}"
									>
										{dirt.moistureEstimate.toFixed(0)}%
									</span>
								</div>
								<!-- Moisture bar -->
								<div class="w-full h-1.5 rounded-full bg-zinc-700/40 mt-1 overflow-hidden">
									<div
										class="h-full rounded-full"
										style="width: {Math.min(
											100,
											dirt.moistureEstimate
										)}%; background: {moistureColor(dirt.moistureEstimate)}; opacity: 0.7;"
									></div>
								</div>
							</div>
						{/if}
						{#if dirt.dryingRate != null}
							<div>
								<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-0.5">
									Drying Rate
								</div>
								<span class="text-lg font-bold tabular-nums text-zinc-200">
									{dirt.dryingRate.toFixed(1)}
								</span>
								<span class="text-[9px] text-zinc-500 ml-0.5">%/hr</span>
							</div>
						{/if}
					</div>
					{#if dirt.seasonalBaseline != null}
						<div class="mt-1.5 flex items-center gap-1">
							<span class="text-[9px] text-zinc-500">Seasonal baseline:</span>
							<span class="text-[9px] font-semibold tabular-nums text-zinc-400"
								>{dirt.seasonalBaseline.toFixed(0)}%</span
							>
						</div>
					{/if}
				</div>

				<!-- Summary text -->
				<div class="px-3 py-2 border-b border-gray-700/40">
					<p class="text-xs text-zinc-300 leading-snug">{dirt.lastRain}</p>
				</div>

				<!-- Trail Intel -->
				{#if allIntel.length > 0}
					<div class="flex-1 px-3 py-2 overflow-hidden">
						<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
							Trail Intel
						</div>
						{#each allIntel as intel}
							<div class="flex items-start gap-1.5 py-0.5">
								<span class="text-xs shrink-0">{intel.icon}</span>
								<div class="min-w-0">
									<span class="text-xs font-medium text-zinc-200">{intel.label}</span>
									<span class="text-[10px] text-zinc-500 ml-1">{intel.detail}</span>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="flex-1"></div>
				{/if}
			{:else}
				<div class="flex-1 flex items-center justify-center px-3">
					<p class="text-xs text-zinc-600">No rain data available</p>
				</div>
			{/if}
		</div>

		<!-- RIGHT COLUMN: Streams + Surf note -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
						>Stream Gauges</span
					>
					<span class="text-[10px] text-zinc-500">USGS</span>
				</div>
			</div>

			<!-- Stream gauges -->
			<div class="flex-1 px-3 py-2 overflow-hidden">
				{#each streams.slice(0, 6) as gauge}
					<div class="mb-2">
						<div class="flex items-baseline justify-between mb-0.5">
							<span class="text-xs text-zinc-200 truncate">{gauge.name}</span>
							<div class="flex items-center gap-1.5 shrink-0">
								<span class="text-sm font-bold tabular-nums text-white">
									{gauge.cfs.toFixed(0)}
								</span>
								<span class="text-[9px] text-zinc-500">cfs</span>
								{#if gauge.gageHeight != null}
									<span class="text-[10px] text-zinc-500 tabular-nums">
										{gauge.gageHeight.toFixed(2)}ft
									</span>
								{/if}
								<span class="text-xs font-bold" style="color: {trendColor(gauge.trend)}">
									{trendArrow(gauge.trend)}
								</span>
							</div>
						</div>
						<!-- Flow bar -->
						<div class="w-full h-2 rounded-full bg-zinc-700/30 overflow-hidden">
							<div
								class="h-full rounded-full transition-all"
								style="width: {flowBarPct(gauge.cfs)}%; background: {flowColor(
									gauge.cfs
								)}; opacity: 0.7;"
							></div>
						</div>
					</div>
				{/each}
				{#if streams.length === 0}
					<p class="text-xs text-zinc-600 text-center py-4">No stream data available</p>
				{/if}
			</div>

			<!-- Surf footer note -->
			<div class="px-3 py-2 border-t border-gray-700/40">
				{#if surf.length > 0}
					<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
						Surf Report
					</div>
					{#each surf.slice(0, 2) as spot}
						<div class="flex items-center justify-between py-0.5">
							<span class="text-xs text-zinc-300">{spot.name}</span>
							<div class="flex items-center gap-1">
								<span class="text-xs font-bold tabular-nums text-white">{spot.height}</span>
								<span class="text-[9px] text-zinc-500">{spot.conditions}</span>
							</div>
						</div>
					{/each}
				{:else}
					<div class="flex items-center gap-2">
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="#0ea5e9"
							stroke-width="1.5"
							class="shrink-0"
						>
							<path
								d="M2 12c1.5-2 3.5-3 5.5-3s3.5 1 5 3c1.5 2 3.5 3 5.5 3s4-1 4-3"
								stroke-linecap="round"
							/>
						</svg>
						<span class="text-[10px] text-zinc-500"
							>Surf report: Surfline integration in development</span
						>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
