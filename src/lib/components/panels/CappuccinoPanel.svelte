<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchCappuccinoData } from '$lib/api/marin/cappuccino';
	import { cappuccinoStore } from '$lib/stores/cappuccino';
	import { townFilter, selectedTownObj } from '$lib/stores/town-filter';
	import { findNearestTown } from '$lib/geo';
	import { select } from 'd3-selection';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';
	import type { CoffeeData, CoffeeSnapshot, CoffeeShop } from '$lib/types/coffee';

	type HoverState = { index: number; x: number } | null;
	type SummaryCard = {
		label: string;
		value: string;
		detail: string;
		tone?: 'default' | 'positive' | 'warning';
	};

	const CHART_LEFT = 44;
	const CHART_RIGHT = 10;
	const ACCENT = '#a16207'; // warm brown for coffee

	let data = $state<CoffeeData>({ current: null, history: [] });
	let chartSvg = $state<SVGSVGElement>(undefined!);
	let dataLoading = $state(false);
	let hoverState = $state<HoverState>(null);

	const current = $derived(data.current);
	const history = $derived(
		data.history
			.filter((h) => h.medianPrice !== null)
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
	);

	// Filter shops by selected town (proximity match)
	const filteredShops = $derived.by<CoffeeShop[]>(() => {
		if (!current?.shops) return [];
		if (!$townFilter) return current.shops;
		return current.shops.filter(
			(s) => findNearestTown(s.lat, s.lon) === $townFilter
		);
	});

	// Only shops with a cappuccino price (excludes Philz)
	const pricedShops = $derived(
		filteredShops
			.filter((s) => s.price !== null)
			.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
	);

	// Philz and other alt-drink shops
	const altDrinkShops = $derived(
		filteredShops.filter((s) => s.price === null && s.altDrink)
	);

	const summaryCards = $derived.by<SummaryCard[]>(() => {
		if (!current) return [];

		const townName = $selectedTownObj?.name;

		// Compute median from filtered shops
		const prices = pricedShops.map((s) => s.price!);
		const sortedPrices = [...prices].sort((a, b) => a - b);
		const filteredMedian =
			sortedPrices.length > 0
				? sortedPrices.length % 2 === 0
					? Math.round(((sortedPrices[Math.floor(sortedPrices.length / 2) - 1] + sortedPrices[Math.floor(sortedPrices.length / 2)]) / 2) * 100) / 100
					: sortedPrices[Math.floor(sortedPrices.length / 2)]
				: null;

		const displayMedian = $townFilter ? filteredMedian : current.medianPrice;

			// Week-over-week change (history is weekly)
			const lastWeek = history.length >= 2 ? history[history.length - 2] : null;
			const priceDelta =
				current.medianPrice !== null && lastWeek && lastWeek.medianPrice !== null
					? Math.round((current.medianPrice - lastWeek.medianPrice) * 100) / 100
					: null;

		const cheapest = pricedShops[0];
		const priciest = pricedShops[pricedShops.length - 1];

		return [
			{
				label: 'Median Cappuccino',
				value: displayMedian !== null ? `$${displayMedian.toFixed(2)}` : 'N/A',
				detail: townName ? `In ${townName}` : 'County-wide median',
				tone: 'default' as const
			},
			{
				label: 'Weekly Change',
				value:
					priceDelta !== null
						? `${priceDelta >= 0 ? '+' : ''}$${Math.abs(priceDelta).toFixed(2)}`
						: 'N/A',
				detail:
					priceDelta !== null
						? priceDelta <= 0
							? 'Prices stable or down'
							: 'Prices trending up'
						: 'Not enough history yet',
				tone:
					priceDelta !== null
						? priceDelta <= 0
							? ('positive' as const)
							: ('warning' as const)
						: ('default' as const)
			},
			{
				label: 'Cheapest',
				value: cheapest?.price != null ? `$${cheapest.price.toFixed(2)}` : 'N/A',
				detail: cheapest?.name ?? (townName ? `No shops in ${townName}` : 'No data'),
				tone: 'positive' as const
			},
			{
				label: 'Most Expensive',
				value: priciest?.price != null ? `$${priciest.price.toFixed(2)}` : 'N/A',
				detail: priciest?.name ?? 'No data',
				tone: 'warning' as const
			}
		];
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
		const height = 200;
		const margin = { top: 12, right: CHART_RIGHT, bottom: 24, left: CHART_LEFT };
		const innerW = width - margin.left - margin.right;
		const innerH = height - margin.top - margin.bottom;

		const prices = history.map((h) => h.medianPrice!);
		const yMin = Math.min(...prices) * 0.98;
		const yMax = Math.max(...prices) * 1.02;

		const x = scaleLinear()
			.domain([0, history.length - 1])
			.range([0, innerW]);
		const y = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

		const g = svg
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		const areaGen = area<CoffeeSnapshot>()
			.x((_d, i) => x(i))
			.y0(innerH)
			.y1((d) => y(d.medianPrice!))
			.curve(curveMonotoneX);

		g.append('path')
			.datum(history)
			.attr('d', areaGen)
			.attr('fill', 'rgba(161, 98, 7, 0.1)');

		const lineGen = line<CoffeeSnapshot>()
			.x((_d, i) => x(i))
			.y((d) => y(d.medianPrice!))
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
			.attr('cy', (d) => y(d.medianPrice!))
			.attr('r', 2.2)
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
				.attr('cy', y(history[hoverState.index].medianPrice!))
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
				data = await fetchCappuccinoData();
				cappuccinoStore.set(data);
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

<Panel id="cappuccino" title="Cappuccino Index" loading={dataLoading}>
	{#if current}
		<div class="snapshot-bar">
			{#if current.medianPrice !== null}
				<div class="metric">
					<span class="metric-value">${current.medianPrice.toFixed(2)}</span>
					<span class="metric-label">Median</span>
				</div>
			{/if}
			{#if current.minPrice !== null}
				<div class="metric">
					<span class="metric-value">${current.minPrice.toFixed(2)}</span>
					<span class="metric-label">Cheapest</span>
				</div>
			{/if}
			{#if current.maxPrice !== null}
				<div class="metric">
					<span class="metric-value">${current.maxPrice.toFixed(2)}</span>
					<span class="metric-label">Priciest</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if history.length > 1}
		<div class="chart-section">
			<div class="section-label">Median Cappuccino Price Trend</div>
			<div class="chart-wrap">
				<svg
					class="chart-svg"
					bind:this={chartSvg}
					role="img"
					aria-label="Median cappuccino price trend"
					onpointermove={updateHover}
					onpointerleave={clearHover}
				></svg>
				{#if hoverState}
					<div class="chart-tooltip" style={`left:${Math.max(20, hoverState.x - 80)}px`}>
						<div class="tooltip-time">{formatDate(history[hoverState.index].timestamp)}</div>
						{#if history[hoverState.index].medianPrice !== null}
							<div class="tooltip-line">
								Median ${history[hoverState.index].medianPrice!.toFixed(2)}
							</div>
						{/if}
						{#if history[hoverState.index].avgPrice !== null}
							<div class="tooltip-line">
								Average ${history[hoverState.index].avgPrice!.toFixed(2)}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{:else if dataLoading}
		<div class="chart-loading">Loading cappuccino data...</div>
	{:else if !current}
		<div class="empty-state">Cappuccino price data will appear after the first sync cycle.</div>
	{/if}

	{#if summaryCards.length > 0}
		<div class="market-summary">
			{#each summaryCards as card}
				<div class={`summary-card ${card.tone ?? 'default'}`}>
					<div class="summary-label">{card.label}</div>
					<div class="summary-value">{card.value}</div>
					<div class="summary-detail">{card.detail}</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if pricedShops.length > 0}
		<div class="shop-list-section">
			<div class="section-label">All Shops (cheapest first)</div>
			{#each pricedShops as shop}
				<div class="shop-row">
					<div class="shop-info">
						<span class="shop-name">{shop.name}</span>
						<span class="shop-address">{shop.address}</span>
					</div>
					<span class={`shop-price ${shop.price === current?.minPrice ? 'positive' : shop.price === current?.maxPrice ? 'warning' : ''}`}>
						${shop.price!.toFixed(2)}
					</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if altDrinkShops.length > 0}
		<div class="shop-list-section">
			<div class="section-label">No Cappuccino</div>
			{#each altDrinkShops as shop}
				<div class="shop-row">
					<div class="shop-info">
						<span class="shop-name">{shop.name}</span>
						<span class="shop-address">{shop.altDrink} {shop.altPrice ? `$${shop.altPrice.toFixed(2)}` : ''}</span>
					</div>
					<span class="shop-price muted">N/A</span>
				</div>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.snapshot-bar {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
		gap: 0.55rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.metric {
		text-align: center;
		padding: 0.65rem 0.45rem 0.55rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.metric-value {
		display: block;
		font-size: 1.1rem;
		font-weight: 700;
		color: #a16207;
		letter-spacing: 0.01em;
	}

	.metric-label {
		display: block;
		font-size: 0.58rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.18rem;
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
		height: 200px;
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

	.market-summary {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
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

	.summary-label {
		font-size: 0.52rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.summary-value {
		margin-top: 0.14rem;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text);
	}

	.summary-detail {
		margin-top: 0.12rem;
		font-size: 0.54rem;
		line-height: 1.35;
		color: var(--text-dim);
	}

	.shop-list-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.shop-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0;
	}

	.shop-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.shop-name {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.shop-address {
		font-size: 0.52rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.shop-price {
		font-size: 0.72rem;
		font-weight: 700;
		margin-left: 0.5rem;
		white-space: nowrap;
	}

	.shop-price.positive {
		color: #10b981;
	}

	.shop-price.warning {
		color: #f59e0b;
	}

	.shop-price.muted {
		color: var(--text-dim);
		font-weight: 400;
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

	@media (max-width: 1100px) {
		.market-summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
