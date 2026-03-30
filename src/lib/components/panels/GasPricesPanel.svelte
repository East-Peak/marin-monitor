<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchGasPriceData } from '$lib/api/marin/gas-prices';
	import { gasPriceStore } from '$lib/stores/gas-prices';
	import { townFilter, selectedTownObj } from '$lib/stores/town-filter';
	import { findNearestTown } from '$lib/geo';
	import { select } from 'd3-selection';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';
	import type { GasPriceData, GasPriceSnapshot, GasStation } from '$lib/types/gas';

	type HoverState = { index: number; x: number } | null;
	type SummaryCard = {
		label: string;
		value: string;
		detail: string;
		tone?: 'default' | 'positive' | 'warning';
	};

	const CHART_LEFT = 44;
	const CHART_RIGHT = 10;
	const ACCENT = '#10b981';

	let data = $state<GasPriceData>({ current: null, history: [] });
	let chartSvg = $state<SVGSVGElement>(undefined!);
	let dataLoading = $state(false);
	let hoverState = $state<HoverState>(null);

	const current = $derived(data.current);
	const history = $derived(
		data.history
			.filter((h) => h.avgRegular !== null)
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
	);

	// Filter stations by selected town (proximity match)
	const filteredStations = $derived.by<GasStation[]>(() => {
		if (!current?.stations) return [];
		if (!$townFilter) return current.stations;
		return current.stations.filter(
			(s) => findNearestTown(s.lat, s.lon) === $townFilter
		);
	});

	const cheapestStations = $derived.by<GasStation[]>(() => {
		return [...filteredStations]
			.filter((s) => s.fuelPrices.some((fp) => fp.type === 'REGULAR_UNLEADED'))
			.sort((a, b) => {
				const pa = a.fuelPrices.find((fp) => fp.type === 'REGULAR_UNLEADED')?.price ?? Infinity;
				const pb = b.fuelPrices.find((fp) => fp.type === 'REGULAR_UNLEADED')?.price ?? Infinity;
				return pa - pb;
			});
	});
	const priciestStations = $derived(cheapestStations.slice().reverse());

	const summaryCards = $derived.by<SummaryCard[]>(() => {
		if (!current) return [];

		const townName = $selectedTownObj?.name;

		// Compute avg from filtered stations
		const regularPrices = cheapestStations
			.map((s) => s.fuelPrices.find((fp) => fp.type === 'REGULAR_UNLEADED')?.price)
			.filter((p): p is number => p !== undefined);
		const filteredAvg =
			regularPrices.length > 0
				? regularPrices.reduce((a, b) => a + b, 0) / regularPrices.length
				: null;

		const displayAvg = $townFilter ? filteredAvg : current.avgRegular;

		const sevenDaysAgo = history.length >= 42 ? history[41] : history[history.length - 1];
		const priceDelta =
			current.avgRegular !== null && sevenDaysAgo?.avgRegular !== null
				? current.avgRegular - sevenDaysAgo.avgRegular
				: null;

		const cheapest = cheapestStations[0];
		const cheapestPrice = cheapest?.fuelPrices.find(
			(fp) => fp.type === 'REGULAR_UNLEADED'
		)?.price;

		return [
			{
				label: 'Avg Regular',
				value: displayAvg !== null ? `$${displayAvg.toFixed(3)}` : 'N/A',
				detail: townName ? `In ${townName}` : 'County-wide average',
				tone: 'default' as const
			},
			{
				label: '7-Day Change',
				value:
					priceDelta !== null
						? `${priceDelta >= 0 ? '+' : ''}${priceDelta.toFixed(3)}`
						: 'N/A',
				detail:
					priceDelta !== null
						? priceDelta <= 0
							? 'Prices trending down'
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
				value: cheapestPrice !== undefined ? `$${cheapestPrice.toFixed(3)}` : 'N/A',
				detail: cheapest?.name ?? (townName ? `No stations in ${townName}` : 'No data'),
				tone: 'positive' as const
			},
			{
				label: 'Stations',
				value: String(filteredStations.length),
				detail: townName ? `In ${townName}` : 'Reporting prices',
				tone: 'default' as const
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

		const prices = history.map((h) => h.avgRegular!);
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

		const areaGen = area<GasPriceSnapshot>()
			.x((_d, i) => x(i))
			.y0(innerH)
			.y1((d) => y(d.avgRegular!))
			.curve(curveMonotoneX);

		g.append('path')
			.datum(history)
			.attr('d', areaGen)
			.attr('fill', 'rgba(16, 185, 129, 0.1)');

		const lineGen = line<GasPriceSnapshot>()
			.x((_d, i) => x(i))
			.y((d) => y(d.avgRegular!))
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
			.attr('cy', (d) => y(d.avgRegular!))
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
				.attr('cy', y(history[hoverState.index].avgRegular!))
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

	function stationRegularPrice(station: GasStation): string {
		const price = station.fuelPrices.find((fp) => fp.type === 'REGULAR_UNLEADED')?.price;
		return price !== undefined ? `$${price.toFixed(3)}` : 'N/A';
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
				data = await fetchGasPriceData();
				gasPriceStore.set(data);
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

<Panel id="gas-prices" title="Gas Prices" loading={dataLoading}>
	{#if current}
		<div class="snapshot-bar">
			{#if current.avgRegular !== null}
				<div class="metric">
					<span class="metric-value">${current.avgRegular.toFixed(3)}</span>
					<span class="metric-label">Regular</span>
				</div>
			{/if}
			{#if current.avgPremium !== null}
				<div class="metric">
					<span class="metric-value">${current.avgPremium.toFixed(3)}</span>
					<span class="metric-label">Premium</span>
				</div>
			{/if}
			{#if current.avgDiesel !== null}
				<div class="metric">
					<span class="metric-value">${current.avgDiesel.toFixed(3)}</span>
					<span class="metric-label">Diesel</span>
				</div>
			{/if}
		</div>
	{/if}

	{#if history.length > 1}
		<div class="chart-section">
			<div class="section-label">Avg Regular Price Trend</div>
			<div class="chart-wrap">
				<svg
					class="chart-svg"
					bind:this={chartSvg}
					role="img"
					aria-label="Average regular gas price trend"
					onpointermove={updateHover}
					onpointerleave={clearHover}
				></svg>
				{#if hoverState}
					<div class="chart-tooltip" style={`left:${Math.max(20, hoverState.x - 80)}px`}>
						<div class="tooltip-time">{formatDate(history[hoverState.index].timestamp)}</div>
						{#if history[hoverState.index].avgRegular !== null}
							<div class="tooltip-line">
								Regular ${history[hoverState.index].avgRegular!.toFixed(3)}
							</div>
						{/if}
						{#if history[hoverState.index].avgPremium !== null}
							<div class="tooltip-line">
								Premium ${history[hoverState.index].avgPremium!.toFixed(3)}
							</div>
						{/if}
						{#if history[hoverState.index].avgDiesel !== null}
							<div class="tooltip-line">
								Diesel ${history[hoverState.index].avgDiesel!.toFixed(3)}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{:else if dataLoading}
		<div class="chart-loading">Loading gas price data...</div>
	{:else if !current}
		<div class="empty-state">Gas price data will appear after the first sync cycle.</div>
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

	{#if cheapestStations.length > 0}
		<div class="station-list-section">
			<div class="section-label">Cheapest Regular</div>
			{#each cheapestStations.slice(0, 3) as station}
				<div class="station-row">
					<div class="station-info">
						<span class="station-name">{station.name}</span>
						<span class="station-address">{station.address}</span>
					</div>
					<span class="station-price positive">{stationRegularPrice(station)}</span>
				</div>
			{/each}
		</div>

		<div class="station-list-section">
			<div class="section-label">Most Expensive Regular</div>
			{#each priciestStations.slice(0, 3) as station}
				<div class="station-row">
					<div class="station-info">
						<span class="station-name">{station.name}</span>
						<span class="station-address">{station.address}</span>
					</div>
					<span class="station-price warning">{stationRegularPrice(station)}</span>
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
		color: #10b981;
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

	.station-list-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.station-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0;
	}

	.station-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.station-name {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.station-address {
		font-size: 0.52rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.station-price {
		font-size: 0.72rem;
		font-weight: 700;
		margin-left: 0.5rem;
		white-space: nowrap;
	}

	.station-price.positive {
		color: #10b981;
	}

	.station-price.warning {
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

	@media (max-width: 1100px) {
		.market-summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
