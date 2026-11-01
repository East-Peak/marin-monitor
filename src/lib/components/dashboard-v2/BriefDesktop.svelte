<script lang="ts">
	import type { BriefCard, BriefState } from '$lib/dashboard/brief-store';
	import {
		stationColumns,
		stationKey,
		TILE_HOURS_AHEAD,
		tideDay
	} from '$lib/dashboard/brief-desktop';
	import type { CardItem } from '$lib/dashboard/getting-around';
	import type { OutdoorsView } from '$lib/dashboard/outdoors';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import { effectiveState, type SourceEntryState } from '$lib/dashboard/source-status';
	import { buildChart } from '$lib/utils/chart';
	import { nextTide, OBSERVATION_PLACE, restOfTodayRainChance } from '$lib/weather/brief';
	import { stamp } from '$lib/dashboard/chart-readout';
	import { heightStops, seriesStops, startAt } from '$lib/dashboard/chart-stops';
	import CardSource from './CardSource.svelte';
	import ChartReadout from './ChartReadout.svelte';
	import WeatherColumns from './WeatherColumns.svelte';

	/**
	 * The desktop brief (MAPX1; desktop-v2-mockup.html `.brief`, 5fr 4fr 3fr): weather as one
	 * grid of hours at Gnoss Field, today's NOAA tide curve, and the ocean. The phone
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
	/** The tile's forecast is the station's own grid point; another place's never stands in. */
	const forecast = $derived(brief.stationForecast);
	const observedState = $derived(stateOf(observed));
	const rain = $derived(forecast.value ? restOfTodayRainChance(forecast.value.periods, now) : null);
	const settled = $derived(brief.history.state !== 'loading' && forecast.state !== 'loading');
	const nothing = $derived(!brief.history.value && !forecast.value);
	const cols = $derived(settled ? stationColumns(brief, now, TILE_HOURS_AHEAD) : []);

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

	const tideStops = $derived(
		day && tideChart
			? heightStops(day.points, day.events, (ft) => (16 + tideChart.yScale(ft)) / TIDE_H, now, {
					hourly: stateOf(brief.tideHourly) === 'stale',
					events: stateOf(brief.tides) === 'stale'
				})
			: []
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
	const waves = $derived(ocean.view.series.slice(0, 24));
	const waveDomain = $derived<[number, number]>([waves[0]?.at ?? 0, waves.at(-1)?.at ?? 1]);
	const sparkChart = $derived(
		buildChart({
			width: sparkW || 200,
			height: SPARK_H,
			margins: { top: 2, right: 2, bottom: 2, left: 2 },
			accentColor: '#3b82f6',
			xDomain: waveDomain,
			data: waves.map((r) => ({ x: r.at, value: r.value ?? Number.NaN }))
		})
	);
	const waveStops = $derived(
		sparkChart
			? seriesStops(waves, {
					y: (ft) => (2 + sparkChart.yScale(ft)) / SPARK_H,
					when: (ms) => stamp(ms, now),
					format: (v) => `${v.toFixed(1)} ft`,
					stale: oceanState === 'stale'
				})
			: []
	);
</script>

<section class="brief" data-slot="brief" aria-label="Morning brief">
	<article class="card" data-card="weather" data-state={observedState}>
		<div class="head">
			<h3 class="title" data-text-role="label">Weather · {OBSERVATION_PLACE}</h3>
		</div>
		<div class="now-line">
			{#if observed.value}
				<p class="hero" data-text-role="value">
					{observed.value.tempF === null ? 'Temperature unknown' : `${observed.value.tempF}°F`}
				</p>
				<p class="muted" data-text-role="meta">
					Observed {formatAsOf(observed.value.observedAt, now)}{observedState === 'stale'
						? ' · out of date'
						: ''}
				</p>
			{:else if observedState === 'loading'}
				<p class="muted" data-text-role="meta">Loading observation…</p>
			{:else}
				<p class="muted" data-text-role="meta">Observation unavailable</p>
			{/if}
		</div>
		<div class="hours">
			{#if !settled}
				<p class="muted" data-text-role="meta">Loading the hours…</p>
			{:else if nothing}
				<p class="muted" data-text-role="meta">Hourly readings unavailable</p>
			{:else}
				<WeatherColumns
					{cols}
					resetKey={stationKey(brief)}
					label="Temperature, 4 hours observed, now, then {TILE_HOURS_AHEAD} hours forecast"
				/>
				{#if stateOf(brief.history) === 'stale'}
					<p class="muted" data-text-role="meta">Station readings out of date</p>
				{/if}
			{/if}
		</div>
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
					NWS forecast for this spot{forecast.observedAt !== null
						? ` · issued ${formatAsOf(forecast.observedAt, now)}`
						: ' · issue time unknown'}{stateOf(forecast) === 'stale' ? ' · out of date' : ''}
				</p>
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
				<ChartReadout
					label="Today's tide, NOAA hourly prediction"
					stops={tideStops}
					plot={{ domain: day.domain, left: 8, right: (tideW || 280) - 8, width: tideW || 280 }}
					start={startAt(tideStops, now)}
					color="#14b8a6"
					resetKey={brief.tides.scope ?? ''}
				>
					<svg
						data-chart="tide"
						data-text-role="meta"
						viewBox="0 0 {tideW || 280} {TIDE_H}"
						style:height="{TIDE_H}px"
						aria-hidden="true"
					>
						<g transform="translate(8,16)">
							<path d={tideChart.areaPath} fill="#14b8a6" fill-opacity="0.15" />
							<path
								data-line
								d={tideChart.linePath}
								fill="none"
								stroke="#14b8a6"
								stroke-width="2"
							/>
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
				</ChartReadout>
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
						<ChartReadout
							label="Wave height, next 24 hours"
							stops={waveStops}
							plot={{
								domain: waveDomain,
								left: 2,
								right: (sparkW || 200) - 2,
								width: sparkW || 200
							}}
							start={0}
							color="#3b82f6"
						>
							<svg
								viewBox="0 0 {sparkW || 200} {SPARK_H}"
								style:height="{SPARK_H}px"
								aria-hidden="true"
							>
								<g transform="translate(2,2)">
									<path d={sparkChart.linePath} fill="none" stroke="#3b82f6" stroke-width="1.6" />
								</g>
							</svg>
						</ChartReadout>
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
	.now-line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 0.75rem;
	}
	.hours {
		min-width: 0;
		min-height: 130px;
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
