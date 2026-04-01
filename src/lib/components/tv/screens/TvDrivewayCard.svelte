<script lang="ts">
	import type { DrivewayData } from '$lib/types/driveway';

	interface Props {
		data: DrivewayData | null;
	}
	let { data }: Props = $props();

	const snapshot = $derived(data?.current ?? null);

	const filteredFuel = $derived(
		(snapshot?.fuelBreakdown ?? []).filter((f) => f.pct >= 1.0)
	);

	function fmtCount(n: number): string {
		return n.toLocaleString('en-US');
	}

	function fuelLabel(ft: string): string {
		const labels: Record<string, string> = {
			gasoline: 'Gasoline',
			'battery-electric': 'Battery Electric',
			hybrid: 'Hybrid',
			'plug-in-hybrid': 'Plug-in Hybrid',
			diesel: 'Diesel',
			'flex-fuel': 'Flex Fuel',
			hydrogen: 'Hydrogen',
			other: 'Other'
		};
		return labels[ft] ?? ft;
	}
</script>

{#if !snapshot}
	<div class="h-full flex items-center justify-center">
		<p class="text-lg text-zinc-500">Loading driveway data...</p>
	</div>
{:else}
	<div class="h-full flex flex-col px-12 py-8">
		<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">The Marin Driveway</h2>

		<div class="mt-6 grid flex-1 grid-cols-2 gap-6">
			<!-- Top Makes -->
			<div class="rounded-xl bg-zinc-800/60 p-6">
				<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Top Makes</p>
				<div class="mt-4 space-y-3">
					{#each snapshot.topMakes.slice(0, 6) as make, i}
						<div class="flex items-baseline justify-between">
							<span class="text-base text-zinc-300">
								<span class="text-zinc-500">#{i + 1}</span> {make.make}
							</span>
							<span class="text-xl font-bold tabular-nums text-white">
								{fmtCount(make.count)}
							</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Fuel Breakdown -->
			<div class="rounded-xl bg-zinc-800/60 p-6">
				<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Fuel Breakdown</p>
				<div class="mt-4 space-y-3">
					{#each filteredFuel as fuel}
						<div class="flex items-baseline justify-between">
							<span class="text-base text-zinc-300">{fuelLabel(fuel.fuelType)}</span>
							<span class="text-xl font-bold tabular-nums text-white">
								{fuel.pct.toFixed(1)}%
							</span>
						</div>
					{/each}
				</div>

				<!-- Fun stats strip -->
				<div class="mt-4 border-t border-zinc-700 pt-4">
					<p class="text-sm text-zinc-500">
						{fmtCount(snapshot.funStats.tesla)} Teslas
						&middot; {fmtCount(snapshot.funStats.hydrogen)} hydrogen
						&middot; {fmtCount(snapshot.funStats.lucid)} Lucids
					</p>
				</div>
			</div>
		</div>
	</div>
{/if}
