<!-- The Cost section's CPI tile as a readable chart (COSTX1): BLS food at home, SF area. -->
<script lang="ts">
	import { axisTicks, type SubIndexTile } from '$lib/dashboard/cost';
	import { inflationStops, isolated, type InflationChart } from '$lib/grocery/inflation-chart';
	import { buildChart } from '$lib/utils/chart';
	import CardSource from './CardSource.svelte';
	import ChartReadout from './ChartReadout.svelte';

	let { tile, chart, now }: { tile: SubIndexTile; chart: InflationChart; now: number } = $props();

	/** Drawn at its rendered width, so the axis text is 12 CSS px at any tile width (Codex). */
	let measured = $state(0);
	const MARGINS = { top: 18, right: 8, bottom: 20, left: 34 };
	const BOX = $derived({
		width: measured > 0 ? Math.round(measured) : 640,
		height: 168,
		margins: MARGINS
	});
	const innerW = $derived(BOX.width - MARGINS.left - MARGINS.right);
	const innerH = $derived(BOX.height - MARGINS.top - MARGINS.bottom);

	const domain = $derived<[number, number]>([chart.points[0].at, chart.points.at(-1)!.at]);
	// A missing month is NaN to the drawing: the line breaks there and is never bridged.
	const geo = $derived(
		buildChart({
			...BOX,
			accentColor: tile.color,
			xDomain: domain,
			data: chart.points.map((p) => ({ x: p.at, value: p.value ?? Number.NaN }))
		})
	);
	const dots = $derived(geo ? isolated(chart.points) : []);
	const stops = $derived(
		geo ? inflationStops(chart.points, (v) => (BOX.margins.top + geo.yScale(v)) / BOX.height) : []
	);
	const ticks = $derived.by(() => {
		if (!geo) return [];
		const idx = axisTicks(chart.points.length);
		return idx.map((i, k) => ({
			i,
			x: geo.xScale(chart.points[i].at),
			label: chart.points[i].label,
			anchor: k === 0 ? 'start' : k === idx.length - 1 ? 'end' : 'middle'
		}));
	});
	/** Each gap's marker and its label, kept inside the plot. */
	const gaps = $derived(
		geo
			? chart.gaps.map((g) => {
					const x = geo.xScale(g.at);
					return {
						...g,
						x,
						anchor: x < innerW * 0.25 ? 'start' : x > innerW * 0.75 ? 'end' : 'middle'
					};
				})
			: []
	);
</script>

<div class="ix" data-tile={tile.id} style="--c:{tile.color}">
	<span class="t" data-text-role="label">{tile.title}</span>
	<div class="lead">
		<span class="v num" data-headline data-colour-exception="series" data-text-role="value"
			>{chart.headline.text}</span
		>
		<span class="span" data-headline-span data-text-role="label">{chart.headline.span}</span>
		{#if chart.month}
			<span class="mom" data-month-change
				><span class="num" data-text-role="label">{chart.month.text}</span><span
					class="mom-k"
					data-text-role="meta">{chart.month.label}</span
				></span
			>
		{/if}
	</div>
	{#if chart.newestNote}
		<p class="note" data-newest-note data-text-role="meta">{chart.newestNote}</p>
	{/if}
	{#if geo}
		<div class="plot" bind:clientWidth={measured}>
			<ChartReadout
				label="{tile.title}, the index by month"
				{stops}
				plot={{
					domain,
					left: BOX.margins.left,
					right: BOX.width - BOX.margins.right,
					width: BOX.width
				}}
				color={tile.color}
			>
				<svg
					class="chart"
					data-inflation-chart
					data-text-role="meta"
					viewBox="0 0 {BOX.width} {BOX.height}"
					aria-hidden="true"
				>
					<g transform="translate({BOX.margins.left},{BOX.margins.top})">
						<path d={geo.areaPath} fill={tile.color} fill-opacity="0.14" />
						<path
							d={geo.linePath}
							data-inflation-line
							fill="none"
							stroke={tile.color}
							stroke-width="2"
						/>
						{#each dots as d (d.period)}
							<circle cx={geo.xScale(d.at)} cy={geo.yScale(d.value!)} r="2.5" fill={tile.color} />
						{/each}
						{#each gaps as g (g.period)}
							<line class="gap" x1={g.x} x2={g.x} y1="0" y2={innerH} />
							<text class="gap-label" data-gap={g.period} x={g.x} y="-6" text-anchor={g.anchor}
								>{g.label} not published</text
							>
						{/each}
						<text x="-6" y={geo.yScale(geo.yMax) + 10} text-anchor="end"
							>{Math.round(geo.yMax)}</text
						>
						<text x="-6" y={geo.yScale(geo.yMin)} text-anchor="end">{Math.round(geo.yMin)}</text>
						<!-- The scale's unit: an index, never dollars (RAIN1). -->
						<text x="4" y={geo.yScale(geo.yMax) + 10}>index</text>
						{#each ticks as t (t.i)}
							<text x={t.x} y={innerH + 16} text-anchor={t.anchor}>{t.label}</text>
						{/each}
					</g>
				</svg>
			</ChartReadout>
		</div>
	{/if}
	<CardSource
		lines={[{ measured: tile.measured, untimed: tile.untimed, muted: tile.muted }]}
		{now}
	/>
	{#if tile.refLine}
		<p class="foot" data-tile-reference data-text-role="meta">{tile.refLine}</p>
	{/if}
</div>

<style>
	/* The sub-index tile (CostCharacter's .ix), two columns wide for a chart that can be read. */
	.ix {
		position: relative;
		grid-column: span 2;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		padding: 10px 12px;
		overflow: hidden;
		border: 1px solid var(--border-light);
		border-radius: 8px;
	}
	.ix::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--c);
	}
	.t {
		color: var(--text-secondary);
		font-weight: 500;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.lead {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 10px;
	}
	.v {
		color: var(--c);
	}
	.span {
		color: var(--text-secondary);
	}
	/* The month-over-month change: a secondary fact, set apart by a rule, never the headline. */
	.mom {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		margin-left: auto;
		padding-left: 10px;
		border-left: 1px solid var(--border-light);
		color: var(--text-primary);
	}
	.mom-k {
		color: var(--text-muted);
	}
	.note {
		margin: 0;
		color: var(--text-muted);
		max-width: 80ch;
	}
	.chart {
		display: block;
		width: 100%;
		height: auto;
		margin-top: 4px;
	}
	.chart text {
		font-size: 12px;
		fill: var(--text-muted);
	}
	.chart .gap {
		stroke: var(--text-muted);
		stroke-dasharray: 2 3;
	}
	/* The footnote: the retired basket, dimmer than the tile's own source. */
	.foot {
		margin: 0;
		color: var(--text-muted);
		opacity: 0.8;
	}
</style>
