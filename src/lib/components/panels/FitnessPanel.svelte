<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchFitnessData } from '$lib/api/marin/fitness';
	import { fitnessStore } from '$lib/stores/fitness';
	import { townFilter } from '$lib/stores/town-filter';
	import { findNearestTown } from '$lib/geo';
	import { select } from 'd3-selection';
	import { scaleLinear } from 'd3-scale';
	import { area, line, curveMonotoneX } from 'd3-shape';
	import {
		FITNESS_ACCENT,
		FITNESS_ACCENT_FILL,
		TYPE_ORDER,
		TYPE_LABELS,
		TYPE_COLORS,
		computeMedian
	} from '$lib/config/fitness';
	import type { FitnessData, FitnessStudio, FitnessType } from '$lib/types/fitness';

	type HoverState = { index: number; x: number } | null;

	const CHART_LEFT = 44;
	const CHART_RIGHT = 10;

	let data = $state<FitnessData>({ current: null, history: [] });
	let chartSvg = $state<SVGSVGElement>(undefined!);
	let dataLoading = $state(false);
	let hoverState = $state<HoverState>(null);

	const current = $derived(data.current);
	const history = $derived(
		data.history
			.filter((h) => h.medianPrice !== null)
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
	);

	// Filter studios by selected town (proximity match)
	const filteredStudios = $derived.by<FitnessStudio[]>(() => {
		if (!current?.studios) return [];
		if (!$townFilter) return current.studios;
		return current.studios.filter(
			(s) => findNearestTown(s.lat, s.lon) === $townFilter
		);
	});

	// Sort by price ascending
	const sortedStudios = $derived(
		[...filteredStudios].sort((a, b) => a.dropInPrice - b.dropInPrice)
	);

	// Group by type
	const studiosByType = $derived.by<Map<FitnessType, FitnessStudio[]>>(() => {
		const map = new Map<FitnessType, FitnessStudio[]>();
		for (const studio of sortedStudios) {
			const list = map.get(studio.type) ?? [];
			list.push(studio);
			map.set(studio.type, list);
		}
		return map;
	});

	// Median by type from filtered studios
	const filteredMedianByType = $derived.by<Partial<Record<FitnessType, number>>>(() => {
		const result: Partial<Record<FitnessType, number>> = {};
		for (const type of TYPE_ORDER) {
			const prices = filteredStudios
				.filter((s) => s.type === type)
				.map((s) => s.dropInPrice);
			const median = computeMedian(prices);
			if (median !== null) {
				result[type] = median;
			}
		}
		return result;
	});

	// Overall filtered median
	const filteredMedian = $derived(
		computeMedian(filteredStudios.map((s) => s.dropInPrice))
	);

	function formatPrice(price: number): string {
		return `$${price.toFixed(0)}`;
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
		const yMin = Math.min(...prices) * 0.95;
		const yMax = Math.max(...prices) * 1.05;

		const x = scaleLinear()
			.domain([0, history.length - 1])
			.range([0, innerW]);
		const y = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

		const g = svg
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		type HistoryEntry = (typeof history)[number];

		const areaGen = area<HistoryEntry>()
			.x((_d, i) => x(i))
			.y0(innerH)
			.y1((d) => y(d.medianPrice!))
			.curve(curveMonotoneX);

		g.append('path')
			.datum(history)
			.attr('d', areaGen)
			.attr('fill', FITNESS_ACCENT_FILL);

		const lineGen = line<HistoryEntry>()
			.x((_d, i) => x(i))
			.y((d) => y(d.medianPrice!))
			.curve(curveMonotoneX);

		g.append('path')
			.datum(history)
			.attr('d', lineGen)
			.attr('fill', 'none')
			.attr('stroke', FITNESS_ACCENT)
			.attr('stroke-width', 1.5);

		g.selectAll('.dot')
			.data(history)
			.enter()
			.append('circle')
			.attr('cx', (_d, i) => x(i))
			.attr('cy', (d) => y(d.medianPrice!))
			.attr('r', 2.2)
			.attr('fill', FITNESS_ACCENT);

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
				.attr('fill', FITNESS_ACCENT)
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
				data = await fetchFitnessData();
				fitnessStore.set(data);
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

<Panel id="fitness" title="Fitness Drop-in Index" loading={dataLoading}>
	{#if current}
		<!-- Overall snapshot bar -->
		<div class="snapshot-bar">
			<div class="metric">
				<span class="metric-value">${filteredMedian !== null ? filteredMedian.toFixed(0) : 'N/A'}</span>
				<span class="metric-label">Median Drop-in</span>
			</div>
			{#if current.minPrice !== null}
				<div class="metric">
					<span class="metric-value">${current.minPrice.toFixed(0)}</span>
					<span class="metric-label">Cheapest</span>
				</div>
			{/if}
			{#if current.maxPrice !== null}
				<div class="metric">
					<span class="metric-value">${current.maxPrice.toFixed(0)}</span>
					<span class="metric-label">Priciest</span>
				</div>
			{/if}
		</div>

		<!-- Median by type -->
		<div class="type-grid">
			{#each TYPE_ORDER as type}
				{@const median = filteredMedianByType[type]}
				{#if median !== undefined}
					<div class="type-card">
						<span class="type-dot" style:background={TYPE_COLORS[type]}></span>
						<div class="type-info">
							<span class="type-label">{TYPE_LABELS[type]}</span>
							<span class="type-price">${median}</span>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	{#if history.length > 1}
		<div class="chart-section">
			<div class="section-label">Median Drop-in Price Trend</div>
			<div class="chart-wrap">
				<svg
					class="chart-svg"
					bind:this={chartSvg}
					role="img"
					aria-label="Median fitness drop-in price trend"
					onpointermove={updateHover}
					onpointerleave={clearHover}
				></svg>
				{#if hoverState}
					<div class="chart-tooltip" style={`left:${Math.max(20, hoverState.x - 80)}px`}>
						<div class="tooltip-time">{formatDate(history[hoverState.index].timestamp)}</div>
						{#if history[hoverState.index].medianPrice !== null}
							<div class="tooltip-line">
								Median ${history[hoverState.index].medianPrice!.toFixed(0)}
							</div>
						{/if}
						{#if history[hoverState.index].avgPrice !== null}
							<div class="tooltip-line">
								Average ${history[hoverState.index].avgPrice!.toFixed(0)}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{:else if dataLoading}
		<div class="chart-loading">Loading fitness data...</div>
	{:else if !current}
		<div class="empty-state">Fitness drop-in data will appear after the first sync cycle.</div>
	{/if}

	{#if sortedStudios.length > 0}
		{#each TYPE_ORDER as type}
			{@const studios = studiosByType.get(type)}
			{#if studios && studios.length > 0}
				<div class="studio-section">
					<div class="section-label">
						<span class="type-dot-sm" style:background={TYPE_COLORS[type]}></span>
						{TYPE_LABELS[type]}
					</div>
					{#each studios as studio}
						<div class="studio-row">
							<div class="studio-info">
								<span class="studio-name">{studio.name}</span>
								<span class="studio-town">{studio.town}</span>
							</div>
							<span class={`studio-price ${studio.dropInPrice === current?.minPrice ? 'positive' : studio.dropInPrice === current?.maxPrice ? 'warning' : ''}`}>
								${studio.dropInPrice}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		{/each}
	{/if}
</Panel>

<style>
	.snapshot-bar {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
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
		color: #ec4899;
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

	.type-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: 0.45rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.type-card {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.type-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.type-dot-sm {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		margin-right: 0.2rem;
		vertical-align: middle;
	}

	.type-info {
		display: flex;
		flex-direction: column;
	}

	.type-label {
		font-size: 0.48rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.type-price {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text);
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

	.studio-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.studio-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.3rem 0;
	}

	.studio-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.studio-name {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.studio-town {
		font-size: 0.48rem;
		color: var(--text-dim);
	}

	.studio-price {
		font-size: 0.72rem;
		font-weight: 700;
		margin-left: 0.5rem;
		white-space: nowrap;
	}

	.studio-price.positive {
		color: #10b981;
	}

	.studio-price.warning {
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
		.type-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
