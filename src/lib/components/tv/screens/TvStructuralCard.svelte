<script lang="ts">
	import type { SchoolIndexData } from '$lib/types/school';

	interface Props {
		tuition: SchoolIndexData | null;
	}
	let { tuition }: Props = $props();

	function fmtTuitionK(n: number | null | undefined): string {
		if (n == null) return '—';
		return '$' + Math.round(n / 1000) + 'K';
	}
</script>

<div class="h-full flex flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Structural Marin</h2>

	<div class="mt-6 grid flex-1 grid-cols-2 gap-6">
		<!-- Private School Tuition -->
		<div class="rounded-xl bg-zinc-800/60 p-6">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Private School Tuition</p>
			<div class="mt-4 space-y-4">
				{#each tuition?.current?.tiers ?? [] as tier}
					<div class="flex items-baseline justify-between">
						<span class="text-base text-zinc-300">{tier.label}</span>
						<span class="text-2xl font-bold tabular-nums text-white">
							{fmtTuitionK(tier.avgTuition)}
						</span>
					</div>
				{/each}
				{#if !tuition?.current?.tiers?.length}
					<p class="text-sm text-zinc-500">—</p>
				{/if}
			</div>

			{#if tuition?.current?.cumulativeK12 != null}
				<div class="mt-4 border-t border-zinc-700 pt-4">
					<div class="flex items-baseline justify-between">
						<span class="text-base font-semibold text-zinc-300">K-12 Total</span>
						<span class="text-3xl font-bold tabular-nums text-white">
							{fmtTuitionK(tuition.current.cumulativeK12)}
						</span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Housing -->
		<div class="rounded-xl bg-zinc-800/60 p-6 flex flex-col items-center justify-center text-center">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Housing</p>
			<p class="mt-4 text-2xl text-zinc-400">County-level data</p>
			<p class="mt-2 text-sm text-zinc-500">
				Redfin county tracker — no per-town breakdown
			</p>
		</div>
	</div>
</div>
