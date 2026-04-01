<script lang="ts">
	interface Props {
		surf: Array<{ name: string; height: string; conditions: string }>;
		dirt: { condition: string; lastRain: string } | null;
		streams: Array<{ name: string; cfs: number; trend: 'rising' | 'falling' | 'stable' }>;
	}
	let { surf, dirt, streams }: Props = $props();

	function trendArrow(trend: 'rising' | 'falling' | 'stable'): string {
		if (trend === 'rising') return '\u2191';
		if (trend === 'falling') return '\u2193';
		return '\u2192';
	}
</script>

<div class="h-full flex flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Outdoors</h2>

	<div class="mt-6 grid flex-1 grid-cols-3 gap-6">
		<!-- Surf Report -->
		<div class="rounded-xl bg-zinc-800/60 p-6">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Surf Report</p>
			<div class="mt-4 space-y-3">
				{#each surf as spot}
					<div>
						<p class="text-sm font-medium text-zinc-300">{spot.name}</p>
						<div class="flex items-baseline gap-2">
							<span class="text-xl font-bold tabular-nums text-white">{spot.height}</span>
							<span class="text-sm text-zinc-500">{spot.conditions}</span>
						</div>
					</div>
				{/each}
				{#if surf.length === 0}
					<p class="text-sm text-zinc-500">&mdash;</p>
				{/if}
			</div>
		</div>

		<!-- Hero Dirt Tracker -->
		<div class="rounded-xl bg-zinc-800/60 p-6 flex flex-col items-center justify-center text-center">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Hero Dirt Tracker</p>
			{#if dirt}
				<p class="mt-3 text-3xl font-bold text-white">{dirt.condition}</p>
				<p class="mt-2 text-sm text-zinc-500">Last rain: {dirt.lastRain}</p>
			{:else}
				<p class="mt-3 text-3xl font-bold text-zinc-600">&mdash;</p>
			{/if}
		</div>

		<!-- Streams -->
		<div class="rounded-xl bg-zinc-800/60 p-6">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Streams</p>
			<div class="mt-4 space-y-3">
				{#each streams.slice(0, 4) as gauge}
					<div class="flex items-baseline justify-between">
						<span class="text-sm text-zinc-300">{gauge.name}</span>
						<span class="text-lg font-bold tabular-nums text-white">
							{gauge.cfs.toFixed(0)} cfs
							<span class="text-sm">{trendArrow(gauge.trend)}</span>
						</span>
					</div>
				{/each}
				{#if streams.length === 0}
					<p class="text-sm text-zinc-500">&mdash;</p>
				{/if}
			</div>
		</div>
	</div>
</div>
