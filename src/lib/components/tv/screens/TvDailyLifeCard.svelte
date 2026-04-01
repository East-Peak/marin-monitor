<script lang="ts">
	import type { CoffeeData } from '$lib/types/coffee';
	import type { GroceryBasketData } from '$lib/types/grocery';
	import type { GasPriceData } from '$lib/types/gas';

	interface Props {
		cappuccino: CoffeeData | null;
		grocery: GroceryBasketData | null;
		gas: GasPriceData | null;
	}
	let { cappuccino, grocery, gas }: Props = $props();

	function fmtPrice(n: number | null | undefined): string {
		if (n == null) return '—';
		return '$' + n.toFixed(2);
	}
</script>

<div class="h-full flex flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Daily Life</h2>

	<div class="mt-6 grid flex-1 grid-cols-3 gap-6">
		<!-- Cappuccino -->
		<div class="rounded-xl bg-zinc-800/60 p-6 flex flex-col items-center justify-center text-center">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Cappuccino</p>
			<p class="mt-3 text-5xl font-bold tabular-nums text-white">
				{fmtPrice(cappuccino?.current?.medianPrice)}
			</p>
			<p class="mt-2 text-sm text-zinc-500">
				median across {cappuccino?.current?.pricedShopCount ?? '—'} shops
			</p>
		</div>

		<!-- Grocery Basket -->
		<div class="rounded-xl bg-zinc-800/60 p-6 flex flex-col items-center justify-center text-center">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Grocery Basket</p>
			<p class="mt-3 text-5xl font-bold tabular-nums text-white">
				{fmtPrice(grocery?.current?.totalCheapest)}
			</p>
			<p class="mt-2 text-sm text-zinc-500">
				{grocery?.current?.itemsFound ?? '—'} items, cheapest options
			</p>
		</div>

		<!-- Gas -->
		<div class="rounded-xl bg-zinc-800/60 p-6 flex flex-col items-center justify-center text-center">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Gas (Regular)</p>
			<p class="mt-3 text-5xl font-bold tabular-nums text-white">
				{fmtPrice(gas?.current?.avgRegular)}
			</p>
			<p class="mt-2 text-sm text-zinc-500">
				avg across {gas?.current?.stationCount ?? '—'} stations
			</p>
		</div>
	</div>
</div>
