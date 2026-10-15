<script lang="ts">
	import { onMount } from 'svelte';
	import { buildChart } from '$lib/utils/chart';
	import { AIR_QUALITY, type OutdoorsView } from '$lib/dashboard/outdoors';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import CardSource from './CardSource.svelte';

	let { view, now, onopen }: { view: OutdoorsView; now: number; onopen: () => void } = $props();

	// Section.svelte mounts this body only while the section is open: mounting is opening (§7).
	onMount(() => onopen());

	const H = 3_600_000;
	const W = 760;
	const TEMP = { width: W, height: 190, margins: { top: 22, right: 12, bottom: 22, left: 34 } };
	const RAIN = { height: 78, top: 6, bottom: 18, left: 34, right: 12 };
	const SMALL = { width: 320, height: 110, margins: { top: 8, right: 6, bottom: 18, left: 26 } };
	const clock = (ms: number) => formatAsOf(ms, ms).replace(':00', '');

	const temp = $derived(view.forecast.temp);
	/** Only forecast hours with a temperature are drawn; a gap is named in the meta line. */
	const tempKnown = $derived(temp?.hours.filter((h) => h.f !== null) ?? []);
	const tempMissing = $derived((temp?.hours.length ?? 0) - tempKnown.length);
	const tempChart = $derived(
		buildChart({
			...TEMP,
			accentColor: '#ef4444',
			data: tempKnown.map((h) => ({ value: h.f as number, label: clock(h.atMs) }))
		})
	);
	const xOfTime = (atMs: number) => {
		if (!tempChart || tempKnown.length < 2) return null;
		const i = (atMs - tempKnown[0].atMs) / H;
		return i < 0 || i > tempKnown.length - 1 ? null : tempChart.xScale(i);
	};
	const tempMark = (p: { f: number; atMs: number } | null) =>
		tempChart && p
			? { x: xOfTime(p.atMs) ?? 0, y: tempChart.yScale(p.f), f: p.f, atMs: p.atMs }
			: null;
	const highMark = $derived(tempMark(temp?.high ?? null));
	const lowMark = $derived(tempMark(temp?.low ?? null));
	const nowX = $derived(xOfTime(now));
	const tempTicks = $derived(tempKnown.flatMap((h, i) => (i % 3 === 0 ? [{ i, h }] : [])));

	const rain = $derived(view.forecast.rain);
	const rainInnerW = W - RAIN.left - RAIN.right;
	const rainInnerH = RAIN.height - RAIN.top - RAIN.bottom;
	const rainStep = $derived(rain && rain.bars.length ? rainInnerW / rain.bars.length : 0);
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
			<h3 class="card-title" data-text-role="label">
				Next 24 hours{view.forecast.scope
					? ` · ${view.forecast.scope.replace(/ forecast$/, '')}`
					: ''}
			</h3>
			{#if temp?.high && temp.low}
				<span class="meta" data-text-role="meta"
					>{temp.low.f}–{temp.high.f}° · high {clock(temp.high.atMs)}{tempMissing
						? ` · ${tempMissing} h without a temperature`
						: ''}</span
				>
			{/if}
		</div>
		{#if tempChart && highMark && lowMark}
			<svg
				class="chart"
				data-text-role="meta"
				viewBox="0 0 {TEMP.width} {TEMP.height}"
				role="img"
				aria-label="Temperature, next 24 hours: low {lowMark.f}°, high {highMark.f}°"
			>
				<defs>
					<linearGradient id="out-temp-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stop-color="#ef4444" stop-opacity="0.32" />
						<stop offset="1" stop-color="#f59e0b" stop-opacity="0" />
					</linearGradient>
				</defs>
				<g transform="translate({TEMP.margins.left},{TEMP.margins.top})">
					<path d={tempChart.areaPath} fill="url(#out-temp-fill)" />
					<path d={tempChart.linePath} fill="none" stroke="#f59e0b" stroke-width="2.4" />
					{#if nowX !== null}
						<line class="now" x1={nowX} x2={nowX} y1="-8" y2={TEMP.height - 40} />
					{/if}
					<circle cx={highMark.x} cy={highMark.y} r="3" fill="#ef4444" />
					<text x={highMark.x} y={highMark.y - 8} text-anchor="middle"
						>{highMark.f}° {clock(highMark.atMs)}</text
					>
					<circle cx={lowMark.x} cy={lowMark.y} r="3" fill="#f59e0b" />
					<text x={lowMark.x} y={lowMark.y + 16} text-anchor="middle">{lowMark.f}°</text>
					{#each tempTicks as t (t.i)}
						<text x={tempChart.xScale(t.i)} y={TEMP.height - 30} text-anchor="middle"
							>{clock(t.h.atMs)}</text
						>
					{/each}
				</g>
			</svg>
		{:else}
			<p class="empty" data-text-role="body">No hourly temperatures to chart.</p>
		{/if}

		{#if rain}
			<div class="card-head">
				<h4 class="card-title" data-text-role="label">Chance of rain, hourly</h4>
				<span class="meta" data-text-role="meta" data-rain-meta>{rain.meta}</span>
			</div>
			<svg
				class="chart"
				data-text-role="meta"
				viewBox="0 0 {W} {RAIN.height}"
				role="img"
				aria-label="Chance of rain by hour: {rain.meta}"
			>
				<g transform="translate({RAIN.left},{RAIN.top})">
					<line class="grid" x1="0" x2={rainInnerW} y1={rainInnerH / 2} y2={rainInnerH / 2} />
					<text x="-6" y={rainInnerH / 2 + 4} text-anchor="end">50%</text>
					{#each rain.bars as pop, i (i)}
						{#if pop !== null}
							{@const h = Math.max(2, (pop / 100) * rainInnerH)}
							<rect
								x={i * rainStep + 1.5}
								y={rainInnerH - h}
								width={Math.max(1, rainStep - 3)}
								height={h}
								fill="#3b82f6"
							/>
						{/if}
					{/each}
				</g>
			</svg>
		{/if}

		{#if temp?.high && temp.low}
			<div class="stats">
				<div class="stat">
					<div class="k" data-text-role="meta">Temp range</div>
					<div class="v" data-text-role="value">{temp.low.f}–{temp.high.f}°</div>
					<div class="s" data-text-role="meta">next 24 h</div>
				</div>
				<div class="stat">
					<div class="k" data-text-role="meta">Peak rain</div>
					<div class="v" data-text-role="value">
						{Number.isFinite(peakRain) ? `${peakRain}%` : '—'}
					</div>
					<div class="s" data-text-role="meta">{peakRain === 0 ? 'dry all day' : 'next 24 h'}</div>
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
					aria-label="Predicted tide height, 48 hours"
				>
					<g transform="translate({SMALL.margins.left},{SMALL.margins.top})">
						<path d={tideChart.areaPath} fill="#14b8a6" fill-opacity="0.18" />
						<path d={tideChart.linePath} fill="none" stroke="#14b8a6" stroke-width="1.8" />
						{#if tideNowX !== null}
							<line class="now" x1={tideNowX} x2={tideNowX} y1="0" y2={SMALL.height - 26} />
						{/if}
						{#each tideDots as d (d.key)}
							<circle cx={d.x} cy={d.y} r="2.6" fill="#14b8a6" />
						{/each}
					</g>
				</svg>
			{/if}
			{#if view.tides.next.length}
				<p class="meta" data-text-role="meta">
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
				Wave height, next 48 h{surf.current?.directionDeg != null
					? ` · from ${Math.round(surf.current.directionDeg)}°`
					: ''}
			</p>
			<CardSource lines={[{ measured: view.surf.measured, verb: 'checked' }]} {now} />
		</article>

		<article class="card" data-card="ground">
			<h3 class="card-title" data-text-role="label">Air, fire & ground</h3>
			<ul class="rows" data-text-role="label">
				<li data-row="air">
					<span>Air quality</span><span class="muted"
						>{AIR_QUALITY.value} · {AIR_QUALITY.detail}</span
					>
				</li>
				<li data-row="wildfire">
					<span>Wildfire</span><span class:ok={view.ground.wildfire.value === 'None near'}
						>{view.ground.wildfire.value}</span
					>
					{#if view.ground.wildfire.detail}
						<span class="meta wide" data-text-role="meta">{view.ground.wildfire.detail}</span>
					{/if}
				</li>
				<li data-row="quakes">
					<span>Earthquakes, 7 d</span><span>{view.ground.quake.value}</span>
					{#if view.ground.quake.detail}
						<span class="meta wide" data-text-role="meta">{view.ground.quake.detail}</span>
					{/if}
				</li>
			</ul>
			<CardSource
				lines={[{ measured: view.ground.fires, verb: 'checked' }, { measured: view.ground.quakes }]}
				{now}
			/>
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
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2px 10px;
		padding: 7px 0;
		border-bottom: 1px solid var(--border);
	}
	.rows li:last-child {
		border-bottom: 0;
	}
	.rows li > span:first-child {
		white-space: nowrap;
	}
	.rows .wide {
		grid-column: 1 / -1;
	}
	.ok {
		color: var(--green, #10b981);
	}
</style>
