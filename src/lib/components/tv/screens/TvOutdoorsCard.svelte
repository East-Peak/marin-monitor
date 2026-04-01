<script lang="ts">
	interface Props {
		surf: Array<{ name: string; height: string; conditions: string }>;
		dirt: { condition: string; color: string; lastRain: string } | null;
		streams: Array<{ name: string; cfs: number; trend: 'rising' | 'falling' | 'stable' }>;
	}
	let { surf, dirt, streams }: Props = $props();

	const GREEN = '#10b981';
	const SKY_BLUE = '#0ea5e9';

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

	/** Flow level color based on CFS (rough heuristic for Marin creeks) */
	function flowColor(cfs: number): string {
		if (cfs < 5) return '#22c55e';      // low - green
		if (cfs < 50) return '#3b82f6';     // moderate - blue
		if (cfs < 200) return '#f59e0b';    // high - amber
		return '#ef4444';                    // flood - red
	}

	/** Bar width (0-100%) based on CFS, log-scale for visual balance */
	function flowBarPct(cfs: number): number {
		if (cfs <= 0) return 2;
		// Log scale: 1 CFS = ~0%, 1000 CFS = 100%
		const pct = (Math.log10(cfs) / 3) * 100;
		return Math.max(2, Math.min(100, pct));
	}
</script>

<div class="h-full flex flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Outdoors</h2>

	<div class="mt-6 grid flex-1 grid-cols-3 gap-6">
		<!-- Hero Dirt Tracker -->
		<div
			class="rounded-xl bg-zinc-800/60 flex flex-col items-center justify-center text-center p-6"
			style="border-top: 4px solid {GREEN}"
		>
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-400">Hero Dirt Tracker</p>
			{#if dirt}
				<p class="mt-5 text-5xl font-bold leading-tight" style="color: {dirt.color}">
					{dirt.condition}
				</p>
				<p class="mt-4 text-base text-zinc-400 leading-relaxed max-w-[240px]">
					{dirt.lastRain}
				</p>
			{:else}
				<p class="mt-5 text-5xl font-bold text-zinc-600">&mdash;</p>
				<p class="mt-3 text-sm text-zinc-500">No rain data available</p>
			{/if}
		</div>

		<!-- Streams -->
		<div
			class="rounded-xl bg-zinc-800/60 flex flex-col p-6"
			style="border-top: 4px solid {GREEN}"
		>
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-400">Streams</p>
			<div class="mt-4 flex-1 flex flex-col justify-center space-y-3">
				{#each streams.slice(0, 5) as gauge}
					<div>
						<div class="flex items-baseline justify-between mb-1">
							<span class="text-sm text-zinc-300 truncate">{gauge.name}</span>
							<div class="flex items-center gap-2 shrink-0">
								<span class="text-lg font-bold tabular-nums text-white">
									{gauge.cfs.toFixed(0)}
								</span>
								<span class="text-xs text-zinc-500">cfs</span>
								<span
									class="text-base font-bold"
									style="color: {trendColor(gauge.trend)}"
								>
									{trendArrow(gauge.trend)}
								</span>
							</div>
						</div>
						<!-- Flow level bar -->
						<div class="w-full h-2.5 rounded-full bg-zinc-700/30 overflow-hidden">
							<div
								class="h-full rounded-full transition-all"
								style="width: {flowBarPct(gauge.cfs)}%; background: {flowColor(gauge.cfs)}; opacity: 0.7;"
							></div>
						</div>
					</div>
				{/each}
				{#if streams.length === 0}
					<p class="text-sm text-zinc-500 text-center">&mdash;</p>
				{/if}
			</div>
		</div>

		<!-- Surf Report -->
		<div
			class="rounded-xl bg-zinc-800/60 flex flex-col p-6"
			style="border-top: 4px solid {GREEN}"
		>
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-400">Surf Report</p>
			{#if surf.length > 0}
				<div class="mt-4 flex-1 flex flex-col justify-center space-y-3">
					{#each surf as spot}
						<div>
							<p class="text-sm font-medium text-zinc-300">{spot.name}</p>
							<div class="flex items-baseline gap-2">
								<span class="text-xl font-bold tabular-nums text-white">{spot.height}</span>
								<span class="text-sm text-zinc-500">{spot.conditions}</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<!-- Styled placeholder for missing surf data -->
				<div class="flex-1 flex flex-col items-center justify-center">
					<div
						class="w-20 h-20 rounded-full flex items-center justify-center"
						style="background: rgba(14, 165, 233, 0.12);"
					>
						<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={SKY_BLUE} stroke-width="1.5">
							<path d="M2 12c1.5-2 3.5-3 5.5-3s3.5 1 5 3c1.5 2 3.5 3 5.5 3s4-1 4-3" stroke-linecap="round" />
							<path d="M2 17c1.5-2 3.5-3 5.5-3s3.5 1 5 3c1.5 2 3.5 3 5.5 3s4-1 4-3" stroke-linecap="round" opacity="0.5" />
						</svg>
					</div>
					<p class="mt-4 text-base font-medium" style="color: {SKY_BLUE}">
						Surf data coming soon
					</p>
					<p class="mt-2 text-sm text-zinc-500 text-center leading-relaxed">
						Surfline integration<br/>in development
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
