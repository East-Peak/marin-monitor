<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchGroceryBasketData } from '$lib/api/marin/grocery-basket';
	import { groceryBasketStore } from '$lib/stores/grocery-basket';
	import { select } from 'd3-selection';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';
	import type { GroceryBasketData, GrocerySnapshot, BasketItemPrices } from '$lib/types/grocery';

	type HoverState = { index: number; x: number } | null;

	const CHART_LEFT = 44;
	const CHART_RIGHT = 10;
	const ACCENT = '#f59e0b'; // amber for grocery/market theme

	let data = $state<GroceryBasketData>({ current: null, history: [] });
	let chartSvg = $state<SVGSVGElement>(undefined!);
	let dataLoading = $state(false);
	let hoverState = $state<HoverState>(null);
	let showAllItems = $state(false);

	const current = $derived(data.current);
	const history = $derived(
		data.history
			.filter((h) => h.totalCheapest !== null)
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
	);

	const weekOverWeekChange = $derived.by<number | null>(() => {
		if (!current?.totalCheapest || history.length < 2) return null;
		const prev = history[history.length - 2];
		if (!prev?.totalCheapest) return null;
		return Math.round((current.totalCheapest - prev.totalCheapest) * 100) / 100;
	});

	const biggestMovers = $derived.by<(BasketItemPrices & { _delta: number })[]>(() => {
		if (!current?.items || history.length < 2) return [];
		const prevSnapshot = history[history.length - 2];
		if (!prevSnapshot?.items) return [];

		const prevMap = new Map(prevSnapshot.items.map((i) => [i.itemId, i.cheapest]));

		return [...current.items]
			.filter((item) => item.cheapest !== null && prevMap.has(item.itemId) && prevMap.get(item.itemId) !== null)
			.map((item) => ({
				...item,
				_delta: item.cheapest! - (prevMap.get(item.itemId) ?? 0)
			}))
			.sort((a, b) => Math.abs(b._delta) - Math.abs(a._delta))
			.slice(0, 3);
	});

	function formatPrice(price: number): string {
		return `$${price.toFixed(2)}`;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	function updateHover(event: PointerEvent) {
		if (history.length === 0) return;
		const target = event.currentTarget as SVGSVGElement;
		const rect = target.getBoundingClientRect();
		const innerWidth = rect.width - CHART_LEFT - CHART_RIGHT;
		const relativeX = Math.max(0, Math.min(innerWidth, event.clientX - rect.left - CHART_LEFT));
		const ratio = innerWidth <= 0 ? 0 : relativeX / innerWidth;
		const index = Math.max(
			0,
			Math.min(history.length - 1, Math.round(ratio * (history.length - 1)))
		);
		const pointX =
			CHART_LEFT + (innerWidth * index) / Math.max(history.length - 1, 1);
		hoverState = { index, x: pointX };
	}

	function clearHover() {
		hoverState = null;
	}

	function drawChart() {
		if (!chartSvg || history.length < 2) return;

		const svg = select(chartSvg);
		svg.selectAll('*').remove();

		const width = chartSvg.clientWidth;
		const height = 180;
		const margin = { top: 12, right: CHART_RIGHT, bottom: 24, left: CHART_LEFT };
		const innerW = width - margin.left - margin.right;
		const innerH = height - margin.top - margin.bottom;

		const prices = history.map((h) => h.totalCheapest!);
		const yMin = Math.min(...prices) * 0.97;
		const yMax = Math.max(...prices) * 1.03;

		const x = scaleLinear()
			.domain([0, history.length - 1])
			.range([0, innerW]);
		const y = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

		const g = svg
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		const areaGen = area<GrocerySnapshot>()
			.x((_d, i) => x(i))
			.y0(innerH)
			.y1((d) => y(d.totalCheapest!))
			.curve(curveMonotoneX);

		g.append('path')
			.datum(history)
			.attr('d', areaGen)
			.attr('fill', 'rgba(245, 158, 11, 0.1)');

		const lineGen = line<GrocerySnapshot>()
			.x((_d, i) => x(i))
			.y((d) => y(d.totalCheapest!))
			.curve(curveMonotoneX);

		g.append('path')
			.datum(history)
			.attr('d', lineGen)
			.attr('fill', 'none')
			.attr('stroke', ACCENT)
			.attr('stroke-width', 1.5);

		g.selectAll('.dot')
			.data(history)
			.enter()
			.append('circle')
			.attr('cx', (_d, i) => x(i))
			.attr('cy', (d) => y(d.totalCheapest!))
			.attr('r', 2.5)
			.attr('fill', ACCENT);

		if (hoverState) {
			g.append('line')
				.attr('x1', x(hoverState.index))
				.attr('x2', x(hoverState.index))
				.attr('y1', 0)
				.attr('y2', innerH)
				.attr('stroke', 'rgba(255,255,255,0.35)')
				.attr('stroke-width', 1)
				.attr('stroke-dasharray', '3,3');

			g.append('circle')
				.attr('cx', x(hoverState.index))
				.attr('cy', y(history[hoverState.index].totalCheapest!))
				.attr('r', 4)
				.attr('fill', ACCENT)
				.attr('stroke', '#111')
				.attr('stroke-width', 1);
		}

		// Y axis labels
		g.append('text')
			.attr('x', -4)
			.attr('y', y(yMax))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '7px')
			.text(formatPrice(yMax));

		g.append('text')
			.attr('x', -4)
			.attr('y', y(yMin))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '7px')
			.text(formatPrice(yMin));

		// X axis labels
		const labelIndices = [0, Math.floor(history.length / 2), history.length - 1];
		for (const idx of labelIndices) {
			g.append('text')
				.attr('x', x(idx))
				.attr('y', innerH + 14)
				.attr('text-anchor', 'middle')
				.attr('fill', '#666')
				.attr('font-size', '7px')
				.text(formatDate(history[idx].timestamp));
		}
	}

	onMount(() => {
		let resizeTimer: ReturnType<typeof setTimeout>;
		function handleResize() {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				if (history.length > 1 && chartSvg) drawChart();
			}, 150);
		}

		window.addEventListener('resize', handleResize);

		void (async () => {
			dataLoading = true;
			try {
				data = await fetchGroceryBasketData();
				groceryBasketStore.set(data);
			} finally {
				dataLoading = false;
			}
		})();

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	$effect(() => {
		if (history.length > 1 && chartSvg) drawChart();
	});
</script>

<Panel id="grocery-basket" title="The Bare Essentials" loading={dataLoading}>
	{#if current}
		<div class="headline-bar">
			<div class="basket-total">
				<span class="total-value">{current.totalCheapest !== null ? formatPrice(current.totalCheapest) : 'N/A'}</span>
				<span class="total-label">12-item basket</span>
			</div>
			{#if weekOverWeekChange !== null}
				<div class="week-change {weekOverWeekChange <= 0 ? 'positive' : 'warning'}">
					<span class="change-value">
						{weekOverWeekChange >= 0 ? '+' : ''}{formatPrice(weekOverWeekChange)}
					</span>
					<span class="change-label">vs last week</span>
				</div>
			{/if}
			<div class="items-found">
				<span class="found-value">{current.itemsFound}/12</span>
				<span class="found-label">items priced</span>
			</div>
		</div>

		{#if current.totalExpensive !== null && current.totalCheapest !== null}
			<div class="spread-bar">
				<span class="spread-label">Spread:</span>
				<span class="spread-cheap">{formatPrice(current.totalCheapest)} cheapest mix</span>
				<span class="spread-sep">&rarr;</span>
				<span class="spread-expensive">{formatPrice(current.totalExpensive)} premium stores</span>
			</div>
		{/if}
	{/if}

	{#if history.length > 1}
		<div class="chart-section">
			<div class="section-label">Basket Cost Trend (cheapest mix)</div>
			<div class="chart-wrap">
				<svg
					class="chart-svg"
					bind:this={chartSvg}
					role="img"
					aria-label="Grocery basket cost trend"
					onpointermove={updateHover}
					onpointerleave={clearHover}
				></svg>
				{#if hoverState}
					<div class="chart-tooltip" style={`left:${Math.max(20, hoverState.x - 80)}px`}>
						<div class="tooltip-time">{formatDate(history[hoverState.index].timestamp)}</div>
						{#if history[hoverState.index].totalCheapest !== null}
							<div class="tooltip-line">
								Basket {formatPrice(history[hoverState.index].totalCheapest!)}
							</div>
						{/if}
						<div class="tooltip-line tooltip-dim">
							{history[hoverState.index].itemsFound}/12 items
						</div>
					</div>
				{/if}
			</div>
		</div>
	{:else if dataLoading}
		<div class="chart-loading">Loading grocery basket data...</div>
	{:else if !current}
		<div class="empty-state">Grocery basket data will appear after the first weekly sync.</div>
	{/if}

	{#if biggestMovers.length > 0}
		<div class="movers-section">
			<div class="section-label">Biggest Movers This Week</div>
			{#each biggestMovers as item}
				<div class="item-row">
					<div class="item-info">
						<span class="item-name">{item.itemName}</span>
						<span class="item-store">{item.cheapestStore ?? ''}</span>
					</div>
					<div class="item-prices">
						<span class="item-price">{item.cheapest !== null ? formatPrice(item.cheapest) : 'N/A'}</span>
						<span class="item-delta {item._delta <= 0 ? 'positive' : 'warning'}">
							{item._delta >= 0 ? '+' : ''}{formatPrice(item._delta)}
						</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if current?.items && current.items.length > 0}
		<div class="items-section">
			<button class="toggle-items" onclick={() => (showAllItems = !showAllItems)}>
				<span class="section-label">{showAllItems ? 'Hide' : 'Show'} All Items</span>
				<span class="toggle-arrow">{showAllItems ? '\u25B2' : '\u25BC'}</span>
			</button>

			{#if showAllItems}
				<div class="item-list">
					{#each current.items as item}
						<div class="item-row">
							<div class="item-info">
								<span class="item-name">{item.itemName}</span>
								<span class="item-store">
									{#if item.cheapestStore}
										{item.cheapestStore}
										{#if item.mostExpensiveStore && item.mostExpensiveStore !== item.cheapestStore}
											&mdash; {item.mostExpensiveStore}
										{/if}
									{:else}
										Not found
									{/if}
								</span>
							</div>
							<div class="item-prices">
								{#if item.cheapest !== null}
									<span class="item-price positive">{formatPrice(item.cheapest)}</span>
									{#if item.mostExpensive !== null && item.mostExpensive !== item.cheapest}
										<span class="item-price-range">&ndash; {formatPrice(item.mostExpensive)}</span>
									{/if}
								{:else}
									<span class="item-price dim">N/A</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</Panel>

<style>
	.headline-bar {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0.75rem;
		align-items: center;
		margin-bottom: 0.65rem;
		padding-bottom: 0.65rem;
		border-bottom: 1px solid var(--border);
	}

	.basket-total {
		text-align: left;
	}

	.total-value {
		display: block;
		font-size: 1.4rem;
		font-weight: 700;
		color: #f59e0b;
		letter-spacing: 0.01em;
	}

	.total-label {
		display: block;
		font-size: 0.52rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.1rem;
	}

	.week-change {
		text-align: center;
		padding: 0.45rem 0.6rem;
		border-radius: 4px;
	}

	.week-change.positive {
		background: rgba(16, 185, 129, 0.1);
	}

	.week-change.warning {
		background: rgba(245, 158, 11, 0.1);
	}

	.change-value {
		display: block;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text);
	}

	.week-change.positive .change-value {
		color: #10b981;
	}

	.week-change.warning .change-value {
		color: #f59e0b;
	}

	.change-label {
		display: block;
		font-size: 0.48rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.items-found {
		text-align: center;
	}

	.found-value {
		display: block;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text);
	}

	.found-label {
		display: block;
		font-size: 0.48rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.spread-bar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.55rem;
		color: var(--text-dim);
		margin-bottom: 0.65rem;
		padding-bottom: 0.65rem;
		border-bottom: 1px solid var(--border);
	}

	.spread-label {
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		font-size: 0.5rem;
	}

	.spread-cheap {
		color: #10b981;
	}

	.spread-sep {
		color: var(--text-muted);
	}

	.spread-expensive {
		color: #f59e0b;
	}

	.chart-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.65rem;
		border-bottom: 1px solid var(--border);
	}

	.section-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
	}

	.chart-svg {
		width: 100%;
		height: 180px;
		display: block;
	}

	.chart-wrap {
		position: relative;
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

	.tooltip-line {
		color: var(--text-dim);
	}

	.tooltip-dim {
		color: var(--text-muted);
		font-size: 0.5rem;
	}

	.movers-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.items-section {
		margin-bottom: 0.35rem;
	}

	.toggle-items {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.35rem 0;
		border: none;
		background: none;
		cursor: pointer;
		color: var(--text-muted);
	}

	.toggle-arrow {
		font-size: 0.5rem;
		color: var(--text-muted);
	}

	.item-list {
		margin-top: 0.25rem;
	}

	.item-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.3rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}

	.item-row:last-child {
		border-bottom: none;
	}

	.item-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.item-name {
		font-size: 0.58rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-store {
		font-size: 0.48rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-prices {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-left: 0.5rem;
		white-space: nowrap;
	}

	.item-price {
		font-size: 0.68rem;
		font-weight: 700;
	}

	.item-price.positive {
		color: #10b981;
	}

	.item-price.dim {
		color: var(--text-muted);
	}

	.item-price-range {
		font-size: 0.55rem;
		color: var(--text-dim);
	}

	.item-delta {
		font-size: 0.55rem;
		font-weight: 600;
	}

	.item-delta.positive {
		color: #10b981;
	}

	.item-delta.warning {
		color: #f59e0b;
	}

	.chart-loading {
		font-size: 0.6rem;
		color: var(--text-muted);
		text-align: center;
		padding: 0.5rem;
	}

	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.7rem;
		padding: 1rem;
	}

	@media (max-width: 600px) {
		.headline-bar {
			grid-template-columns: 1fr;
			gap: 0.4rem;
		}

		.week-change,
		.items-found {
			text-align: left;
		}
	}
</style>
