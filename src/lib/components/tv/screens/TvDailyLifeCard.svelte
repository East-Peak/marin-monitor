<script lang="ts">
	import type { CoffeeData } from '$lib/types/coffee';
	import type { GroceryBasketData } from '$lib/types/grocery';
	import type { GasPriceData } from '$lib/types/gas';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';

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

	function fmtDelta(
		current: number | null | undefined,
		previous: number | null | undefined
	): { text: string; color: string } | null {
		if (current == null || previous == null) return null;
		const diff = current - previous;
		if (Math.abs(diff) < 0.005) return { text: '—', color: 'text-zinc-500' };
		const sign = diff > 0 ? '+' : '-';
		const color = diff > 0 ? 'text-red-400' : 'text-emerald-400';
		return { text: `${sign}$${Math.abs(diff).toFixed(2)}`, color };
	}

	function makeSparkline(
		values: (number | null | undefined)[],
		svgW: number,
		svgH: number
	): { linePath: string | null; areaPath: string | null; w: number; h: number } | null {
		const clean = values.filter((v): v is number => v != null);
		if (clean.length < 2) return null;
		const w = svgW,
			h = svgH;
		const x = scaleLinear().domain([0, clean.length - 1]).range([0, w]);
		const y = scaleLinear()
			.domain([Math.min(...clean) * 0.95, Math.max(...clean) * 1.05])
			.range([h, 0]);
		const linePath = line<number>()
			.x((_, i) => x(i))
			.y((d) => y(d))
			.curve(curveMonotoneX)(clean);
		const areaPath = area<number>()
			.x((_, i) => x(i))
			.y0(h)
			.y1((d) => y(d))
			.curve(curveMonotoneX)(clean);
		return { linePath, areaPath, w, h };
	}

	const cappuccinoSparkline = $derived.by(() =>
		makeSparkline(
			cappuccino?.history?.map((h) => h.medianPrice) ?? [],
			240,
			80
		)
	);

	const grocerySparkline = $derived.by(() =>
		makeSparkline(
			grocery?.history?.map((h) => h.totalCheapest) ?? [],
			240,
			80
		)
	);

	const gasSparkline = $derived.by(() =>
		makeSparkline(
			gas?.history?.map((h) => h.avgRegular) ?? [],
			240,
			80
		)
	);

	const cappuccinoDelta = $derived(
		fmtDelta(cappuccino?.current?.medianPrice, cappuccino?.history?.[1]?.medianPrice)
	);
	const groceryDelta = $derived(
		fmtDelta(grocery?.current?.totalCheapest, grocery?.history?.[1]?.totalCheapest)
	);
	const gasDelta = $derived(
		fmtDelta(gas?.current?.avgRegular, gas?.history?.[1]?.avgRegular)
	);
</script>

<div class="h-full flex flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Daily Life</h2>

	<div class="mt-4 grid flex-1 grid-cols-3 gap-6">
		<!-- Cappuccino -->
		<div
			class="rounded-xl bg-zinc-800/60 flex flex-col"
			style="border-top: 4px solid #a16207"
		>
			<div class="flex-1 flex flex-col items-center justify-center p-6">
				<p class="text-base font-medium uppercase tracking-wider text-zinc-400">
					Cappuccino
				</p>
				<p class="mt-3 text-6xl font-bold tabular-nums text-white">
					{fmtPrice(cappuccino?.current?.medianPrice)}
				</p>
				{#if cappuccinoDelta}
					<p class="mt-2 text-xl font-semibold tabular-nums {cappuccinoDelta.color}">
						{cappuccinoDelta.text}
					</p>
				{/if}
				<p class="mt-2 text-base text-zinc-500">
					median across {cappuccino?.current?.pricedShopCount ?? '—'} shops
				</p>
			</div>
			{#if cappuccinoSparkline}
				<div class="px-4 pb-4">
					<svg
						viewBox="0 0 {cappuccinoSparkline.w} {cappuccinoSparkline.h}"
						class="w-full h-20"
						preserveAspectRatio="none"
					>
						<path d={cappuccinoSparkline.areaPath} fill="#a16207" opacity="0.15" />
						<path
							d={cappuccinoSparkline.linePath}
							fill="none"
							stroke="#a16207"
							stroke-width="2"
						/>
					</svg>
				</div>
			{/if}
		</div>

		<!-- Grocery Basket -->
		<div
			class="rounded-xl bg-zinc-800/60 flex flex-col"
			style="border-top: 4px solid #f59e0b"
		>
			<div class="flex-1 flex flex-col items-center justify-center p-6">
				<p class="text-base font-medium uppercase tracking-wider text-zinc-400">
					Grocery Basket
				</p>
				<p class="mt-3 text-6xl font-bold tabular-nums text-white">
					{fmtPrice(grocery?.current?.totalCheapest)}
				</p>
				{#if groceryDelta}
					<p class="mt-2 text-xl font-semibold tabular-nums {groceryDelta.color}">
						{groceryDelta.text}
					</p>
				{/if}
				<p class="mt-2 text-base text-zinc-500">
					{grocery?.current?.itemsFound ?? '—'} items, cheapest options
				</p>
			</div>
			{#if grocerySparkline}
				<div class="px-4 pb-4">
					<svg
						viewBox="0 0 {grocerySparkline.w} {grocerySparkline.h}"
						class="w-full h-20"
						preserveAspectRatio="none"
					>
						<path d={grocerySparkline.areaPath} fill="#f59e0b" opacity="0.15" />
						<path
							d={grocerySparkline.linePath}
							fill="none"
							stroke="#f59e0b"
							stroke-width="2"
						/>
					</svg>
				</div>
			{/if}
		</div>

		<!-- Gas -->
		<div
			class="rounded-xl bg-zinc-800/60 flex flex-col"
			style="border-top: 4px solid #10b981"
		>
			<div class="flex-1 flex flex-col items-center justify-center p-6">
				<p class="text-base font-medium uppercase tracking-wider text-zinc-400">
					Gas (Regular)
				</p>
				<p class="mt-3 text-6xl font-bold tabular-nums text-white">
					{fmtPrice(gas?.current?.avgRegular)}
				</p>
				{#if gasDelta}
					<p class="mt-2 text-xl font-semibold tabular-nums {gasDelta.color}">
						{gasDelta.text}
					</p>
				{/if}
				<p class="mt-2 text-base text-zinc-500">
					avg across {gas?.current?.stationCount ?? '—'} stations
				</p>
			</div>
			{#if gasSparkline}
				<div class="px-4 pb-4">
					<svg
						viewBox="0 0 {gasSparkline.w} {gasSparkline.h}"
						class="w-full h-20"
						preserveAspectRatio="none"
					>
						<path d={gasSparkline.areaPath} fill="#10b981" opacity="0.15" />
						<path
							d={gasSparkline.linePath}
							fill="none"
							stroke="#10b981"
							stroke-width="2"
						/>
					</svg>
				</div>
			{/if}
		</div>
	</div>
</div>
