<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchCompositeData } from '$lib/api/marin/composite';
	import { compositeStore } from '$lib/stores/composite';
	import { buildChart, type ChartPaths } from '$lib/utils/chart';
	import type { CompositeData } from '$lib/types/composite';

	const ACCENT = '#dc2626';
	const CHART_HEIGHT = 140;
	const CHART_MARGINS = { top: 12, right: 10, bottom: 24, left: 44 };

	let data = $state<CompositeData>({ current: null, history: [] });
	let chartContainer = $state<HTMLDivElement>(undefined!);
	let chartWidth = $state(0);
	let dataLoading = $state(false);
	let breakdownExpanded = $state(true);

	type HoverState = { index: number; x: number } | null;
	let hoverState = $state<HoverState>(null);

	const current = $derived(data.current);
	const history = $derived(
		data.history
			.filter((h) => h.compositeScore > 0)
			.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
	);

	const marinNumber = $derived(current?.marinNumber ?? null);
	const tiers = $derived(current?.tiers ?? []);

	// Delta from previous snapshot
	const scoreDelta = $derived.by(() => {
		if (!current || history.length < 2) return null;
		const prev = history[history.length - 2];
		return Math.round((current.compositeScore - prev.compositeScore) * 10) / 10;
	});

	const marinNumberDelta = $derived.by(() => {
		if (!marinNumber || history.length < 2) return null;
		const prev = history[history.length - 2];
		return marinNumber.total - prev.marinNumber.total;
	});

	// Build chart geometry reactively via shared utility
	const chartPaths = $derived.by<ChartPaths | null>(() => {
		if (chartWidth === 0 || history.length < 2) return null;
		return buildChart({
			width: chartWidth,
			height: CHART_HEIGHT,
			margins: CHART_MARGINS,
			accentColor: ACCENT,
			data: history.map((h) => ({
				value: h.compositeScore,
				label: formatDate(h.timestamp)
			}))
		});
	});

	function formatMoney(n: number): string {
		return '$' + n.toLocaleString('en-US');
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	function tierColor(category: string): string {
		switch (category) {
			case 'daily-life': return '#f59e0b';
			case 'lifestyle': return '#8b5cf6';
			case 'housing': return '#3b82f6';
			case 'structural': return '#6b7280';
			default: return '#888';
		}
	}

	function updateHover(event: PointerEvent) {
		if (!chartPaths) return;
		const target = event.currentTarget as SVGSVGElement;
		const rect = target.getBoundingClientRect();
		const innerWidth = rect.width - CHART_MARGINS.left - CHART_MARGINS.right;
		const relativeX = Math.max(0, Math.min(innerWidth, event.clientX - rect.left - CHART_MARGINS.left));
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
				data = await fetchCompositeData();
				compositeStore.set(data);
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
		if (history.length > 1) measureWidth();
	});
</script>

<Panel id="composite" title="Cost of Being Marin" loading={dataLoading}>
	{#if current}
		<!-- Composite Score Hero -->
		<div class="composite-hero">
			<div class="score-display">
				<span class="score-value">{current.compositeScore.toFixed(1)}</span>
				{#if scoreDelta !== null}
					<span class="score-delta" class:up={scoreDelta > 0} class:down={scoreDelta < 0}>
						{scoreDelta > 0 ? '+' : ''}{scoreDelta.toFixed(1)}
					</span>
				{/if}
			</div>
			<div class="score-label">Composite Index (base 100)</div>
		</div>

		<!-- Tier Bars -->
		<div class="tiers-section">
			<div class="section-label">Tier Breakdown</div>
			{#each tiers as tier}
				<div class="tier-row">
					<div class="tier-header">
						<span class="tier-name" style="color: {tierColor(tier.category)}">{tier.label}</span>
						<span class="tier-weight">{Math.round(tier.weight * 100)}%</span>
					</div>
					<div class="tier-bar-track">
						<div
							class="tier-bar-fill"
							style="width: {Math.min(tier.score, 150)}%; background: {tierColor(tier.category)}"
						></div>
						<span class="tier-score">{tier.score.toFixed(1)}</span>
					</div>
					<div class="tier-monthly">{formatMoney(tier.monthlyTotal)}/mo</div>
				</div>
			{/each}
		</div>

		<!-- Sparkline -->
		{#if history.length > 1}
			<div class="chart-section">
				<div class="section-label">Composite Trend</div>
				<div class="chart-wrap" bind:this={chartContainer}>
					{#if chartPaths}
						<svg
							class="chart-svg"
							width={chartWidth}
							height={CHART_HEIGHT}
							role="img"
							aria-label="Composite trend chart"
							onpointermove={updateHover}
							onpointerleave={clearHover}
						>
							<g transform={`translate(${CHART_MARGINS.left},${CHART_MARGINS.top})`}>
								<!-- Baseline reference line at 100 -->
								{#if chartPaths.yMin <= 100 && chartPaths.yMax >= 100}
									<line
										x1="0"
										x2={chartWidth - CHART_MARGINS.left - CHART_MARGINS.right}
										y1={chartPaths.yScale(100)}
										y2={chartPaths.yScale(100)}
										stroke="rgba(255,255,255,0.1)"
										stroke-width="1"
										stroke-dasharray="4,4"
									/>
									<text x={chartWidth - CHART_MARGINS.left - CHART_MARGINS.right + 4} y={chartPaths.yScale(100)} dominant-baseline="middle" fill="#555" font-size="6px">100</text>
								{/if}
								<!-- Filled area -->
								<path d={chartPaths.areaPath} fill="rgba(220, 38, 38, 0.08)" />
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
								<text x="-4" y={chartPaths.yScale(chartPaths.yMax)} text-anchor="end" dominant-baseline="middle" fill="#888" font-size="7px">{chartPaths.yMax.toFixed(1)}</text>
								<text x="-4" y={chartPaths.yScale(chartPaths.yMin)} text-anchor="end" dominant-baseline="middle" fill="#888" font-size="7px">{chartPaths.yMin.toFixed(1)}</text>
								<!-- X axis labels -->
								{#each chartPaths.axisLabels.x as lbl}
									<text x={lbl.x} y={CHART_HEIGHT - CHART_MARGINS.top - CHART_MARGINS.bottom + 14} text-anchor="middle" fill="#666" font-size="7px">{lbl.label}</text>
								{/each}
							</g>
						</svg>
					{/if}
					{#if hoverState}
						<div class="chart-tooltip" style={`left:${Math.max(20, hoverState.x - 80)}px`}>
							<div class="tooltip-time">{formatDate(history[hoverState.index].timestamp)}</div>
							<div class="tooltip-line">
								Score: {history[hoverState.index].compositeScore.toFixed(1)}
							</div>
							<div class="tooltip-line">
								Marin #: {formatMoney(history[hoverState.index].marinNumber.total)}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- The Marin Number -->
		{#if marinNumber}
			<div class="marin-number-section">
				<div class="marin-number-hero">
					<div class="marin-number-label">The Marin Number</div>
					<div class="marin-number-value">{formatMoney(marinNumber.total)}<span class="marin-number-per">/mo</span></div>
					<div class="marin-number-annual">{formatMoney(marinNumber.annualized)}/yr</div>
					{#if marinNumberDelta !== null && marinNumberDelta !== 0}
						<div class="marin-number-delta" class:up={marinNumberDelta > 0} class:down={marinNumberDelta < 0}>
							{marinNumberDelta > 0 ? '+' : ''}{formatMoney(Math.abs(marinNumberDelta))} from last week
						</div>
					{/if}
					<div class="marin-number-tagline">This does not include your Rivian payment.</div>
				</div>

				<!-- Expandable Breakdown -->
				<button class="breakdown-toggle" onclick={() => breakdownExpanded = !breakdownExpanded}>
					<span>{breakdownExpanded ? 'Hide' : 'Show'} breakdown</span>
					<span class="toggle-chevron">{breakdownExpanded ? '\u25B4' : '\u25BE'}</span>
				</button>

				{#if breakdownExpanded}
					<div class="breakdown-list">
						{#each marinNumber.items as item}
							<div class="breakdown-row">
								<div class="breakdown-info">
									<span class="breakdown-label">{item.label}</span>
									{#if item.source === 'live'}
										<span class="breakdown-badge live">live</span>
									{/if}
								</div>
								<span class="breakdown-amount">{formatMoney(item.monthly)}</span>
							</div>
						{/each}
						<div class="breakdown-total">
							<span>Total</span>
							<span>{formatMoney(marinNumber.total)}/mo</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{:else if dataLoading}
		<div class="empty-state">Loading composite data...</div>
	{:else}
		<div class="empty-state">Composite data will appear after the first sync cycle.</div>
	{/if}
</Panel>

<style>
	.composite-hero {
		text-align: center;
		padding: 0.75rem 0;
		margin-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.score-display {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.4rem;
	}

	.score-value {
		font-size: 2rem;
		font-weight: 800;
		color: #dc2626;
		letter-spacing: -0.02em;
	}

	.score-delta {
		font-size: 0.75rem;
		font-weight: 600;
	}

	.score-delta.up {
		color: #ef4444;
	}

	.score-delta.down {
		color: #10b981;
	}

	.score-label {
		font-size: 0.55rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.2rem;
	}

	/* Tier bars */
	.tiers-section {
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.section-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.4rem;
	}

	.tier-row {
		margin-bottom: 0.45rem;
	}

	.tier-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.15rem;
	}

	.tier-name {
		font-size: 0.6rem;
		font-weight: 600;
	}

	.tier-weight {
		font-size: 0.5rem;
		color: var(--text-dim);
	}

	.tier-bar-track {
		position: relative;
		height: 14px;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 2px;
		overflow: visible;
	}

	.tier-bar-fill {
		height: 100%;
		border-radius: 2px;
		opacity: 0.7;
		transition: width 0.5s ease;
		max-width: 100%;
	}

	.tier-score {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 0.52rem;
		font-weight: 700;
		color: var(--text);
	}

	.tier-monthly {
		font-size: 0.48rem;
		color: var(--text-dim);
		text-align: right;
		margin-top: 0.08rem;
	}

	/* Chart */
	.chart-section {
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.chart-svg {
		width: 100%;
		height: 140px;
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

	/* The Marin Number */
	.marin-number-section {
		border-top: 2px solid #dc2626;
		padding-top: 0.75rem;
	}

	.marin-number-hero {
		text-align: center;
		margin-bottom: 0.5rem;
	}

	.marin-number-label {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #dc2626;
		margin-bottom: 0.25rem;
	}

	.marin-number-value {
		font-size: 2.2rem;
		font-weight: 900;
		color: var(--text);
		letter-spacing: -0.02em;
		line-height: 1;
	}

	.marin-number-per {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text-dim);
	}

	.marin-number-annual {
		font-size: 0.7rem;
		color: var(--text-muted);
		margin-top: 0.15rem;
	}

	.marin-number-delta {
		font-size: 0.55rem;
		font-weight: 600;
		margin-top: 0.2rem;
	}

	.marin-number-delta.up {
		color: #ef4444;
	}

	.marin-number-delta.down {
		color: #10b981;
	}

	.marin-number-tagline {
		font-size: 0.5rem;
		color: var(--text-dim);
		font-style: italic;
		margin-top: 0.35rem;
	}

	/* Breakdown toggle */
	.breakdown-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		width: 100%;
		padding: 0.35rem 0;
		border: none;
		background: none;
		cursor: pointer;
		color: var(--text-dim);
		font-size: 0.52rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		transition: color 0.2s;
	}

	.breakdown-toggle:hover {
		color: var(--text-secondary);
	}

	.toggle-chevron {
		font-size: 0.45rem;
	}

	/* Breakdown list */
	.breakdown-list {
		margin-top: 0.25rem;
	}

	.breakdown-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.25rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}

	.breakdown-info {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		flex: 1;
	}

	.breakdown-label {
		font-size: 0.55rem;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.breakdown-badge {
		font-size: 0.4rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.08rem 0.25rem;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.breakdown-badge.live {
		background: rgba(16, 185, 129, 0.15);
		color: #10b981;
	}

	.breakdown-amount {
		font-size: 0.6rem;
		font-weight: 700;
		color: var(--text);
		margin-left: 0.5rem;
		white-space: nowrap;
	}

	.breakdown-total {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.4rem 0 0.2rem;
		border-top: 1px solid rgba(220, 38, 38, 0.3);
		margin-top: 0.15rem;
		font-size: 0.65rem;
		font-weight: 800;
		color: #dc2626;
	}

	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.7rem;
		padding: 1rem;
	}
</style>
