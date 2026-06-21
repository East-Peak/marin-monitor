<script lang="ts">
	import type { CoffeeData, CoffeeShop } from '$lib/types/coffee';
	import type { GroceryBasketData, BasketItemPrices } from '$lib/types/grocery';
	import type { GasPriceData, GasStation } from '$lib/types/gas';
	import { buildTvSparkline } from '$lib/components/tv/sparkline';

	interface Props {
		cappuccino: CoffeeData | null;
		grocery: GroceryBasketData | null;
		gas: GasPriceData | null;
	}
	let { cappuccino, grocery, gas }: Props = $props();

	// --- Helpers ---

	function fmtPrice(n: number | null | undefined, decimals = 2): string {
		if (n == null) return '--';
		return '$' + n.toFixed(decimals);
	}

	function fmtDelta(
		current: number | null | undefined,
		previous: number | null | undefined
	): { text: string; color: string } | null {
		if (current == null || previous == null) return null;
		const diff = current - previous;
		if (Math.abs(diff) < 0.005) return { text: 'flat', color: 'text-zinc-500' };
		const sign = diff > 0 ? '+' : '-';
		const color = diff > 0 ? 'text-red-400' : 'text-emerald-400';
		return { text: `${sign}$${Math.abs(diff).toFixed(2)}`, color };
	}

	// --- Cappuccino derived data ---

	const cappuccinoShops = $derived.by<CoffeeShop[]>(() => {
		if (!cappuccino?.current?.shops) return [];
		return [...cappuccino.current.shops]
			.filter((s) => s.price != null)
			.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
	});

	const cappuccinoDelta = $derived(
		fmtDelta(cappuccino?.current?.medianPrice, cappuccino?.history?.[1]?.medianPrice)
	);

	const cappuccinoSparkline = $derived.by(() =>
		buildTvSparkline(cappuccino?.history?.map((h) => h.medianPrice) ?? [], 80, 24)
	);

	// --- Grocery derived data ---

	const groceryDelta = $derived(
		fmtDelta(grocery?.current?.totalCheapest, grocery?.history?.[1]?.totalCheapest)
	);

	const grocerySparkline = $derived.by(() =>
		buildTvSparkline(grocery?.history?.map((h) => h.totalCheapest) ?? [], 80, 24)
	);

	const biggestMovers = $derived.by<(BasketItemPrices & { _delta: number })[]>(() => {
		if (!grocery?.current?.items || !grocery?.history?.length || grocery.history.length < 2)
			return [];
		const prevSnapshot = grocery.history[1]; // history[0] is current, [1] is previous
		if (!prevSnapshot?.items) return [];
		const prevMap = new Map(prevSnapshot.items.map((i) => [i.itemId, i.cheapest]));
		return [...grocery.current.items]
			.filter(
				(item) =>
					item.cheapest !== null && prevMap.has(item.itemId) && prevMap.get(item.itemId) !== null
			)
			.map((item) => ({
				...item,
				_delta: item.cheapest! - (prevMap.get(item.itemId) ?? 0)
			}))
			.sort((a, b) => Math.abs(b._delta) - Math.abs(a._delta))
			.slice(0, 4);
	});

	// --- Gas derived data ---

	const gasDelta = $derived(fmtDelta(gas?.current?.avgRegular, gas?.history?.[1]?.avgRegular));

	const gasSparkline = $derived.by(() =>
		buildTvSparkline(gas?.history?.map((h) => h.avgRegular) ?? [], 80, 24)
	);

	const cheapestStations = $derived.by<GasStation[]>(() => {
		if (!gas?.current?.stations) return [];
		return [...gas.current.stations]
			.filter((s) => s.fuelPrices.some((fp) => fp.type === 'REGULAR_UNLEADED'))
			.sort((a, b) => {
				const pa = a.fuelPrices.find((fp) => fp.type === 'REGULAR_UNLEADED')?.price ?? Infinity;
				const pb = b.fuelPrices.find((fp) => fp.type === 'REGULAR_UNLEADED')?.price ?? Infinity;
				return pa - pb;
			});
	});

	const priciestStations = $derived(cheapestStations.slice().reverse());

	function stationPrice(station: GasStation): string {
		const p = station.fuelPrices.find((fp) => fp.type === 'REGULAR_UNLEADED')?.price;
		return p != null ? '$' + p.toFixed(3) : '--';
	}

	function stationShortName(station: GasStation): string {
		// Trim long names
		const name = station.name;
		if (name.length > 22) return name.slice(0, 20) + '...';
		return name;
	}
</script>

<div class="h-full flex flex-col overflow-hidden px-6 py-3">
	<h2 class="text-base font-semibold text-gray-100 mb-2 shrink-0">Daily Life</h2>

	<div class="flex-1 grid grid-cols-3 gap-3 min-h-0">
		<!-- CAPPUCCINO COLUMN -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
						>Cappuccino</span
					>
					<span class="text-[10px] text-zinc-500"
						>{cappuccino?.current?.pricedShopCount ?? 0} shops</span
					>
				</div>
				<div class="flex items-center gap-2 mt-1">
					<span class="text-2xl font-bold tabular-nums" style="color: #a16207">
						{fmtPrice(cappuccino?.current?.medianPrice)}
					</span>
					<span class="text-[10px] text-zinc-500">median</span>
					{#if cappuccinoDelta}
						<span class="text-sm font-semibold tabular-nums {cappuccinoDelta.color}">
							{cappuccinoDelta.text}
						</span>
					{/if}
					{#if cappuccinoSparkline}
						<svg
							viewBox="0 0 {cappuccinoSparkline.w} {cappuccinoSparkline.h}"
							class="w-20 h-6 shrink-0 ml-auto"
						>
							<path d={cappuccinoSparkline.areaPath} fill="#a16207" opacity="0.15" />
							<path
								d={cappuccinoSparkline.linePath}
								fill="none"
								stroke="#a16207"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					{/if}
				</div>
			</div>

			<!-- Shop list -->
			<div class="flex-1 px-3 py-2 overflow-hidden">
				<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
					Shop Prices
				</div>
				{#each cappuccinoShops.slice(0, 6) as shop}
					<div class="flex items-center justify-between py-0.5">
						<div class="flex flex-col min-w-0 flex-1 mr-2">
							<span class="text-xs font-medium text-zinc-200 truncate">{shop.name}</span>
							<span class="text-[9px] text-zinc-500 truncate">{shop.town}</span>
						</div>
						<span class="text-sm font-bold tabular-nums text-zinc-100 shrink-0">
							{fmtPrice(shop.price)}
						</span>
					</div>
				{/each}
				{#if cappuccinoShops.length === 0}
					<p class="text-[10px] text-zinc-600">No shop data</p>
				{/if}
			</div>
		</div>

		<!-- GROCERY BASKET COLUMN -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
						>Grocery Basket</span
					>
					<span class="text-[10px] text-zinc-500">{grocery?.current?.itemsFound ?? 0} items</span>
				</div>
				<div class="flex items-center gap-2 mt-1">
					<span class="text-2xl font-bold tabular-nums" style="color: #f59e0b">
						{fmtPrice(grocery?.current?.totalCheapest)}
					</span>
					<span class="text-[10px] text-zinc-500">cheapest</span>
					{#if groceryDelta}
						<span class="text-sm font-semibold tabular-nums {groceryDelta.color}">
							{groceryDelta.text}
						</span>
					{/if}
					{#if grocerySparkline}
						<svg
							viewBox="0 0 {grocerySparkline.w} {grocerySparkline.h}"
							class="w-20 h-6 shrink-0 ml-auto"
						>
							<path d={grocerySparkline.areaPath} fill="#f59e0b" opacity="0.15" />
							<path
								d={grocerySparkline.linePath}
								fill="none"
								stroke="#f59e0b"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					{/if}
				</div>
			</div>

			<!-- Spread -->
			<div class="px-3 py-1.5 border-b border-gray-700/30">
				{#if grocery?.current?.totalCheapest != null && grocery?.current?.totalExpensive != null}
					<div class="flex items-center gap-1 text-[10px]">
						<span class="text-emerald-400 font-medium"
							>{fmtPrice(grocery.current.totalCheapest)}</span
						>
						<span class="text-zinc-600">&rarr;</span>
						<span class="text-amber-400 font-medium"
							>{fmtPrice(grocery.current.totalExpensive)}</span
						>
						<span class="text-zinc-600 ml-1">spread</span>
					</div>
				{/if}
			</div>

			<!-- Biggest Movers -->
			<div class="flex-1 px-3 py-2 overflow-hidden">
				<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
					Biggest Movers
				</div>
				{#each biggestMovers as item}
					<div class="flex items-center justify-between py-0.5">
						<div class="flex flex-col min-w-0 flex-1 mr-2">
							<span class="text-xs font-medium text-zinc-200 truncate">{item.itemName}</span>
							<span class="text-[9px] text-zinc-500 truncate">{item.cheapestStore ?? ''}</span>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							<span class="text-xs font-bold tabular-nums text-zinc-100">
								{fmtPrice(item.cheapest)}
							</span>
							<span
								class="text-[10px] font-semibold tabular-nums {item._delta <= 0
									? 'text-emerald-400'
									: 'text-red-400'}"
							>
								{item._delta >= 0 ? '+' : ''}{item._delta.toFixed(2)}
							</span>
						</div>
					</div>
				{/each}
				{#if biggestMovers.length === 0}
					<p class="text-[10px] text-zinc-600">No movement data yet</p>
				{/if}
			</div>
		</div>

		<!-- GAS COLUMN -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
						>Gas (Regular)</span
					>
					<span class="text-[10px] text-zinc-500">{gas?.current?.stationCount ?? 0} stations</span>
				</div>
				<div class="flex items-center gap-2 mt-1">
					<span class="text-2xl font-bold tabular-nums" style="color: #10b981">
						{gas?.current?.avgRegular != null ? '$' + gas.current.avgRegular.toFixed(3) : '--'}
					</span>
					<span class="text-[10px] text-zinc-500">avg</span>
					{#if gasDelta}
						<span class="text-sm font-semibold tabular-nums {gasDelta.color}">
							{gasDelta.text}
						</span>
					{/if}
					{#if gasSparkline}
						<svg viewBox="0 0 {gasSparkline.w} {gasSparkline.h}" class="w-20 h-6 shrink-0 ml-auto">
							<path d={gasSparkline.areaPath} fill="#10b981" opacity="0.15" />
							<path
								d={gasSparkline.linePath}
								fill="none"
								stroke="#10b981"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					{/if}
				</div>
			</div>

			<!-- Cheapest stations -->
			<div class="flex-1 px-3 py-2 overflow-hidden">
				<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
					Cheapest
				</div>
				{#each cheapestStations.slice(0, 3) as station}
					<div class="flex items-center justify-between py-0.5">
						<span class="text-xs font-medium text-zinc-200 truncate flex-1 mr-2">
							{stationShortName(station)}
						</span>
						<span class="text-sm font-bold tabular-nums text-emerald-400 shrink-0">
							{stationPrice(station)}
						</span>
					</div>
				{/each}

				<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mt-2 mb-1.5">
					Priciest
				</div>
				{#each priciestStations.slice(0, 3) as station}
					<div class="flex items-center justify-between py-0.5">
						<span class="text-xs font-medium text-zinc-200 truncate flex-1 mr-2">
							{stationShortName(station)}
						</span>
						<span class="text-sm font-bold tabular-nums text-amber-400 shrink-0">
							{stationPrice(station)}
						</span>
					</div>
				{/each}

				{#if cheapestStations.length === 0}
					<p class="text-[10px] text-zinc-600">No station data</p>
				{/if}
			</div>
		</div>
	</div>
</div>
