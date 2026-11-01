<script lang="ts">
	import { onMount } from 'svelte';
	import { barGeometry, buildChart } from '$lib/utils/chart';
	import type { OutdoorsView } from '$lib/dashboard/outdoors';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import { provenance, type SourceLine } from '$lib/dashboard/provenance';
	import { staticRow } from '$lib/dashboard/status-row';
	import CardSource from './CardSource.svelte';
	import { OBSERVATION_PLACE } from '$lib/weather/brief';
	import StatusRow from './StatusRow.svelte';
	import WeatherColumns from './WeatherColumns.svelte';

	let { view, now, onopen }: { view: OutdoorsView; now: number; onopen: () => void } = $props();

	// Section.svelte mounts this body only while the section is open: mounting is opening (§7).
	onMount(() => onopen());

	const W = 760;
	const RAIN = { height: 78, top: 6, bottom: 18, left: 34, right: 12 };
	const SMALL = { width: 320, height: 110, margins: { top: 8, right: 6, bottom: 18, left: 46 } };
	const clock = (ms: number) => formatAsOf(ms, ms).replace(':00', '');

	const temp = $derived(view.forecast.temp);
	const cols = $derived(view.forecast.columns);

	const rain = $derived(view.forecast.rain);
	const rainInnerW = W - RAIN.left - RAIN.right;
	const rainInnerH = RAIN.height - RAIN.top - RAIN.bottom;
	const rainBars = $derived(
		rain ? barGeometry(rain.bars, { width: rainInnerW, height: rainInnerH, max: 100 }) : []
	);
	const issuedAt = $derived(
		view.forecast.measured.kind === 'value' ? view.forecast.measured.observedAt : null
	);
	const peakRain = $derived(
		rain ? Math.max(...rain.bars.filter((b): b is number => b !== null), -Infinity) : -Infinity
	);

	const days = $derived(view.forecast.days);
	const dayHi = $derived(days.length ? Math.max(...days.map((d) => d.hi)) : 0);
	const dayLo = $derived(days.length ? Math.min(...days.map((d) => d.lo)) : 0);
	const warmest = $derived(days.length ? days.reduce((a, d) => (d.hi > a.hi ? d : a)) : null);
	const span = (v: number) => (dayHi === dayLo ? 0 : ((dayHi - v) / (dayHi - dayLo)) * 64);

	const tideStep = $derived(
		view.tides.curve.length > 1 ? view.tides.curve[1].atMs - view.tides.curve[0].atMs : 0
	);
	const tideChart = $derived(
		buildChart({
			...SMALL,
			accentColor: '#14b8a6',
			data: view.tides.curve.map((p) => ({ value: p.ft }))
		})
	);
	const tideX = (atMs: number) => {
		const c = view.tides.curve;
		if (!tideChart || !tideStep || atMs < c[0].atMs || atMs > c[c.length - 1].atMs) return null;
		return tideChart.xScale((atMs - c[0].atMs) / tideStep);
	};
	const tideDots = $derived(
		tideChart && view.tides.measured.kind === 'value'
			? view.tides.measured.value.flatMap((e) => {
					const x = tideX(e.atMs);
					return x === null ? [] : [{ x, y: tideChart.yScale(e.heightFt), key: e.atMs }];
				})
			: []
	);
	const tideNowX = $derived(tideX(now));
	/** The curve's own ends, not the padded domain's, so the labels are real heights. */
	const tideEnds = $derived.by(() => {
		const ft = view.tides.curve.map((p) => p.ft);
		return ft.length ? [Math.max(...ft), Math.min(...ft)] : [];
	});

	const airReading = $derived(view.ground.air.kind === 'value' ? view.ground.air.value : null);
	/** A row's own source: its time, or just its name when the row's detail already says why not. */
	const sourceOf = (line: SourceLine) =>
		line.measured.kind === 'unknown' || line.measured.kind === 'unavailable'
			? { text: line.measured.source, attention: false }
			: provenance(line, now);
	const NOT_A_READING = new Set(['Unavailable', 'Unknown']);
	const groundRows = $derived([
		staticRow({
			id: 'air',
			label: 'Air quality',
			body: view.ground.airRow.value,
			bodyAttention: NOT_A_READING.has(view.ground.airRow.value),
			swatch: airReading?.color ?? null,
			meta: [view.ground.airRow.detail, sourceOf({ measured: view.ground.air })]
		}),
		staticRow({
			id: 'wildfire',
			label: 'Wildfire',
			body: view.ground.wildfire.value,
			bodyAttention: NOT_A_READING.has(view.ground.wildfire.value),
			meta: [
				view.ground.wildfire.detail,
				sourceOf({ measured: view.ground.fires, verb: 'checked' })
			]
		}),
		staticRow({
			id: 'quakes',
			label: 'Earthquakes, 7 d',
			body: view.ground.quake.value,
			bodyAttention: NOT_A_READING.has(view.ground.quake.value),
			meta: [view.ground.quake.detail, sourceOf({ measured: view.ground.quakes })]
		})
	]);

	const surf = $derived(view.surf.view);
	const surfKnown = $derived(surf.heights.filter((h): h is number => h !== null));
	const surfChart = $derived(
		buildChart({
			width: SMALL.width,
			height: 64,
			margins: { top: 4, right: 4, bottom: 4, left: 4 },
			accentColor: '#3b82f6',
			data: surfKnown.map((value) => ({ value }))
		})
	);
</script>

<div class="out" data-slot="outdoors">
	<article class="card" data-card="forecast">
		<div class="card-head">
			<h3 class="card-title" data-text-role="label">Next 24 hours · {OBSERVATION_PLACE}</h3>
			{#if temp?.high && temp.low}
				<span class="meta" data-text-role="meta"
					>{temp.low.f}–{temp.high.f}° · high {clock(temp.high.atMs)}</span
				>
			{/if}
		</div>
		{#if cols.length}
			<WeatherColumns
				{cols}
				resetKey={view.forecast.stationKey}
				label="Temperature, 4 hours observed, now, then 24 hours forecast"
			/>
			<p class="meta" data-text-role="meta" data-station-note>
				{view.forecast.stationNote ??
					`NWS forecast for this spot${view.forecast.stationIssuedAt !== null ? ` · issued ${formatAsOf(view.forecast.stationIssuedAt, now)}` : ''}`}
			</p>
		{:else}
			<p class="empty" data-text-role="body">
				{view.forecast.stationState === 'loading'
					? 'Loading the hours…'
					: 'Hourly readings unavailable'}
			</p>
		{/if}

		{#if rain}
			<div class="card-head">
				<h4 class="card-title" data-text-role="label">
					Chance of rain, hourly{view.forecast.scope
						? ` · ${view.forecast.scope.replace(/ forecast$/, '')}`
						: ''}
				</h4>
				{#if !rain.allDry}
					<span class="meta" data-text-role="meta" data-rain-meta>{rain.meta}</span>
				{/if}
			</div>
			{#if rain.allDry}
				<p class="meta" data-text-role="body" data-rain-dry>
					No rain expected in the next 24 h (peak {peakRain}%){issuedAt !== null
						? ` · NWS, issued ${formatAsOf(issuedAt, now)}`
						: ''}
				</p>
			{:else}
				<svg
					class="chart"
					data-chart="rain"
					data-text-role="meta"
					viewBox="0 0 {W} {RAIN.height}"
					role="img"
					aria-label="Chance of rain by hour: {rain.meta}"
				>
					<g transform="translate({RAIN.left},{RAIN.top})">
						{#each [100, 50] as pct (pct)}
							{@const y = rainInnerH * (1 - pct / 100)}
							<line class="grid" x1="0" x2={rainInnerW} y1={y} y2={y} />
							<text x="-6" y={y + 4} text-anchor="end">{pct}%</text>
						{/each}
						<line
							class="base"
							data-baseline
							x1="0"
							x2={rainInnerW}
							y1={rainInnerH}
							y2={rainInnerH}
						/>
						<text x="-6" y={rainInnerH + 4} text-anchor="end">0%</text>
						{#each rainBars as bar, i (i)}
							{#if bar}
								<rect x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill="#3b82f6" />
							{/if}
						{/each}
					</g>
				</svg>
			{/if}
		{/if}

		{#if temp?.high || rain || days.length}
			<div class="stats">
				<div class="stat">
					<div class="k" data-text-role="meta">Temp range</div>
					<div class="v" data-text-role="value">
						{temp?.high && temp.low ? `${temp.low.f}–${temp.high.f}°` : '—'}
					</div>
					<div class="s" data-text-role="meta">next 24 h</div>
				</div>
				<div class="stat">
					<div class="k" data-text-role="meta">Peak rain</div>
					<div class="v" data-text-role="value">
						{Number.isFinite(peakRain) ? `${peakRain}%` : '—'}
					</div>
					<div class="s" data-text-role="meta">{rain?.allDry ? 'dry all day' : 'next 24 h'}</div>
				</div>
				{#if warmest}
					<div class="stat">
						<div class="k" data-text-role="meta">Warmest day</div>
						<div class="v" data-text-role="value">{warmest.hi}°</div>
						<div class="s" data-text-role="meta">{warmest.name}</div>
					</div>
				{/if}
			</div>
		{/if}

		{#if days.length}
			<ol
				class="days"
				data-text-role="label"
				style="--n:{days.length}"
				aria-label="Daily high and low"
			>
				{#each days as d (d.date)}
					<li class="day" data-day={d.date}>
						<span class="dim" data-text-role="meta">{d.name}</span>
						<span class="rail"><i style="top:{span(d.hi)}px;bottom:{64 - span(d.lo)}px"></i></span>
						<b>{d.hi}°</b>
						<span class="muted">{d.lo}°</span>
					</li>
				{/each}
			</ol>
		{/if}
		<CardSource lines={[{ measured: view.forecast.measured, verb: 'issued' }]} {now} />
	</article>

	<div class="g3">
		<article class="card" data-card="tides">
			<h3 class="card-title" data-text-role="label">
				Tides{view.tides.station ? ` · ${view.tides.station}` : ''}
			</h3>
			{#if tideChart}
				<svg
					class="chart"
					data-text-role="meta"
					viewBox="0 0 {SMALL.width} {SMALL.height}"
					role="img"
					aria-label="Predicted tide height, 48 hours{tideEnds.length
						? `, ${tideEnds[1].toFixed(1)} to ${tideEnds[0].toFixed(1)} ft`
						: ''}"
				>
					<g transform="translate({SMALL.margins.left},{SMALL.margins.top})">
						<path d={tideChart.areaPath} fill="#14b8a6" fill-opacity="0.18" />
						<path d={tideChart.linePath} fill="none" stroke="#14b8a6" stroke-width="1.8" />
						{#if tideNowX !== null}
							<line class="now" x1={tideNowX} x2={tideNowX} y1="0" y2={SMALL.height - 26} />
						{/if}
						{#each tideEnds as ft, i (i)}
							<text x="-6" y={tideChart.yScale(ft) + (i ? 0 : 10)} text-anchor="end"
								>{ft.toFixed(1)} ft</text
							>
						{/each}
						{#each tideDots as d (d.key)}
							<circle cx={d.x} cy={d.y} r="2.6" fill="#14b8a6" />
						{/each}
					</g>
				</svg>
			{/if}
			{#if view.tides.next.length}
				<!-- Rule 1's named exception (Stuart, 2026-10-28): the tide extremes stay today's one
				     line, figures and times together in meta, not split into figure + meta spans. -->
				<p class="meta" data-tide-line data-text-role="meta">
					{view.tides.next
						.map(
							(e) => `${e.type === 'H' ? 'Hi' : 'Lo'} ${e.heightFt.toFixed(1)}′ ${clock(e.atMs)}`
						)
						.join(' · ')}
				</p>
			{/if}
			<CardSource
				lines={[{ measured: view.tides.measured, untimed: 'astronomical prediction' }]}
				{now}
			/>
		</article>

		<article class="card" data-card="surf">
			<h3 class="card-title" data-text-role="label">Surf · Point Reyes</h3>
			{#if surf.current}
				<p class="value" data-text-role="value">
					{surf.current.waveFt.toFixed(1)} ft{surf.current.periodS !== null
						? ` @ ${Math.round(surf.current.periodS)} s`
						: ''}
				</p>
			{:else}
				<p class="muted" data-text-role="body">No wave height this hour</p>
			{/if}
			{#if surfChart}
				<svg
					class="chart"
					data-text-role="meta"
					viewBox="0 0 {SMALL.width} 64"
					role="img"
					aria-label="Wave height, 48 hours"
				>
					<g transform="translate(4,4)">
						<path d={surfChart.areaPath} fill="#3b82f6" fill-opacity="0.15" />
						<path d={surfChart.linePath} fill="none" stroke="#3b82f6" stroke-width="1.6" />
					</g>
				</svg>
			{/if}
			<p class="meta" data-text-role="meta">
				Wave height, next 48 h{surfKnown.length
					? ` · ${Math.min(...surfKnown).toFixed(1)}–${Math.max(...surfKnown).toFixed(1)} ft`
					: ''}{surf.current?.directionDeg != null
					? ` · from ${Math.round(surf.current.directionDeg)}°`
					: ''}
			</p>
			<CardSource lines={[{ measured: view.surf.measured, verb: 'checked' }]} {now} />
		</article>

		<article class="card" data-card="ground">
			<h3 class="card-title" data-text-role="label">Air, fire & ground</h3>
			<!-- Three sources, so each row carries its own (rule 3); the shared footer is gone. -->
			<ul class="rows">
				{#each groundRows as row (row.id)}<li data-row={row.id}><StatusRow {row} /></li>{/each}
			</ul>
		</article>
	</div>
</div>

<style>
	/* The approved mockup's cards and chart forms (desktop-v2-mockup.html). */
	.out {
		display: flex;
		flex-direction: column;
		gap: var(--v2-gap, 14px);
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
	.card-title {
		margin: 0;
		color: var(--text-muted);
		font-weight: 400;
	}
	.meta,
	.muted,
	.dim,
	.empty {
		margin: 0;
		color: var(--text-muted);
	}
	.value {
		margin: 0;
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
	.chart .now {
		stroke: var(--text-muted);
		stroke-dasharray: 3 3;
	}
	.chart .grid {
		stroke: var(--border);
	}
	.chart .base {
		stroke: var(--text-muted);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
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
	.days {
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: 6px;
		margin: 4px 0 0;
		padding: 0;
		list-style: none;
		text-align: center;
	}
	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.rail {
		position: relative;
		width: 8px;
		height: 64px;
		margin: 4px auto;
		border-radius: 4px;
		background: var(--surface-2, var(--border));
	}
	.rail i {
		position: absolute;
		left: 0;
		right: 0;
		border-radius: 4px;
		background: linear-gradient(#ef4444, #f59e0b);
	}
	.g3 {
		display: grid;
		gap: var(--v2-gap, 14px);
	}
	@media (min-width: 768px) {
		.g3 {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rows li {
		padding: var(--v2-s1) 0;
		border-bottom: 1px solid var(--border);
	}
	.rows li:last-child {
		border-bottom: 0;
	}
</style>
