<script lang="ts">
	import { onMount } from 'svelte';
	import { componentLifetime } from '$lib/utils/lifetime';
	import { Panel } from '$lib/components/common';
	import { fetchGroceryBasketDataWithStatus } from '$lib/api/marin/grocery-basket';
	import { fetchGroceryInflationWithStatus } from '$lib/api/marin/grocery-inflation';
	import { groceryBasketStore } from '$lib/stores/grocery-basket';
	import { frozenBasketNote } from '$lib/config/grocery-basket';
	import { inflationChart, nearestMonth } from '$lib/grocery/inflation-chart';
	import type { GroceryInflation } from '$lib/grocery/inflation';
	import type { GroceryBasketData } from '$lib/types/grocery';

	/** The index's series colour: the grocery tile's orange, lightened so it never reads as dollars. */
	const INDEX_INK = '#fb923c';
	const CHART_HEIGHT = 170;

	let data = $state<GroceryBasketData>({ current: null, history: [] });
	let inflation = $state<GroceryInflation | null>(null);
	let dataLoading = $state(false);
	let dataError = $state<string | null>(null);
	let showAllItems = $state(false);
	let chartContainer = $state<HTMLDivElement>(undefined!);
	let chartWidth = $state(0);
	let hover = $state<number | null>(null);

	const current = $derived(data.current);
	const frozenNote = $derived(frozenBasketNote(data.frozen));
	const ok = $derived(inflation?.status === 'ok' ? inflation : null);
	const chart = $derived(
		ok && chartWidth > 0
			? inflationChart(ok.observations, { width: chartWidth, height: CHART_HEIGHT })
			: null
	);
	const hovered = $derived(ok && hover !== null ? ok.observations[hover] : null);
	const hoveredChange = $derived.by(() => {
		if (!ok || hover === null) return null;
		const now = ok.observations[hover];
		const then = ok.observations[hover - 12];
		if (now?.value == null || then?.value == null) return null;
		return { pct: (now.value / then.value - 1) * 100, against: then.label };
	});

	const price = (n: number) => `$${n.toFixed(2)}`;
	const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
	const day = (iso: string) =>
		new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'America/Los_Angeles'
		});

	function measure() {
		if (chartContainer) chartWidth = chartContainer.clientWidth;
	}

	function move(event: PointerEvent) {
		if (!chart) return;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		hover = nearestMonth(chart, ((event.clientX - rect.left) / rect.width) * chart.width);
	}

	function step(event: KeyboardEvent) {
		if (!ok) return;
		const last = ok.observations.length - 1;
		if (event.key === 'ArrowLeft') hover = Math.max(0, (hover ?? last) - 1);
		else if (event.key === 'ArrowRight') hover = Math.min(last, (hover ?? last - 1) + 1);
		else if (event.key === 'Escape') hover = null;
		else return;
		event.preventDefault();
	}

	const lifetime = componentLifetime();

	onMount(() => {
		measure();
		let timer: ReturnType<typeof setTimeout>;
		const onResize = () => {
			clearTimeout(timer);
			timer = setTimeout(measure, 150);
		};
		window.addEventListener('resize', onResize);

		void (async () => {
			dataLoading = true;
			dataError = null;
			try {
				const [index, basket] = await Promise.all([
					fetchGroceryInflationWithStatus({ signal: lifetime }),
					fetchGroceryBasketDataWithStatus({ signal: lifetime })
				]);
				if (lifetime.aborted) return; // destroyed while in flight: never write the shared store
				inflation = index.ok
					? index.data
					: { status: 'unavailable', reason: 'the BLS read could not be loaded' };
				if (basket.ok) {
					data = basket.data;
					groceryBasketStore.set(basket.data);
				}
			} finally {
				dataLoading = false;
			}
		})();

		return () => {
			window.removeEventListener('resize', onResize);
			clearTimeout(timer);
		};
	});

	$effect(() => {
		if (ok) measure();
	});
</script>

<Panel
	id="grocery-basket"
	title="SF-area grocery inflation"
	loading={dataLoading}
	error={dataError}
>
	{#if ok}
		<div class="ix-lead" data-grocery-inflation="ok">
			<span class="ix-kicker">CPI food at home · San Francisco area</span>
			<div class="ix-row">
				<span class="ix-big" data-grocery-lead>{pct(ok.lead.pct)}</span>
				<span class="ix-big-l">over the 12 months to {ok.lead.label}</span>
			</div>
			<div class="ix-stats">
				<div class="stat">
					<span class="k">Latest month</span>
					<span class="v"
						>{ok.latest.value.toFixed(1)} <small>index · {ok.latest.label}</small></span
					>
					{#if ok.latest.monthPct !== null}
						<span class="s">{pct(ok.latest.monthPct)} on {ok.latest.monthLabel?.split(' ')[0]}</span
						>
					{/if}
				</div>
				{#if ok.latestYoy.pct === null}
					<div class="stat" data-grocery-latest-yoy="unavailable">
						<span class="k">12 months to {ok.latestYoy.label.split(' ')[0]}</span>
						<span class="v dim">Unavailable</span>
						<span class="s">{ok.latestYoy.reason}</span>
					</div>
				{/if}
			</div>
		</div>

		<div class="section-label">
			Index, monthly · {ok.observations[0].label} – {ok.observations[ok.observations.length - 1]
				.label}
		</div>
		<div class="ix-chart" bind:this={chartContainer}>
			{#if chart}
				<div
					class="chart-hit"
					role="slider"
					aria-valuemin={0}
					aria-valuemax={ok.observations.length - 1}
					aria-valuenow={hover ?? ok.observations.length - 1}
					aria-valuetext={hovered
						? hovered.value === null
							? `${hovered.label}: no reading`
							: `${hovered.label}: index ${hovered.value.toFixed(3)}`
						: `${ok.latest.label}: index ${ok.latest.value.toFixed(3)}`}
					data-grocery-chart
					tabindex="0"
					aria-label="CPI food at home, SF area, monthly index {ok.observations[0].label} to {ok
						.observations[ok.observations.length - 1].label}. Arrow keys step through months."
					onpointermove={move}
					onpointerleave={() => (hover = null)}
					onkeydown={step}
					onblur={() => (hover = null)}
				>
					<svg width={chart.width} height={chart.height} aria-hidden="true">
						{#each chart.yTicks as t}
							<line
								x1={chart.plot.left}
								x2={chart.plot.right}
								y1={t.y}
								y2={t.y}
								stroke="rgba(148,163,184,0.12)"
							/>
							<text
								x={chart.plot.left - 4}
								y={t.y}
								text-anchor="end"
								dominant-baseline="middle"
								fill="var(--text-muted)"
								font-size="8">{t.label}</text
							>
						{/each}
						{#each chart.xTicks as t, i}
							<text
								x={t.x}
								y={chart.height - 6}
								text-anchor={i === 0 ? 'start' : 'middle'}
								fill="var(--text-muted)"
								font-size="8">Jan {t.label}</text
							>
						{/each}
						{#each chart.runs as run}
							<path d={run.area} fill={INDEX_INK} fill-opacity="0.1" />
							<path
								d={run.line}
								fill="none"
								stroke={INDEX_INK}
								stroke-width="1.6"
								stroke-linejoin="round"
							/>
						{/each}
						{#each chart.gaps as g}
							<line
								x1={g.x}
								x2={g.x}
								y1={chart.plot.top}
								y2={chart.plot.bottom}
								stroke="var(--text-muted)"
								stroke-dasharray="2,3"
							/>
							<text
								x={g.x - 4}
								y={chart.plot.bottom - 4}
								text-anchor="end"
								fill="var(--text-muted)"
								font-size="8">{g.label} not published</text
							>
						{/each}
						{#if chart.last}
							<circle cx={chart.last.x} cy={chart.last.y} r="3" fill={INDEX_INK} />
						{/if}
						{#if hover !== null && hovered}
							<line
								x1={chart.x(hover)}
								x2={chart.x(hover)}
								y1={chart.plot.top}
								y2={chart.plot.bottom}
								stroke="rgba(255,255,255,0.35)"
								stroke-dasharray="3,3"
							/>
							{#if hovered.value !== null}
								<circle
									cx={chart.x(hover)}
									cy={chart.y(hovered.value)}
									r="4"
									fill={INDEX_INK}
									stroke="#111"
								/>
							{/if}
						{/if}
					</svg>
				</div>
			{/if}
			{#if hovered}
				<div class="readout" data-grocery-readout role="status">
					<b>{hovered.label}</b>
					<span>
						{#if hovered.value === null}
							no reading: BLS didn't publish this month
						{:else}
							index {hovered.value.toFixed(3)} · {hoveredChange
								? `${pct(hoveredChange.pct)} on ${hoveredChange.against}`
								: '12-month change unavailable'}
						{/if}
					</span>
				</div>
			{/if}
		</div>
		<p class="not-dollars">
			An index, not a price: it shows how much SF-area grocery prices moved, not what a basket
			costs. Each point is one month; the 12-month change compares the same month a year earlier.
		</p>
		<div class="src">
			Source: <b>BLS CPI-U, food at home, San Francisco–Oakland–Hayward</b> ({ok.seriesId}) ·
			monthly · latest {ok.latest.label} · read {day(ok.checkedAt)}
		</div>
	{:else if inflation}
		<div class="empty" data-grocery-inflation={inflation.status}>
			{#if inflation.status === 'stale'}
				<span class="t">SF-area grocery prices are out of date</span>
				<span class="s"
					>The newest month we hold is {inflation.lastGood.period}, read {day(
						inflation.lastGood.checkedAt
					)}, and BLS has published nothing newer that we have read. No figure is shown until the
					next good read.</span
				>
			{:else}
				<span class="t">SF-area grocery prices can't be read right now</span>
				<span class="s"
					>There is no BLS figure to show. The next check is Monday; nothing older is carried
					forward as current.</span
				>
			{/if}
		</div>
	{/if}

	{#if current}
		<div class="ref" data-grocery-reference>
			<div class="ref-h">
				<span class="ref-t">The Bare Essentials · Marin basket</span>
				{#if current.totalCheapest !== null}
					<span class="ref-v">{price(current.totalCheapest)}</span>
				{/if}
			</div>
			<span class="ref-note" data-grocery-frozen>
				{frozenNote
					? frozenNote.replace(/^Prices/, 'Marin basket, prices')
					: 'Marin basket, no longer updated'} · {current.itemsFound}/12 items, cheapest mix
			</span>
			{#if current.items.length > 0}
				<button
					class="toggle-items"
					type="button"
					aria-expanded={showAllItems}
					onclick={() => (showAllItems = !showAllItems)}
				>
					<span class="section-label"
						>{showAllItems ? 'Hide' : 'Show'} the {current.items.length} items</span
					>
					<span class="toggle-arrow">{showAllItems ? '▲' : '▼'}</span>
				</button>
				{#if showAllItems}
					<div class="item-list">
						{#each current.items as item}
							<div class="item-row">
								<div class="item-info">
									<span class="item-name">{item.itemName}</span>
									<span class="item-store">{item.cheapestStore ?? 'Not found'}</span>
								</div>
								<span class="item-price"
									>{item.cheapest !== null ? price(item.cheapest) : 'N/A'}</span
								>
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</Panel>

<style>
	.ix-lead {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding-bottom: 0.65rem;
		margin-bottom: 0.65rem;
		border-bottom: 1px solid var(--border);
	}
	.ix-kicker {
		font-size: 0.6rem;
		color: var(--text-muted);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		font-weight: 600;
	}
	.ix-row {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.ix-big {
		font-size: 1.6rem;
		font-weight: 700;
		color: #fb923c;
		font-variant-numeric: tabular-nums;
	}
	.ix-big-l {
		font-size: 0.72rem;
		color: var(--text-secondary);
	}
	.ix-stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.stat {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.4rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.stat .k {
		font-size: 0.5rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.stat .v {
		font-size: 0.85rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.stat .v small {
		font-size: 0.6rem;
		font-weight: 400;
		color: var(--text-muted);
	}
	.stat .v.dim {
		color: var(--text-muted);
	}
	.stat .s {
		font-size: 0.55rem;
		color: var(--text-dim);
		line-height: 1.35;
	}
	.section-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
	}
	.ix-chart {
		position: relative;
	}
	.ix-chart svg {
		display: block;
		width: 100%;
	}
	.chart-hit {
		outline-offset: 2px;
	}
	.readout {
		position: absolute;
		top: 2px;
		left: 34px;
		padding: 0.25rem 0.45rem;
		background: rgba(8, 8, 8, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.14);
		font-size: 0.56rem;
		line-height: 1.4;
		pointer-events: none;
	}
	.readout b {
		color: var(--text);
	}
	.readout span {
		color: var(--text-dim);
	}
	.not-dollars {
		font-size: 0.55rem;
		color: var(--text-muted);
		line-height: 1.45;
		margin: 0.4rem 0 0;
	}
	.src {
		font-size: 0.55rem;
		color: var(--text-muted);
		margin-top: 0.4rem;
		line-height: 1.45;
	}
	.src b {
		color: var(--text-dim);
		font-weight: 500;
	}
	.empty {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.75rem;
	}
	.empty .t {
		font-size: 0.75rem;
		color: var(--text-secondary);
		font-weight: 500;
	}
	.empty .s {
		font-size: 0.65rem;
		color: var(--text-dim);
		line-height: 1.45;
	}
	/* The dated reference: dashed, grey, never the series colour. */
	.ref {
		margin-top: 0.75rem;
		border: 1px dashed rgba(148, 163, 184, 0.35);
		border-radius: 4px;
		padding: 0.5rem 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.ref-h {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.6rem;
	}
	.ref-t {
		font-size: 0.55rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #94a3b8;
	}
	.ref-v {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.ref-note {
		font-size: 0.6rem;
		color: #94a3b8;
	}
	.toggle-items {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.2rem 0 0;
		border: none;
		background: none;
		cursor: pointer;
		color: var(--text-muted);
	}
	.toggle-arrow {
		font-size: 0.5rem;
		color: var(--text-muted);
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
	}
	.item-price {
		font-size: 0.68rem;
		font-weight: 700;
		color: var(--text-secondary);
		margin-left: 0.5rem;
		white-space: nowrap;
	}
</style>
