<script lang="ts">
	import { onMount } from 'svelte';
	import { buildChart } from '$lib/utils/chart';
	import { PACIFIC } from '$lib/dashboard/pacific-time';
	import { axisTicks, signed, type CostView, type SubIndexTile } from '$lib/dashboard/cost';
	import type { Measured } from '$lib/dashboard/measured';
	import CardSource from './CardSource.svelte';
	import LifestyleCard from './LifestyleCard.svelte';

	let { view, now, onopen }: { view: CostView; now: number; onopen: () => void } = $props();

	// Section.svelte mounts this body only while the section is open: mounting is opening (§7).
	onMount(() => onopen());

	const TREND = { width: 640, height: 220, margins: { top: 10, right: 8, bottom: 18, left: 34 } };
	const GAS = { width: 720, height: 240, margins: { top: 10, right: 10, bottom: 20, left: 44 } };
	const SPARK = { width: 220, height: 44, margins: { top: 6, right: 5, bottom: 4, left: 2 } };
	/** The mockup's colours: tier categories, then the Marin Number's stack. */
	const TIER_COLOR: Record<string, string> = {
		'daily-life': '#f59e0b',
		lifestyle: '#a855f7',
		housing: '#3b82f6',
		structural: '#64748b'
	};
	const PALETTE = [
		'#3b82f6',
		'#64748b',
		'#a855f7',
		'#f59e0b',
		'#14b8a6',
		'#ec4899',
		'#10b981',
		'#ef4444',
		'#d97706',
		'#0ea5e9',
		'#8b5cf6',
		'#f43f5e',
		'#84cc16',
		'#06b6d4',
		'#eab308',
		'#f97316',
		'#94a3b8'
	];

	const day = (ms: number) =>
		new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: PACIFIC });
	const usd = (n: number, dec = 2) =>
		`$${n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
	const direction = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
	/** Not reachable as a number: the read's own wording, never 0 or $0. */
	const why = (m: Measured<unknown>) =>
		m.kind === 'loading'
			? 'Loading…'
			: m.kind === 'value'
				? ''
				: `${m.kind === 'unknown' ? 'Unknown' : 'Unavailable'} · ${m.reason}`;

	const comp = $derived(view.composite.kind === 'value' ? view.composite.value : null);
	const trend = $derived(
		comp
			? buildChart({
					...TREND,
					accentColor: '#dc2626',
					data: comp.series.map((p) => ({ value: p.score })),
					include: [100]
				})
			: null
	);
	const items = $derived(
		comp ? [...comp.marinNumber.items].sort((a, b) => b.monthly - a.monthly) : []
	);
	const liveCount = $derived(items.filter((i) => i.source === 'live').length);

	const gas = $derived(view.gas.kind === 'value' ? view.gas.value : null);
	const gasChart = $derived(
		gas
			? buildChart({
					...GAS,
					accentColor: '#10b981',
					data: gas.series.map((p) => ({ value: p.avg })),
					include: gas.series.flatMap((p) => [p.min, p.max].filter((v): v is number => v !== null))
				})
			: null
	);
	/** The low–high band, drawn only through readings that report both ends. */
	const gasBand = $derived.by(() => {
		if (!gas || !gasChart) return '';
		const pts = gas.series.flatMap((p, i) =>
			p.min !== null && p.max !== null ? [{ x: gasChart.xScale(i), lo: p.min, hi: p.max }] : []
		);
		if (pts.length < 2) return '';
		const top = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x},${gasChart.yScale(p.hi)}`).join('');
		const bottom = [...pts]
			.reverse()
			.map((p) => `L${p.x},${gasChart.yScale(p.lo)}`)
			.join('');
		return `${top}${bottom}Z`;
	});
	const gasTicks = $derived.by(() => {
		if (!gasChart || !gas) return [];
		const idx = axisTicks(gas.series.length);
		// The first and last labels sit inside the plot, never clipped at its edges.
		return idx.map((i, k) => ({
			i,
			x: gasChart.xScale(i),
			label: day(gas.series[i].atMs),
			anchor: k === 0 ? 'start' : k === idx.length - 1 ? 'end' : 'middle'
		}));
	});
	const notes = $derived(
		gas
			? [
					gas.diesel !== null ? `diesel ${usd(gas.diesel)}` : null,
					gas.premium !== null ? `premium ${usd(gas.premium)}` : null
				].filter((n): n is string => n !== null)
			: []
	);

	function spark(t: SubIndexTile) {
		return t.spark
			? buildChart({ ...SPARK, accentColor: t.color, data: t.spark.map((value) => ({ value })) })
			: null;
	}
</script>

<div class="cost" data-slot="cost">
	<div class="cost-top" class:life={!!view.lifestyle}>
		{#if view.lifestyle}
			<!-- The Lifestyle Index (behind its flag) replaces the composite and the Marin Number. -->
			<LifestyleCard view={view.lifestyle} {now} />
		{:else}
			<article class="card" data-card="composite">
				<div class="card-head">
					<h3 class="card-title" data-text-role="label">Cost of being Marin</h3>
					<span class="meta" data-text-role="meta">composite index, base 100</span>
				</div>
				{#if comp}
					<div class="hero-row">
						<span class="hero num" data-text-role="value">{comp.score.toFixed(1)}</span>
						{#if comp.change !== null && comp.previousAtMs !== null}
							<span class={direction(comp.change)} data-text-role="value"
								>{comp.change === 0 ? 'no change' : signed(comp.change, 1, '')}</span
							>
							<span class="meta" data-text-role="meta">vs {day(comp.previousAtMs)}</span>
						{/if}
					</div>
					{#if trend}
						<svg
							class="chart"
							data-text-role="meta"
							viewBox="0 0 {TREND.width} {TREND.height}"
							role="img"
							aria-label="Composite index by week, now {comp.score.toFixed(1)}"
						>
							<g transform="translate({TREND.margins.left},{TREND.margins.top})">
								<line
									class="base"
									x1="0"
									x2={TREND.width - TREND.margins.left - TREND.margins.right}
									y1={trend.yScale(100)}
									y2={trend.yScale(100)}
								/>
								<text x="4" y={trend.yScale(100) - 4}>base 100</text>
								<path d={trend.areaPath} fill="#dc2626" fill-opacity="0.12" />
								<path d={trend.linePath} fill="none" stroke="#dc2626" stroke-width="2" />
								<text x="-6" y={trend.yScale(trend.yMax) + 10} text-anchor="end"
									>{Math.round(trend.yMax)}</text
								>
								<text x="-6" y={trend.yScale(trend.yMin)} text-anchor="end"
									>{Math.round(trend.yMin)}</text
								>
							</g>
						</svg>
					{/if}
					<div>
						{#each comp.tiers as t (t.category)}
							<div class="tier">
								<span data-text-role="label"
									>{t.label} <span class="meta" data-text-role="meta">{t.weightPct}%</span></span
								>
								<span class="bar"
									><i
										style="background:{TIER_COLOR[t.category] ?? '#64748b'};{t.bar.side === 'right'
											? 'left'
											: 'right'}:50%;width:{t.bar.widthPct}%"
									></i></span
								>
								<span class="num" data-text-role="value">{t.score.toFixed(1)}</span>
							</div>
						{/each}
					</div>
					<p class="meta" data-text-role="meta">
						Bars run from 100 (centre): right is pricier than baseline, left cheaper. {comp.readings}
						weekly readings since {day(comp.sinceMs)}.
					</p>
				{:else}
					<p class="empty" data-text-role="body">{why(view.composite)}</p>
				{/if}
				<CardSource lines={[{ measured: view.composite }]} {now} />
			</article>

			<article class="card" data-card="marin-number">
				<div class="card-head">
					<h3 class="card-title" data-text-role="label">The Marin Number</h3>
					<span class="meta" data-text-role="meta">what a month here costs, itemized</span>
				</div>
				{#if comp}
					<div class="hero-row">
						<span class="hero num plain" data-text-role="value"
							>{usd(comp.marinNumber.total, 0)}<span class="per" data-text-role="meta">/mo</span
							></span
						>
						<span class="meta" data-text-role="meta">{usd(comp.marinNumber.annualized, 0)}/yr</span>
					</div>
					<div class="mn-stack" aria-hidden="true">
						{#each items as it, i (it.label)}
							<i title={it.label} style="flex:{it.monthly};background:{PALETTE[i % PALETTE.length]}"
							></i>
						{/each}
					</div>
					<ul class="mn-list">
						{#each items as it, i (it.label)}
							<li>
								<span data-text-role="label"
									><span class="sw" style="background:{PALETTE[i % PALETTE.length]}"
									></span>{it.label}<span class="tag {it.source}" data-text-role="meta"
										>{it.source}</span
									></span
								>
								<span class="num" data-text-role="value">{usd(it.monthly, 0)}</span>
							</li>
						{/each}
					</ul>
					<p class="meta quip" data-text-role="meta">
						This does not include your Rivian payment. (It does.)
					</p>
				{:else}
					<p class="empty" data-text-role="body">{why(view.composite)}</p>
				{/if}
				<CardSource
					lines={[{ measured: view.composite }]}
					{now}
					notes={comp ? [`${liveCount} live`, `${items.length - liveCount} fixed estimates`] : []}
				/>
			</article>
		{/if}

		<article class="card gas" data-card="gas">
			<div class="card-head">
				<h3 class="card-title" data-text-role="label">Gas prices · regular</h3>
				<span class="meta" data-text-role="meta">county average, low–high band</span>
			</div>
			{#if gas}
				{#if gasChart}
					<svg
						class="chart"
						data-text-role="meta"
						viewBox="0 0 {GAS.width} {GAS.height}"
						role="img"
						aria-label="County average regular price with its low–high band"
					>
						<g transform="translate({GAS.margins.left},{GAS.margins.top})">
							{#if gasBand}<path d={gasBand} fill="rgba(16,185,129,.12)" />{/if}
							<path d={gasChart.linePath} fill="none" stroke="#10b981" stroke-width="2" />
							<text x="-6" y={gasChart.yScale(gasChart.yMax) + 10} text-anchor="end"
								>{usd(gasChart.yMax)}</text
							>
							<text x="-6" y={gasChart.yScale(gasChart.yMin)} text-anchor="end"
								>{usd(gasChart.yMin)}</text
							>
							{#each gasTicks as t (t.i)}
								<text x={t.x} y={GAS.height - GAS.margins.top - 4} text-anchor={t.anchor}
									>{t.label}</text
								>
							{/each}
						</g>
					</svg>
				{/if}
				<div class="stats">
					<div class="stat">
						<div class="k" data-text-role="meta">Avg regular</div>
						<div class="v num" data-text-role="value">
							{gas.avg === null ? 'Unknown' : usd(gas.avg, 3)}
						</div>
						<div class="s" data-text-role="meta">county-wide</div>
					</div>
					<div class="stat" data-stat="change7">
						<div class="k" data-text-role="meta">7-day change</div>
						<div
							class="v num {gas.change7 === null ? '' : direction(gas.change7)}"
							data-text-role="value"
						>
							{gas.change7 === null ? '—' : signed(gas.change7, 3)}
						</div>
						<div class="s" data-text-role="meta">
							{gas.change7 === null
								? 'not enough history'
								: gas.change7 > 0
									? 'trending up'
									: 'easing'}
						</div>
					</div>
					<div class="stat">
						<div class="k" data-text-role="meta">Cheapest</div>
						<div class="v num" data-text-role="value">
							{gas.cheapest[0] ? usd(gas.cheapest[0].price) : '—'}
						</div>
						<div class="s" data-text-role="meta">
							{gas.cheapest[0]?.name ?? 'no station prices'}
						</div>
					</div>
					<div class="stat">
						<div class="k" data-text-role="meta">Stations</div>
						<div class="v num" data-text-role="value">{gas.stationCount}</div>
						<div class="s" data-text-role="meta">reporting prices</div>
					</div>
				</div>
				<ul class="rows">
					{#each gas.cheapest as s (s.name + s.address)}
						<li>
							<span data-text-role="label"
								>{s.name} <span class="meta" data-text-role="meta">{s.address}</span></span
							>
							<span class="num down" data-text-role="value">{usd(s.price)}</span>
						</li>
					{/each}
					{#if gas.priciest}
						<li>
							<span data-text-role="label"
								>Priciest: {gas.priciest.name}
								<span class="meta" data-text-role="meta">{gas.priciest.address}</span></span
							>
							<span class="num up" data-text-role="value">{usd(gas.priciest.price)}</span>
						</li>
					{/if}
				</ul>
			{:else}
				<p class="empty" data-text-role="body">{why(view.gas)}</p>
			{/if}
			<CardSource lines={[{ measured: view.gas }]} {now} {notes} />
		</article>
	</div>

	<div>
		<h3 class="subhead" data-text-role="label">The sub-indexes</h3>
		<div class="idx">
			{#each view.tiles as t (t.id)}
				{@const sp = spark(t)}
				<div class="ix" data-tile={t.id} style="--c:{t.color}">
					<span class="t" data-text-role="label">{t.title}</span>
					<span class="v num" class:muted={t.kind !== 'value'} data-text-role="value"
						>{t.value}</span
					>
					{#if t.detail}<span class="d" data-text-role="meta">{t.detail}</span>{/if}
					{#if sp}
						<svg
							class="spark"
							data-spark
							data-text-role="meta"
							viewBox="0 0 {SPARK.width} {SPARK.height}"
							preserveAspectRatio="none"
							role="img"
							aria-label="{t.title} trend"
						>
							<g transform="translate({SPARK.margins.left},{SPARK.margins.top})">
								<path d={sp.areaPath} fill={t.color} fill-opacity="0.18" />
								<path d={sp.linePath} fill="none" stroke={t.color} stroke-width="1.7" />
							</g>
						</svg>
					{:else if t.kind === 'value'}
						<div class="nohist" data-no-history data-text-role="meta">
							No history yet{t.noHistoryReason ? ` · ${t.noHistoryReason}` : ''}
						</div>
					{/if}
					<CardSource
						lines={[{ measured: t.measured, untimed: t.untimed, muted: t.muted }]}
						{now}
					/>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	/* The approved mockup's Cost & Character (desktop-v2-mockup.html: .cost-top, .tier, .mn-*, .idx). */
	.cost {
		display: flex;
		flex-direction: column;
		gap: var(--v2-gap, 14px);
	}
	.cost-top {
		display: grid;
		gap: var(--v2-gap, 14px);
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 1280px) {
		.cost-top {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.cost-top > .gas {
			grid-column: span 2;
		}
	}
	/* The mockup's 1280–1699 gas card: chart beside the stats and stations, source across the foot. */
	@media (min-width: 1280px) and (max-width: 1699px) {
		.cost-top > .gas {
			display: grid;
			grid-template-columns: 3fr 2fr;
			grid-template-areas: 'h h' 'c s' 'c r' 'f f';
			column-gap: 22px;
			align-items: start;
		}
		.gas > .card-head {
			grid-area: h;
		}
		.gas > .chart,
		.gas > .empty {
			grid-area: c;
		}
		.gas > .stats {
			grid-area: s;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.gas > .rows {
			grid-area: r;
		}
		.gas > :global(.src) {
			grid-area: f;
		}
	}
	@media (min-width: 1700px) {
		.cost-top {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.cost-top > .gas {
			grid-column: auto;
		}
	}
	/* The Lifestyle card takes the composite's and the Marin Number's row. */
	.cost-top.life > :global([data-card='lifestyle']) {
		grid-column: 1 / -1;
	}
	@media (min-width: 1700px) {
		.cost-top.life > :global([data-card='lifestyle']) {
			grid-column: span 2;
		}
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		padding: 12px 14px;
		border: 1px solid var(--border-light);
		border-radius: 8px;
	}
	.card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.25rem 0.75rem;
	}
	.card-title,
	.subhead {
		margin: 0;
		color: var(--text-muted);
		font-weight: 400;
	}
	.subhead {
		margin-bottom: 8px;
		color: var(--text-secondary);
		font-weight: 500;
	}
	.meta,
	.muted,
	.empty {
		margin: 0;
		color: var(--text-muted);
	}
	.quip {
		font-style: italic;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.up {
		color: var(--red, #ef4444);
	}
	.down {
		color: var(--green, #10b981);
	}
	.flat {
		color: var(--text-muted);
	}
	.hero-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.6rem;
	}
	.hero {
		color: #dc2626;
	}
	.hero.plain {
		color: var(--text-primary);
	}
	.per {
		color: var(--text-muted);
	}
	.chart {
		display: block;
		width: 100%;
		height: auto;
	}
	.chart text {
		font-size: 12px;
		fill: var(--text-muted);
	}
	.chart .base {
		stroke: var(--text-muted);
		stroke-dasharray: 3 3;
	}
	.tier {
		display: grid;
		grid-template-columns: 6.5rem 1fr 3rem;
		gap: 8px;
		align-items: center;
		padding: 3px 0;
	}
	.tier .num {
		text-align: right;
		font-weight: 500;
	}
	.bar {
		position: relative;
		height: 10px;
		border-radius: 3px;
		background: var(--surface-2, var(--border));
	}
	.bar i {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 3px;
	}
	.bar::after {
		content: '';
		position: absolute;
		left: 50%;
		top: -3px;
		bottom: -3px;
		width: 1px;
		background: var(--text-muted);
	}
	.mn-stack {
		display: flex;
		gap: 1px;
		height: 14px;
		overflow: hidden;
		border-radius: 3px;
	}
	.mn-list {
		margin: 0;
		padding: 0;
		list-style: none;
		columns: 2;
		column-gap: 22px;
	}
	.mn-list li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 3px 0;
		break-inside: avoid;
		border-bottom: 1px solid var(--border);
	}
	.sw {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 6px;
		border-radius: 2px;
	}
	.tag {
		margin-left: 5px;
		padding: 0 5px;
		border-radius: 3px;
		font-weight: 600;
		vertical-align: 1px;
	}
	.tag.live {
		color: var(--green, #10b981);
		background: rgba(16, 185, 129, 0.12);
	}
	.tag.static {
		color: var(--text-muted);
		background: rgba(123, 139, 160, 0.14);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
	}
	.stat {
		min-width: 0;
		padding: 7px 9px;
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.stat .k,
	.stat .s {
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rows li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2px 10px;
		padding: 7px 0;
		border-bottom: 1px solid var(--border);
	}
	.rows li:last-child {
		border-bottom: 0;
	}
	/* Cost renders from 1024 px: four across, six from 1700 (plan Goal 3). */
	.idx {
		display: grid;
		gap: var(--v2-gap, 14px);
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	@media (min-width: 1700px) {
		.idx {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
	}
	.ix {
		position: relative;
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
	.ix .t {
		color: var(--text-secondary);
		font-weight: 500;
	}
	.ix .v {
		color: var(--c);
	}
	.ix .v.muted {
		color: var(--text-muted);
	}
	.spark {
		display: block;
		width: 100%;
		height: 44px;
	}
	.nohist {
		display: grid;
		place-items: center;
		height: 44px;
		padding: 0 6px;
		border: 1px dashed var(--border-light);
		border-radius: 6px;
		color: var(--text-muted);
		text-align: center;
	}
</style>
