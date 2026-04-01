<script lang="ts">
	import type { CompositeData, CompositeCategory } from '$lib/types/composite';

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

	function fmtDollars(n: number | null | undefined): string {
		if (n == null) return '—';
		return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
	}

	function fmtDollarsWhole(n: number | null | undefined): string {
		if (n == null) return '—';
		return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	}
</script>

{#if !snapshot}
	<div class="h-full flex items-center justify-center">
		<p class="text-lg text-zinc-500">Loading cost data...</p>
	</div>
{:else}
	<div class="h-full flex flex-col items-center justify-center px-12 py-8">
		<!-- Title -->
		<p class="text-lg font-medium uppercase tracking-widest text-zinc-400">Cost of Being Marin</p>

		<!-- Marin Number -->
		<p class="mt-4 text-sm font-medium uppercase tracking-wider text-zinc-500">The Marin Number</p>
		<p class="mt-2 text-7xl font-bold tabular-nums text-white">
			{fmtDollars(snapshot.marinNumber.total)}
		</p>
		<p class="mt-1 text-2xl text-zinc-400">per month</p>
		<p class="mt-1 text-xl text-zinc-500">
			{fmtDollars(snapshot.marinNumber.annualized)} / year
		</p>

		<!-- Tier cards -->
		<div class="mt-8 grid grid-cols-4 gap-6">
			{#each snapshot.tiers as tier}
				<div class="rounded-xl bg-zinc-800/60 p-6 text-center">
					<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">
						{categoryLabels[tier.category] ?? tier.label}
					</p>
					<p class="mt-2 text-3xl font-bold tabular-nums text-white">
						{fmtDollarsWhole(tier.monthlyTotal)}
					</p>
				</div>
			{/each}
		</div>

		<!-- Bottom strip: Marin Number line items -->
		<div class="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-1">
			{#each snapshot.marinNumber.items.slice(0, 8) as item}
				<span class="text-sm text-zinc-500">
					{item.label}: <span class="tabular-nums text-zinc-400">{fmtDollars(item.monthly)}</span>
				</span>
			{/each}
		</div>
	</div>
{/if}
