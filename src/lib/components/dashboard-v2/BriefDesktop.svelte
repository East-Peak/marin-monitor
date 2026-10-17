<script lang="ts">
	import type { BriefCard, BriefState } from '$lib/dashboard/brief-store';
	import { hourlyStrip, tempTrace, tideDay } from '$lib/dashboard/brief-desktop';
	import type { CardItem } from '$lib/dashboard/getting-around';
	import type { OutdoorsView } from '$lib/dashboard/outdoors';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import { effectiveState, type SourceEntryState } from '$lib/dashboard/source-status';
	import { buildChart } from '$lib/utils/chart';
	import { nextTide, restOfTodayRainChance } from '$lib/weather/brief';
	import CardSource from './CardSource.svelte';

	/**
	 * The desktop brief (MAPX1; desktop-v2-mockup.html `.brief`, 5fr 4fr 3fr): weather with
	 * its last 12 hours and the next hours, today's NOAA tide curve, and the ocean. The phone
	 * keeps BriefRow; DashboardV2 mounts this only at ≥1024 px.
	 */
	let {
		brief,
		now,
		ocean,
		around,
		onjump
	}: {
		brief: BriefState;
		now: number;
		ocean: OutdoorsView['surf'];
		/** Getting Around's one line per part (gettingAroundCard). */
		around: CardItem[];
		onjump?: (hash: string) => void;
	} = $props();

	const TRACE_H = 76;
	const TIDE_H = 92;
	const SPARK_H = 28;
	const clock = (ms: number) => formatAsOf(ms, ms).replace(':00', '');
	/** A label near either edge reads inward, so it never leaves the card. */
	const anchor = (x: number, innerW: number) =>
		x < 40 ? 'start' : x > innerW - 40 ? 'end' : 'middle';

	function stateOf(card: BriefCard<unknown>): SourceEntryState {
		const { state, observedAt, maxAgeMs, detail } = card;
		return effectiveState({ id: '', name: '', state, observedAt, maxAgeMs, detail }, now);
	}

	const observed = $derived(brief.observed);
	const forecast = $derived(brief.forecast);
	const observedState = $derived(stateOf(observed));
	const rain = $derived(forecast.value ? restOfTodayRainChance(forecast.value.periods, now) : null);
	const strip = $derived(forecast.value ? hourlyStrip(forecast.value.periods, now) : []);

	let traceW = $state(0);
	const trace = $derived(brief.history.value ? tempTrace(brief.history.value, now) : null);
	const traceChart = $derived(
		trace &&
			buildChart({
				width: traceW || 280,
				height: TRACE_H,
				margins: { top: 16, right: 8, bottom: 16, left: 8 },
				accentColor: '#ef4444',
				xDomain: trace.domain,
				data: trace.points
			})
	);

	const tide = $derived(brief.tides.value ? nextTide(brief.tides.value, now) : null);
	const tidesState = $derived<SourceEntryState>(
		brief.tides.value !== null && tide === null ? 'unavailable' : stateOf(brief.tides)
	);
	let tideW = $state(0);
	/** One station only: right after a town switch the two reads can name different ones (Codex #1). */
	const sameStation = $derived(brief.tideHourly.scope === brief.tides.scope);
	const day = $derived(
		brief.tideHourly.value && sameStation
			? tideDay(brief.tideHourly.value, brief.tides.value ?? [], now)
			: null
	);
	const tideChart = $derived(
		day &&
			buildChart({
				width: tideW || 280,
				height: TIDE_H,
				margins: { top: 16, right: 8, bottom: 16, left: 8 },
				accentColor: '#14b8a6',
				xDomain: day.domain,
				data: day.points.map((p) => ({ x: p.atMs, value: p.ft }))
			})
	);

	const surf = $derived(ocean.view.current);
	const oceanState = $derived<SourceEntryState>(
		ocean.measured.kind === 'value'
			? ocean.measured.retainedAfter
				? 'stale'
				: 'ok'
			: ocean.measured.kind
	);
	let sparkW = $state(0);
	const sparkChart = $derived(
		buildChart({
			width: sparkW || 200,
			height: SPARK_H,
			margins: { top: 2, right: 2, bottom: 2, left: 2 },
			accentColor: '#3b82f6',
			data: ocean.view.heights.slice(0, 24).map((v) => ({ value: v ?? Number.NaN }))
		})
	);
</script>

<section class="brief" data-slot="brief" aria-label="Morning brief">
	<article class="card" data-card="weather" data-state={observedState}>
		<div class="head">
			<h3 class="title" data-text-role="label">Weather</h3>
		</div>
		<div class="split">
			<div>
				{#if observed.value}
					<p class="hero" data-text-role="value">
						{observed.value.tempF === null ? 'Temperature unknown' : `${observed.value.tempF}°F`}
					</p>
					<p class="muted" data-text-role="meta">
						Observed at {observed.value.stationName} · {formatAsOf(
							observed.value.observedAt,
							now
						)}{observedState === 'stale' ? ' · out of date' : ''}
					</p>
				{:else if observedState === 'loading'}
					<p class="muted" data-text-role="meta">Loading observation…</p>
				{:else}
					<p class="muted" data-text-role="meta">Observation unavailable</p>
				{/if}
			</div>
			<div class="chart" bind:clientWidth={traceW}>
				{#if trace && traceChart}
					<svg
						data-chart="trace"
						data-text-role="meta"
						viewBox="0 0 {traceW || 280} {TRACE_H}"
						style:height="{TRACE_H}px"
						role="img"
						aria-label="Temperature, last 12 hours: {trace.low.f}° to {trace.high.f}°"
					>
						<g transform="translate(8,16)">
							<path d={traceChart.areaPath} fill="#ef4444" fill-opacity="0.12" />
							<path
								data-line
								d={traceChart.linePath}
								fill="none"
								stroke="#f59e0b"
								stroke-width="2"
							/>
							{#each [trace.high, trace.low] as mark, i (i)}
								<text
									x={traceChart.xScale(mark.atMs)}
									y={traceChart.yScale(mark.f) + (i ? 13 : -5)}
									text-anchor={anchor(traceChart.xScale(mark.atMs), (traceW || 280) - 16)}
									>{mark.f}°</text
								>
							{/each}
						</g>
					</svg>
					<p class="muted" data-text-role="meta">
						Last 12 h at {brief.history.scope}{stateOf(brief.history) === 'stale'
							? ' · out of date'
							: ''}
					</p>
				{:else if brief.history.state === 'loading'}
					<p class="muted" data-text-role="meta">Loading the last 12 hours…</p>
				{:else}
					<p class="muted" data-text-role="meta">Last 12 hours unavailable</p>
				{/if}
			</div>
		</div>
		{#if strip.length}
			<ol class="strip" data-strip="hourly" aria-label="Next {strip.length} hours">
				{#each strip as h (h.atMs)}
					<li>
						<span class="muted" data-text-role="meta">{clock(h.atMs)}</span>
						<span data-text-role="label">{h.f === null ? '—' : `${h.f}°`}</span>
						<span class="muted" data-text-role="meta">{h.pop === null ? '—' : `${h.pop}%`}</span>
					</li>
				{/each}
			</ol>
		{/if}
		<div class="rain" data-card="rain" data-state={stateOf(forecast)}>
			<p data-text-role="body">
				{forecast.value
					? rain === null
						? 'Rain chance unknown'
						: `Rain today: ${rain.maxPct}%`
					: forecast.state === 'loading'
						? 'Loading forecast…'
						: 'Forecast unavailable'}
			</p>
			{#if forecast.value}
				<p class="muted" data-text-role="meta">
					{forecast.scope}{forecast.observedAt !== null
						? ` · issued ${formatAsOf(forecast.observedAt, now)}`
						: ' · issue time unknown'}{stateOf(forecast) === 'stale' ? ' · out of date' : ''}
				</p>
			{/if}
			{#if forecast.updatingFor}
				<p class="muted" data-text-role="meta">Updating for {forecast.updatingFor}…</p>
			{/if}
			{#if forecast.detail}
				<p class="warn" data-text-role="meta">{forecast.detail}</p>
			{/if}
		</div>
	</article>

	<article class="card" data-card="tide" data-state={tidesState}>
		<div class="head">
			<h3 class="title" data-text-role="label">Tides</h3>
		</div>
		{#if tide}
			<p class="hero" data-text-role="value">
				{`${tide.type === 'H' ? 'High' : 'Low'} ${tide.heightFt.toFixed(1)} ft · ${formatAsOf(tide.atMs, now)}`}
			</p>
		{:else if tidesState === 'loading'}
			<p class="muted" data-text-role="meta">Loading tides…</p>
		{:else}
			<p class="muted" data-text-role="meta">Tide predictions unavailable</p>
		{/if}
		<div class="chart" bind:clientWidth={tideW}>
			{#if day && tideChart}
				<svg
					data-chart="tide"
					data-text-role="meta"
					viewBox="0 0 {tideW || 280} {TIDE_H}"
					style:height="{TIDE_H}px"
					role="img"
					aria-label="Today's tide, NOAA hourly prediction"
				>
					<g transform="translate(8,16)">
						<path d={tideChart.areaPath} fill="#14b8a6" fill-opacity="0.15" />
						<path data-line d={tideChart.linePath} fill="none" stroke="#14b8a6" stroke-width="2" />
						{#if now >= day.domain[0] && now <= day.domain[1]}
							<line
								x1={tideChart.xScale(now)}
								x2={tideChart.xScale(now)}
								y1="0"
								y2={TIDE_H - 32}
								stroke="currentColor"
								stroke-opacity="0.4"
								stroke-dasharray="2 3"
							/>
						{/if}
						{#each day.events as e (e.atMs)}
							<circle
								data-event={e.type}
								cx={tideChart.xScale(e.atMs)}
								cy={tideChart.yScale(e.heightFt)}
								r="3"
								fill="#14b8a6"
							/>
							<text
								x={tideChart.xScale(e.atMs)}
								y={tideChart.yScale(e.heightFt) + (e.type === 'L' ? 14 : -6)}
								text-anchor={anchor(tideChart.xScale(e.atMs), (tideW || 280) - 16)}
								>{e.type === 'H' ? 'High' : 'Low'} {clock(e.atMs)}</text
							>
						{/each}
					</g>
				</svg>
			{:else if brief.tideHourly.state === 'loading'}
				<p class="muted" data-text-role="meta">Loading tide curve…</p>
			{:else}
				<p class="muted" data-text-role="meta">Tide curve unavailable</p>
			{/if}
		</div>
		<p class="muted" data-text-role="meta">
			{brief.tides.scope ? `${brief.tides.scope} · ` : ''}NOAA prediction{day &&
			stateOf(brief.tideHourly) === 'stale'
				? ' · curve out of date'
				: ''}
		</p>
		{#if brief.tides.updatingFor}
			<p class="muted" data-text-role="meta">Updating for {brief.tides.updatingFor}…</p>
		{/if}
		{#if brief.tides.detail}
			<p class="warn" data-text-role="meta">{brief.tides.detail}</p>
		{/if}
	</article>

	<div class="third">
		<article class="card" data-card="ocean" data-state={oceanState}>
			<h3 class="title" data-text-role="label">Ocean · Point Reyes</h3>
			{#if ocean.measured.kind === 'value'}
				<p class="hero" data-text-role="value">
					{surf
						? `${surf.waveFt.toFixed(1)} ft${surf.periodS !== null ? ` @ ${Math.round(surf.periodS)} s` : ''}`
						: 'No wave height this hour'}
				</p>
				{#if sparkChart}
					<div class="spark" bind:clientWidth={sparkW}>
						<svg
							viewBox="0 0 {sparkW || 200} {SPARK_H}"
							style:height="{SPARK_H}px"
							role="img"
							aria-label="Wave height, next 24 hours"
						>
							<g transform="translate(2,2)">
								<path d={sparkChart.linePath} fill="none" stroke="#3b82f6" stroke-width="1.6" />
							</g>
						</svg>
					</div>
				{/if}
			{:else if ocean.measured.kind === 'loading'}
				<p class="muted" data-text-role="meta">Loading ocean forecast…</p>
			{:else}
				<p class="muted" data-text-role="meta">Ocean forecast unavailable</p>
			{/if}
			<CardSource lines={[{ measured: ocean.measured, verb: 'checked' }]} {now} />
		</article>
		<a
			class="card ga"
			data-card="getting-around"
			href="#getting-around"
			onclick={() => onjump?.('#getting-around')}
		>
			<span class="title" data-text-role="label">Getting around →</span>
			<ul>
				{#each around as item, i (i)}
					<li data-state={item.state} data-text-role="meta">{item.text}</li>
				{/each}
			</ul>
		</a>
	</div>
</section>

<style>
	.brief {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--v2-gap, 14px);
		margin: var(--v2-gap, 14px) 0 0;
	}
	@media (max-width: 1023px) {
		/* The render boundary's CSS half: never shown below desktop, whatever mounts it. */
		.brief {
			display: none;
		}
	}
	@media (min-width: 1280px) {
		.brief {
			grid-template-columns: 5fr 4fr 3fr;
		}
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		padding: var(--v2-card-padding);
		border: 1px solid var(--border-light);
		border-radius: 8px;
	}
	.card p,
	.title {
		margin: 0;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.title,
	.muted {
		color: var(--text-muted);
	}
	.hero {
		font-weight: 600;
	}
	.split {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 16px;
		align-items: end;
	}
	.chart,
	.spark {
		min-width: 0;
	}
	svg {
		/* Always the container's width: the measured width only sharpens the drawing. */
		display: block;
		width: 100%;
		overflow: visible;
	}
	svg text {
		fill: var(--text-muted);
	}
	.strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
		grid-auto-flow: column;
		gap: 4px;
		margin: 2px 0 0;
		padding: 4px 0 0;
		border-top: 1px solid var(--border-light);
		list-style: none;
	}
	.strip li {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.4;
	}
	.third {
		display: flex;
		flex-direction: column;
		gap: var(--v2-gap, 14px);
		min-width: 0;
	}
	.rain {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 0.75rem;
	}
	.warn {
		color: var(--warning, var(--text-primary));
	}
	.ga {
		color: var(--text-primary);
		text-decoration: none;
	}
	.ga:hover {
		border-color: var(--accent);
	}
	.ga:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.ga ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ga li:not(:last-child)::after {
		content: ' ·';
		color: var(--text-muted);
	}
	.ga li[data-state='unavailable'],
	.ga li[data-state='stale'],
	.ga li[data-state='unknown'] {
		color: var(--warning, var(--text-primary));
	}
</style>
