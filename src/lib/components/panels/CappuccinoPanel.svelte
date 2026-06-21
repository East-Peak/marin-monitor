<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { COFFEE_INDEX_DRINKS, COFFEE_INDEX_NAME, COFFEE_PRIMARY_DRINK } from '$lib/config/coffee';
	import { fetchCoffeeIndexData } from '$lib/api/marin/coffee';
	import { coffeeIndexStore } from '$lib/stores/coffee';
	import { townFilter, selectedTownObj } from '$lib/stores/town-filter';
	import { findNearestTown } from '$lib/geo';
	import { buildChart, type ChartPaths } from '$lib/utils/chart';
	import {
		formatCoffeePrice,
		getOrderedCoffeeDrinkPrices,
		sortCoffeeShopsByHeadline
	} from '$lib/utils/coffee-index';
	import type {
		CoffeeDrinkId,
		CoffeeDrinkPrice,
		CoffeeIndexData,
		CoffeeIndexShop
	} from '$lib/types/coffee';

	type HoverState = { index: number; x: number } | null;
	type SnapshotMetric = {
		label: string;
		value: string;
		detail: string;
		tone?: 'default' | 'positive' | 'warning';
	};
	type DrinkCard = {
		label: string;
		value: string;
		detail: string;
		tone?: 'default' | 'positive' | 'warning';
	};
	type ShopRow = {
		shop: CoffeeIndexShop;
		headline: CoffeeDrinkPrice | null;
		drinks: CoffeeDrinkPrice[];
	};

	const ACCENT = '#a16207';
	const CHART_HEIGHT = 200;
	const CHART_MARGINS = { top: 12, right: 10, bottom: 24, left: 44 };

	let data = $state<CoffeeIndexData>({ current: null, history: [] });
	let chartContainer = $state<HTMLDivElement>(undefined!);
	let chartWidth = $state(0);
	let dataLoading = $state(false);
	let hoverState = $state<HoverState>(null);

	const current = $derived(data.current);
	const currentPrimaryDrink = $derived<CoffeeDrinkId>(
		current?.primaryDrink ?? COFFEE_PRIMARY_DRINK
	);
	const currentPrimaryLabel = $derived(current?.primaryDrinkSummary.label ?? 'Coffee');
	const historySeries = $derived(
		data.history
			.filter((entry) => entry.primaryDrinkSummary.medianPrice !== null)
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
	);

	// Build chart geometry reactively via shared utility
	const chartPaths = $derived.by<ChartPaths | null>(() => {
		if (chartWidth === 0 || historySeries.length < 2) return null;
		return buildChart({
			width: chartWidth,
			height: CHART_HEIGHT,
			margins: CHART_MARGINS,
			accentColor: ACCENT,
			data: historySeries.map((entry) => ({
				value: entry.primaryDrinkSummary.medianPrice!,
				label: formatDate(entry.timestamp)
			}))
		});
	});

	const filteredShops = $derived.by<CoffeeIndexShop[]>(() => {
		if (!current?.shops) return [];
		if (!$townFilter) return current.shops;
		return current.shops.filter((shop) => findNearestTown(shop.lat, shop.lon) === $townFilter);
	});

	const shopRows = $derived.by<ShopRow[]>(() =>
		sortCoffeeShopsByHeadline(filteredShops, currentPrimaryDrink).map((shop) => {
			const drinks = getOrderedCoffeeDrinkPrices(shop, currentPrimaryDrink);
			return {
				shop,
				headline: drinks[0] ?? null,
				drinks
			};
		})
	);

	function computeMedian(values: number[]): number | null {
		if (values.length === 0) return null;
		const sorted = [...values].sort((a, b) => a - b);
		const middle = Math.floor(sorted.length / 2);
		if (sorted.length % 2 === 0) {
			return Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 100) / 100;
		}
		return sorted[middle];
	}

	const snapshotMetrics = $derived.by<SnapshotMetric[]>(() => {
		if (!current) return [];

		const primaryPrices = filteredShops
			.map((shop) => shop.prices[currentPrimaryDrink]?.price ?? null)
			.filter((price): price is number => price !== null);
		const filteredMedian = computeMedian(primaryPrices);
		const lastWeek = historySeries.length >= 2 ? historySeries[historySeries.length - 2] : null;
		const lastWeekMedian = lastWeek?.primaryDrinkSummary.medianPrice ?? null;
		const liveEligibleCount = current.liveMenuEligibleShopCount ?? current.shopCount;
		const priceDelta =
			current.primaryDrinkSummary.medianPrice !== null && lastWeekMedian !== null
				? Math.round((current.primaryDrinkSummary.medianPrice - lastWeekMedian) * 100) / 100
				: null;
		const townName = $selectedTownObj?.name;
		const displayMedian = $townFilter ? filteredMedian : current.primaryDrinkSummary.medianPrice;

		return [
			{
				label: currentPrimaryLabel,
				value: displayMedian !== null ? formatCoffeePrice(displayMedian) : 'N/A',
				detail: townName ? `Median in ${townName}` : 'Countywide median'
			},
			{
				label: 'Weekly Change',
				value:
					priceDelta !== null
						? `${priceDelta >= 0 ? '+' : ''}${formatCoffeePrice(Math.abs(priceDelta))}`
						: 'N/A',
				detail:
					priceDelta === null
						? 'Not enough history yet'
						: priceDelta <= 0
							? 'Stable or down'
							: 'Trending up',
				tone: priceDelta === null ? 'default' : priceDelta <= 0 ? 'positive' : 'warning'
			},
			{
				label: 'Live Sources',
				value: `${current.liveMenuShopCount}/${liveEligibleCount}`,
				detail: 'Freshly scraped priceable shops',
				tone: current.liveMenuShopCount >= Math.ceil(liveEligibleCount / 2) ? 'positive' : 'warning'
			},
			{
				label: 'Last Fresh',
				value: formatDate(current.lastSuccessfulScrapeAt ?? current.timestamp),
				detail: current.lastSuccessfulScrapeAt ? 'Last successful scrape' : 'Current snapshot time'
			}
		];
	});

	const drinkCards = $derived.by<DrinkCard[]>(() => {
		if (filteredShops.length === 0) return [];

		const cards: DrinkCard[] = [];

		for (const drink of COFFEE_INDEX_DRINKS) {
			const visiblePrices = filteredShops
				.map((shop) => shop.prices[drink.id] ?? null)
				.filter((price): price is CoffeeDrinkPrice => price !== null);

			if (visiblePrices.length === 0) continue;

			const medianPrice = computeMedian(visiblePrices.map((price) => price.price));
			cards.push({
				label: drink.label,
				value: medianPrice !== null ? formatCoffeePrice(medianPrice) : 'N/A',
				detail: `${visiblePrices.length} shops`,
				tone:
					drink.id === currentPrimaryDrink
						? 'default'
						: visiblePrices.length >= 4
							? 'positive'
							: 'warning'
			});
		}

		return cards;
	});

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	function updateHover(event: PointerEvent) {
		if (!chartPaths) return;
		const target = event.currentTarget as SVGSVGElement;
		const rect = target.getBoundingClientRect();
		const innerWidth = rect.width - CHART_MARGINS.left - CHART_MARGINS.right;
		const relativeX = Math.max(
			0,
			Math.min(innerWidth, event.clientX - rect.left - CHART_MARGINS.left)
		);
		const ratio = innerWidth <= 0 ? 0 : relativeX / innerWidth;
		const index = Math.max(
			0,
			Math.min(chartPaths.dots.length - 1, Math.round(ratio * (chartPaths.dots.length - 1)))
		);
		hoverState = { index, x: CHART_MARGINS.left + chartPaths.dots[index].x };
	}

	function clearHover() {
		hoverState = null;
	}

	function measureWidth() {
		if (chartContainer) {
			chartWidth = chartContainer.clientWidth;
		}
	}

	onMount(() => {
		measureWidth();

		let resizeTimer: ReturnType<typeof setTimeout>;
		function handleResize() {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(measureWidth, 150);
		}

		window.addEventListener('resize', handleResize);

		void (async () => {
			dataLoading = true;
			try {
				data = await fetchCoffeeIndexData();
				coffeeIndexStore.set(data);
			} finally {
				dataLoading = false;
			}
		})();

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	// Re-measure width when history arrives (container may have been hidden)
	$effect(() => {
		if (historySeries.length > 1) measureWidth();
	});
</script>

<Panel id="cappuccino" title={COFFEE_INDEX_NAME} loading={dataLoading}>
	{#if current}
		<div class="snapshot-bar">
			{#each snapshotMetrics as metric}
				<div class={`metric ${metric.tone ?? 'default'}`}>
					<span class="metric-value">{metric.value}</span>
					<span class="metric-label">{metric.label}</span>
					<span class="metric-detail">{metric.detail}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if historySeries.length > 1}
		<div class="chart-section">
			<div class="section-label">{currentPrimaryLabel} Trend</div>
			<div class="chart-wrap" bind:this={chartContainer}>
				{#if chartPaths}
					<svg
						class="chart-svg"
						width={chartWidth}
						height={CHART_HEIGHT}
						role="img"
						aria-label={`${currentPrimaryLabel} price trend`}
						onpointermove={updateHover}
						onpointerleave={clearHover}
					>
						<g transform={`translate(${CHART_MARGINS.left},${CHART_MARGINS.top})`}>
							<!-- Filled area -->
							<path d={chartPaths.areaPath} fill="rgba(161, 98, 7, 0.1)" />
							<!-- Line -->
							<path d={chartPaths.linePath} fill="none" stroke={ACCENT} stroke-width="1.5" />
							<!-- Dots -->
							{#each chartPaths.dots as dot}
								<circle cx={dot.x} cy={dot.y} r="2.2" fill={ACCENT} />
							{/each}
							<!-- Hover crosshair + highlight -->
							{#if hoverState}
								<line
									x1={chartPaths.dots[hoverState.index].x}
									x2={chartPaths.dots[hoverState.index].x}
									y1="0"
									y2={CHART_HEIGHT - CHART_MARGINS.top - CHART_MARGINS.bottom}
									stroke="rgba(255,255,255,0.35)"
									stroke-width="1"
									stroke-dasharray="3,3"
								/>
								<circle
									cx={chartPaths.dots[hoverState.index].x}
									cy={chartPaths.dots[hoverState.index].y}
									r="4"
									fill={ACCENT}
									stroke="#111"
									stroke-width="1"
								/>
							{/if}
							<!-- Y axis labels -->
							<text
								x="-4"
								y={chartPaths.yScale(chartPaths.yMax)}
								text-anchor="end"
								dominant-baseline="middle"
								fill="#888"
								font-size="7px">{formatCoffeePrice(chartPaths.yMax)}</text
							>
							<text
								x="-4"
								y={chartPaths.yScale(chartPaths.yMin)}
								text-anchor="end"
								dominant-baseline="middle"
								fill="#888"
								font-size="7px">{formatCoffeePrice(chartPaths.yMin)}</text
							>
							<!-- X axis labels -->
							{#each chartPaths.axisLabels.x as lbl}
								<text
									x={lbl.x}
									y={CHART_HEIGHT - CHART_MARGINS.top - CHART_MARGINS.bottom + 14}
									text-anchor="middle"
									fill="#666"
									font-size="7px">{lbl.label}</text
								>
							{/each}
						</g>
					</svg>
				{/if}
				{#if hoverState}
					<div class="chart-tooltip" style={`left:${Math.max(20, hoverState.x - 80)}px`}>
						<div class="tooltip-time">{formatDate(historySeries[hoverState.index].timestamp)}</div>
						<div class="tooltip-line">
							Median {formatCoffeePrice(
								historySeries[hoverState.index].primaryDrinkSummary.medianPrice!
							)}
						</div>
						<div class="tooltip-line">
							{historySeries[hoverState.index].primaryDrinkSummary.pricedShopCount} shops
						</div>
					</div>
				{/if}
			</div>
		</div>
	{:else if dataLoading}
		<div class="chart-loading">Loading coffee index...</div>
	{:else if !current}
		<div class="empty-state">Coffee index data will appear after the first sync cycle.</div>
	{/if}

	{#if drinkCards.length > 0}
		<div class="market-summary">
			{#each drinkCards as card}
				<div class={`summary-card ${card.tone ?? 'default'}`}>
					<div class="summary-label">{card.label}</div>
					<div class="summary-value">{card.value}</div>
					<div class="summary-detail">{card.detail}</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if shopRows.length > 0}
		<div class="shop-list-section">
			<div class="section-label">Shop Menus</div>
			{#each shopRows as row}
				<div class="shop-row">
					<div class="shop-info">
						<div class="shop-header">
							<span class="shop-name">{row.shop.name}</span>
							<span class="shop-town">{row.shop.town}</span>
						</div>
						<span class="shop-address">{row.shop.address}</span>
						<div class="shop-menu">
							{#if row.drinks.length > 0}
								{#each row.drinks as drink}
									<span class={`drink-chip ${drink.priceSource} ${drink.isStale ? 'stale' : ''}`}>
										{drink.label}
										{formatCoffeePrice(drink.price)}
									</span>
								{/each}
							{:else}
								<span class="drink-chip muted">Tracking soon</span>
							{/if}
						</div>
					</div>
					<span class={`shop-price ${row.headline?.priceSource ?? 'muted'}`}>
						{#if row.headline}
							{row.headline.label} {formatCoffeePrice(row.headline.price)}
						{:else}
							Tracking soon
						{/if}
					</span>
				</div>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.snapshot-bar {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 0.55rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.metric {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.14rem;
		padding: 0.65rem 0.45rem 0.55rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
		text-align: center;
	}

	.metric.positive {
		background: rgba(16, 185, 129, 0.08);
	}

	.metric.warning {
		background: rgba(245, 158, 11, 0.08);
	}

	.metric-value {
		font-size: 1.05rem;
		font-weight: 700;
		color: #a16207;
		letter-spacing: 0.01em;
	}

	.metric-label,
	.section-label,
	.summary-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.metric-detail,
	.summary-detail,
	.tooltip-line,
	.shop-address,
	.shop-town {
		font-size: 0.54rem;
		line-height: 1.35;
		color: var(--text-dim);
	}

	.chart-section,
	.shop-list-section {
		margin-bottom: 0.7rem;
		padding-bottom: 0.65rem;
		border-bottom: 1px solid var(--border);
	}

	.section-label {
		margin-bottom: 0.3rem;
	}

	.chart-wrap {
		position: relative;
	}

	.chart-svg {
		width: 100%;
		height: 200px;
		display: block;
	}

	.chart-tooltip {
		position: absolute;
		top: 0.25rem;
		z-index: 2;
		min-width: 124px;
		padding: 0.35rem 0.45rem;
		background: rgba(8, 8, 8, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.14);
		pointer-events: none;
		font-size: 0.55rem;
		line-height: 1.4;
	}

	.tooltip-time {
		color: var(--text);
		font-weight: 700;
		margin-bottom: 0.14rem;
	}

	.market-summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.summary-card {
		padding: 0.55rem 0.6rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.summary-card.positive {
		background: rgba(16, 185, 129, 0.08);
	}

	.summary-card.warning {
		background: rgba(245, 158, 11, 0.08);
	}

	.summary-value {
		margin-top: 0.14rem;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--text);
	}

	.shop-row {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.45rem 0;
	}

	.shop-info {
		display: flex;
		flex-direction: column;
		gap: 0.16rem;
		min-width: 0;
		flex: 1;
	}

	.shop-header {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.shop-name {
		font-size: 0.64rem;
		font-weight: 600;
		color: var(--text);
	}

	.shop-menu {
		display: flex;
		flex-wrap: wrap;
		gap: 0.28rem;
		margin-top: 0.12rem;
	}

	.drink-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.18rem;
		padding: 0.16rem 0.34rem;
		border-radius: 999px;
		font-size: 0.53rem;
		line-height: 1;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-secondary);
	}

	.drink-chip.live {
		border-color: rgba(161, 98, 7, 0.35);
		background: rgba(161, 98, 7, 0.12);
		color: #f5d5a7;
	}

	.drink-chip.hardcoded,
	.drink-chip.fallback,
	.shop-price.fallback,
	.shop-price.hardcoded {
		color: var(--text-dim);
	}

	.drink-chip.stale {
		opacity: 0.78;
	}

	.shop-price {
		font-size: 0.64rem;
		font-weight: 700;
		white-space: nowrap;
		color: #f5d5a7;
	}

	.shop-price.muted {
		color: var(--text-dim);
		font-weight: 500;
	}

	.chart-loading,
	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.65rem;
		padding: 0.75rem 0.5rem;
	}

	@media (max-width: 1100px) {
		.shop-row {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
