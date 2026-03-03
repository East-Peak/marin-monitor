<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { housingNews } from '$lib/stores/news';
	import { townFilter } from '$lib/stores/town-filter';
	import { fetchHousingData, type HousingMetric } from '$lib/api/marin/housing';
	import { select } from 'd3-selection';
	import type { Selection } from 'd3-selection';
	import { scaleLinear } from 'd3-scale';
	import type { ScaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';

	type HoverChart = 'price' | 'inventory';
	type HoverState = { chart: HoverChart; index: number; x: number } | null;
	type SummaryCard = {
		label: string;
		value: string;
		detail: string;
		tone?: 'default' | 'positive' | 'warning';
	};

	const CHART_LEFT = 44;
	const CHART_RIGHT = 10;

	let housingData = $state<HousingMetric[]>([]);
	let priceSvg = $state<SVGSVGElement>(undefined!);
	let inventorySvg = $state<SVGSVGElement>(undefined!);
	let dataLoading = $state(false);
	let hoverState = $state<HoverState>(null);

	const latestMetrics = $derived(
		housingData.length > 0 ? housingData[housingData.length - 1] : null
	);
	const firstMetrics = $derived(housingData.length > 0 ? housingData[0] : null);
	const priceData = $derived(housingData.filter((d) => d.medianPrice !== null));
	const inventoryData = $derived(housingData.filter((d) => d.inventory !== null));
	const summaryCards = $derived.by<SummaryCard[]>(() => {
		if (!latestMetrics || !firstMetrics) return [];

		const priceDelta = percentageDelta(latestMetrics.medianPrice, firstMetrics.medianPrice);
		const inventoryDelta = percentageDelta(latestMetrics.inventory, firstMetrics.inventory);
		const domDelta = absoluteDelta(latestMetrics.daysOnMarket, firstMetrics.daysOnMarket);

		const marketRead = getMarketRead(priceDelta, inventoryDelta, domDelta);

		return [
			{
				label: '12M Price',
				value: formatDeltaPercent(priceDelta),
				detail: `${formatMonthLabel(firstMetrics.month)} → ${formatMonthLabel(latestMetrics.month)}`,
				tone: priceDelta !== null && priceDelta >= 0 ? 'positive' : 'warning'
			},
			{
				label: 'Inventory',
				value: formatDeltaPercent(inventoryDelta),
				detail:
					latestMetrics.inventory !== null
						? `${latestMetrics.inventory} active listings now`
						: 'Latest inventory unavailable',
				tone: inventoryDelta !== null && inventoryDelta <= 0 ? 'positive' : 'warning'
			},
			{
				label: 'Days on Market',
				value: formatDayDelta(domDelta),
				detail:
					latestMetrics.daysOnMarket !== null
						? `${latestMetrics.daysOnMarket} days median`
						: 'Latest DOM unavailable',
				tone: domDelta !== null && domDelta <= 0 ? 'positive' : 'warning'
			},
			{
				label: 'Market Read',
				value: marketRead.label,
				detail: marketRead.detail,
				tone: marketRead.tone
			}
		];
	});

	function formatPrice(price: number): string {
		if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`;
		return `$${(price / 1000).toFixed(0)}K`;
	}

	function formatMonthLabel(month: string): string {
		return new Date(month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
	}

	function percentageDelta(current: number | null, baseline: number | null): number | null {
		if (current === null || baseline === null || baseline === 0) return null;
		return ((current - baseline) / baseline) * 100;
	}

	function absoluteDelta(current: number | null, baseline: number | null): number | null {
		if (current === null || baseline === null) return null;
		return current - baseline;
	}

	function formatDeltaPercent(value: number | null): string {
		if (value === null) return 'N/A';
		const sign = value > 0 ? '+' : '';
		return `${sign}${Math.round(value)}%`;
	}

	function formatDayDelta(value: number | null): string {
		if (value === null) return 'N/A';
		const sign = value > 0 ? '+' : '';
		return `${sign}${Math.round(value)}d`;
	}

	function getMarketRead(
		priceDelta: number | null,
		inventoryDelta: number | null,
		domDelta: number | null
	): { label: string; detail: string; tone: 'default' | 'positive' | 'warning' } {
		if (inventoryDelta !== null && domDelta !== null) {
			if (inventoryDelta <= -8 && domDelta <= -4) {
				return {
					label: 'Tightening',
					detail: 'Less inventory and faster turnover than the start of the 12M window',
					tone: 'positive'
				};
			}
			if (inventoryDelta >= 8 && domDelta >= 4) {
				return {
					label: 'Softening',
					detail: 'More listings and slower absorption than the start of the 12M window',
					tone: 'warning'
				};
			}
		}

		if (priceDelta !== null && priceDelta >= 6) {
			return {
				label: 'Price-led',
				detail: 'Median sale price is still leading the market higher',
				tone: 'positive'
			};
		}

		return {
			label: 'Mixed',
			detail: 'Signals are balanced. Watch price and inventory together.',
			tone: 'default'
		};
	}

	function getSeries(chart: HoverChart): HousingMetric[] {
		return chart === 'price' ? priceData : inventoryData;
	}

	function updateHover(event: PointerEvent, chart: HoverChart) {
		const series = getSeries(chart);
		if (series.length === 0) return;
		const target = event.currentTarget as SVGSVGElement;
		const rect = target.getBoundingClientRect();
		const innerWidth = rect.width - CHART_LEFT - CHART_RIGHT;
		const relativeX = Math.max(0, Math.min(innerWidth, event.clientX - rect.left - CHART_LEFT));
		const ratio = innerWidth <= 0 ? 0 : relativeX / innerWidth;
		const index = Math.max(0, Math.min(series.length - 1, Math.round(ratio * (series.length - 1))));
		const pointX = CHART_LEFT + (innerWidth * index) / Math.max(series.length - 1, 1);
		hoverState = { chart, index, x: pointX };
	}

	function clearHover() {
		hoverState = null;
	}

	function drawSharedXAxis(
		g: Selection<SVGGElement, unknown, null, undefined>,
		x: ScaleLinear<number, number>,
		innerH: number,
		series: HousingMetric[]
	) {
		const labelIndices = [0, Math.floor(series.length / 2), series.length - 1];
		for (const idx of labelIndices) {
			g.append('text')
				.attr('x', x(idx))
				.attr('y', innerH + 14)
				.attr('text-anchor', 'middle')
				.attr('fill', '#666')
				.attr('font-size', '7px')
				.text(formatMonthLabel(series[idx].month));
		}
	}

	function drawPriceChart() {
		if (!priceSvg || priceData.length < 2) return;

		const svg = select(priceSvg);
		svg.selectAll('*').remove();

		const width = priceSvg.clientWidth;
		const height = 236;
		const margin = { top: 12, right: CHART_RIGHT, bottom: 24, left: CHART_LEFT };
		const innerW = width - margin.left - margin.right;
		const innerH = height - margin.top - margin.bottom;

		const prices = priceData.map((d) => d.medianPrice!);
		const yMin = Math.min(...prices) * 0.95;
		const yMax = Math.max(...prices) * 1.05;

		const x = scaleLinear()
			.domain([0, priceData.length - 1])
			.range([0, innerW]);
		const y = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

		const g = svg
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		const areaGen = area<HousingMetric>()
			.x((_d, i) => x(i))
			.y0(innerH)
			.y1((d) => y(d.medianPrice!))
			.curve(curveMonotoneX);

		g.append('path').datum(priceData).attr('d', areaGen).attr('fill', 'rgba(245, 158, 11, 0.1)');

		const lineGen = line<HousingMetric>()
			.x((_d, i) => x(i))
			.y((d) => y(d.medianPrice!))
			.curve(curveMonotoneX);

		g.append('path')
			.datum(priceData)
			.attr('d', lineGen)
			.attr('fill', 'none')
			.attr('stroke', '#f59e0b')
			.attr('stroke-width', 1.5);

		g.selectAll('.dot')
			.data(priceData)
			.enter()
			.append('circle')
			.attr('cx', (_d, i) => x(i))
			.attr('cy', (d) => y(d.medianPrice!))
			.attr('r', 2.2)
			.attr('fill', '#f59e0b');

		if (hoverState?.chart === 'price') {
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
				.attr('cy', y(priceData[hoverState.index].medianPrice!))
				.attr('r', 4)
				.attr('fill', '#f59e0b')
				.attr('stroke', '#111')
				.attr('stroke-width', 1);
		}

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

		drawSharedXAxis(g, x, innerH, priceData);
	}

	function drawInventoryChart() {
		if (!inventorySvg || inventoryData.length < 2) return;

		const svg = select(inventorySvg);
		svg.selectAll('*').remove();

		const width = inventorySvg.clientWidth;
		const height = 148;
		const margin = { top: 8, right: CHART_RIGHT, bottom: 22, left: CHART_LEFT };
		const innerW = width - margin.left - margin.right;
		const innerH = height - margin.top - margin.bottom;

		const inventories = inventoryData.map((d) => d.inventory!);
		const yMax = Math.max(...inventories) * 1.1;
		const barW = innerW / Math.max(inventoryData.length, 1);

		const x = scaleLinear()
			.domain([0, inventoryData.length - 1])
			.range([0, innerW]);
		const y = scaleLinear().domain([0, yMax]).range([innerH, 0]);

		const g = svg
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		g.selectAll('rect')
			.data(inventoryData)
			.enter()
			.append('rect')
			.attr('x', (_d, i) => x(i) - barW * 0.32)
			.attr('y', (d) => y(d.inventory!))
			.attr('width', Math.max(6, barW * 0.64))
			.attr('height', (d) => innerH - y(d.inventory!))
			.attr('rx', 2)
			.attr('fill', 'rgba(245, 158, 11, 0.45)');

		if (hoverState?.chart === 'inventory') {
			g.append('line')
				.attr('x1', x(hoverState.index))
				.attr('x2', x(hoverState.index))
				.attr('y1', 0)
				.attr('y2', innerH)
				.attr('stroke', 'rgba(255,255,255,0.35)')
				.attr('stroke-width', 1)
				.attr('stroke-dasharray', '3,3');
		}

		g.append('text')
			.attr('x', -4)
			.attr('y', y(yMax))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '7px')
			.text(`${Math.round(yMax)}`);

		g.append('text')
			.attr('x', -4)
			.attr('y', y(0))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '7px')
			.text('0');

		drawSharedXAxis(g, x, innerH, inventoryData);
	}

	onMount(() => {
		let resizeTimer: ReturnType<typeof setTimeout>;
		function handleResize() {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				if (priceData.length > 1 && priceSvg) drawPriceChart();
				if (inventoryData.length > 1 && inventorySvg) drawInventoryChart();
			}, 150);
		}

		window.addEventListener('resize', handleResize);

		void (async () => {
			dataLoading = true;
			try {
				housingData = await fetchHousingData();
			} finally {
				dataLoading = false;
			}
		})();

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	$effect(() => {
		if (priceData.length > 1 && priceSvg) drawPriceChart();
	});

	$effect(() => {
		if (inventoryData.length > 1 && inventorySvg) drawInventoryChart();
	});
</script>

<Panel id="housing" title="Housing" loading={$housingNews.loading} error={$housingNews.error}>
	{#if $townFilter}
		<div class="county-badge">County-wide data</div>
	{/if}
	{#if latestMetrics}
		<div class="market-snapshot">
			{#if latestMetrics.medianPrice !== null}
				<div class="metric">
					<span class="metric-value">{formatPrice(latestMetrics.medianPrice)}</span>
					<span class="metric-label">Median Price</span>
				</div>
			{/if}
			{#if latestMetrics.daysOnMarket !== null}
				<div class="metric">
					<span class="metric-value">{latestMetrics.daysOnMarket}</span>
					<span class="metric-label">Days on Market</span>
				</div>
			{/if}
			{#if latestMetrics.homesSold !== null}
				<div class="metric">
					<span class="metric-value">{latestMetrics.homesSold}</span>
					<span class="metric-label">Homes Sold</span>
				</div>
			{/if}
			{#if latestMetrics.inventory !== null}
				<div class="metric">
					<span class="metric-value">{latestMetrics.inventory.toLocaleString()}</span>
					<span class="metric-label">Inventory</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if priceData.length > 1}
		<div class="chart-section">
			<div class="section-label">Median Sale Price (12 mo)</div>
			<div class="chart-wrap">
				<svg
					class="chart-svg price-chart-svg"
					bind:this={priceSvg}
					onpointermove={(event) => updateHover(event, 'price')}
					onpointerleave={clearHover}
				></svg>
				{#if hoverState?.chart === 'price'}
					<div class="chart-tooltip" style={`left:${Math.max(20, hoverState.x - 64)}px`}>
						<div class="tooltip-time">{formatMonthLabel(priceData[hoverState.index].month)}</div>
						<div class="tooltip-line">
							Median {formatPrice(priceData[hoverState.index].medianPrice!)}
						</div>
						{#if priceData[hoverState.index].daysOnMarket !== null}
							<div class="tooltip-line">Days {priceData[hoverState.index].daysOnMarket}</div>
						{/if}
						{#if priceData[hoverState.index].homesSold !== null}
							<div class="tooltip-line">Sold {priceData[hoverState.index].homesSold}</div>
						{/if}
						{#if priceData[hoverState.index].inventory !== null}
							<div class="tooltip-line">Inventory {priceData[hoverState.index].inventory}</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{:else if dataLoading}
		<div class="chart-loading">Loading market data...</div>
	{:else if housingData.length === 0}
		<div class="empty-state">No housing data available</div>
	{/if}

	{#if inventoryData.length > 1}
		<div class="chart-section compact">
			<div class="section-label">Inventory Trend (12 mo)</div>
			<div class="chart-wrap">
				<svg
					class="chart-svg inventory-chart-svg"
					bind:this={inventorySvg}
					onpointermove={(event) => updateHover(event, 'inventory')}
					onpointerleave={clearHover}
				></svg>
				{#if hoverState?.chart === 'inventory'}
					<div class="chart-tooltip" style={`left:${Math.max(20, hoverState.x - 64)}px`}>
						<div class="tooltip-time">
							{formatMonthLabel(inventoryData[hoverState.index].month)}
						</div>
						<div class="tooltip-line">Inventory {inventoryData[hoverState.index].inventory}</div>
						{#if inventoryData[hoverState.index].homesSold !== null}
							<div class="tooltip-line">Sold {inventoryData[hoverState.index].homesSold}</div>
						{/if}
						{#if inventoryData[hoverState.index].daysOnMarket !== null}
							<div class="tooltip-line">Days {inventoryData[hoverState.index].daysOnMarket}</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
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
</Panel>

<style>
	.county-badge {
		font-size: 0.5rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.2rem 0.4rem;
		margin-bottom: 0.4rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border);
		border-radius: 3px;
		text-align: center;
	}

	.market-snapshot {
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
		color: #f59e0b;
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

	.chart-section.compact {
		padding-bottom: 0.75rem;
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
		display: block;
	}

	.price-chart-svg {
		height: 236px;
	}

	.inventory-chart-svg {
		height: 148px;
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
	}

	.summary-card {
		padding: 0.55rem 0.6rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.summary-card.positive {
		background: rgba(34, 197, 94, 0.08);
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
