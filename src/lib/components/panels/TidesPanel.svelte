<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchTidePredictions, fetchHourlyTides } from '$lib/api/marin/tides';
	import {
		fetchMarineHourly,
		fetchMarineSnapshot,
		type MarineHourlyPoint,
		type MarineSnapshot
	} from '$lib/api/marin/marine';
	import { fetchHourlyForecast, type HourlyPeriod } from '$lib/api/marin/nws-hourly';
	import type { TidePrediction } from '$lib/types';
	import { select } from 'd3-selection';
	import type { Selection } from 'd3-selection';
	import { scaleLinear } from 'd3-scale';
	import type { ScaleLinear } from 'd3-scale';
	import { area, line, curveBasis } from 'd3-shape';

	interface Props {
		tideStation?: string;
		tideStationName?: string;
		locationLat?: number;
		locationLon?: number;
	}

	let { tideStation, tideStationName = 'Point Reyes', locationLat, locationLon }: Props = $props();

	type CoastalPoint = {
		time: Date;
		tideHeight: number | null;
		waveHeight: number | null;
		windSpeed: number | null;
		windDirection: string;
	};

	type HoverChart = 'wave' | 'wind' | 'tide';
	type HoverState = {
		chart: HoverChart;
		index: number;
		x: number;
	};

	const CHART_LEFT = 42;
	const CHART_RIGHT = 4;

	let tidePredictions = $state<TidePrediction[]>([]);
	let hourlyTides = $state<{ time: string; height: number }[]>([]);
	let hourlyMarine = $state<MarineHourlyPoint[]>([]);
	let hourlyWeather = $state<HourlyPeriod[]>([]);
	let marineSnapshot = $state<MarineSnapshot | null>(null);
	let coastalPoints = $state<CoastalPoint[]>([]);
	let waveSvg = $state<SVGSVGElement>(undefined!);
	let windSvg = $state<SVGSVGElement>(undefined!);
	let tideSvg = $state<SVGSVGElement>(undefined!);
	let hoverState = $state<HoverState | null>(null);
	let loading = $state(true);

	function formatTideTime(t: string): string {
		const parts = t.split(' ');
		if (parts.length < 2) return t;
		const [hStr, mStr] = parts[1].split(':');
		const h = parseInt(hStr, 10);
		const ampm = h >= 12 ? 'p' : 'a';
		const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
		return `${h12}:${mStr}${ampm}`;
	}

	function formatHourLabel(date: Date): string {
		const h = date.getHours();
		if (h === 0) return '12a';
		if (h === 12) return '12p';
		return h > 12 ? `${h - 12}p` : `${h}a`;
	}

	function noaaToDate(value: string): Date {
		const [datePart, timePart] = value.split(' ');
		return new Date(`${datePart}T${timePart}:00`);
	}

	function hourKeyFromDate(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
			date.getDate()
		).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}`;
	}

	function hourKeyFromNoaa(value: string): string {
		return hourKeyFromDate(noaaToDate(value));
	}

	function hourKeyFromIso(value: string): string {
		return hourKeyFromDate(new Date(value));
	}

	function parseWindSpeed(value: string): number | null {
		const matches = value.match(/\d+/g);
		if (!matches || matches.length === 0) return null;
		const nums = matches.map((part) => Number(part));
		return nums.reduce((sum, num) => sum + num, 0) / nums.length;
	}

	function formatTooltipTime(date: Date): string {
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function dirToCompass(deg: number | null): string {
		if (deg === null) return 'N/A';
		const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
		const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
		return `${dirs[idx]} ${Math.round(deg)}°`;
	}

	function fmt(value: number | null, suffix: string): string {
		return value === null ? 'N/A' : `${value.toFixed(1)}${suffix}`;
	}

	function buildCoastalPoints() {
		const tideMap = new Map(
			hourlyTides.map((entry) => [hourKeyFromNoaa(entry.time), entry.height])
		);
		const marineMap = new Map(hourlyMarine.map((entry) => [hourKeyFromIso(entry.time), entry]));
		const weatherMap = new Map(
			hourlyWeather.map((entry) => [hourKeyFromIso(entry.startTime), entry])
		);

		coastalPoints = hourlyTides.slice(0, 24).map((entry) => {
			const time = noaaToDate(entry.time);
			const key = hourKeyFromDate(time);
			const marine = marineMap.get(key);
			const weather = weatherMap.get(key);
			return {
				time,
				tideHeight: tideMap.get(key) ?? null,
				waveHeight: marine?.waveHeight ?? null,
				windSpeed: weather ? parseWindSpeed(weather.windSpeed) : null,
				windDirection: weather?.windDirection ?? 'N/A'
			};
		});
	}

	function handleHover(event: PointerEvent, chart: HoverChart) {
		if (coastalPoints.length === 0) return;
		const target = event.currentTarget as SVGSVGElement;
		const rect = target.getBoundingClientRect();
		const innerWidth = rect.width - CHART_LEFT - CHART_RIGHT;
		const relativeX = Math.max(0, Math.min(innerWidth, event.clientX - rect.left - CHART_LEFT));
		const ratio = innerWidth <= 0 ? 0 : relativeX / innerWidth;
		const index = Math.max(
			0,
			Math.min(coastalPoints.length - 1, Math.round(ratio * (coastalPoints.length - 1)))
		);
		const pointX = CHART_LEFT + (innerWidth * index) / Math.max(coastalPoints.length - 1, 1);
		hoverState = { chart, index, x: pointX };
	}

	function clearHover() {
		hoverState = null;
	}

	function drawSharedXAxis(
		g: Selection<SVGGElement, unknown, null, undefined>,
		x: ScaleLinear<number, number>,
		innerH: number,
		points: CoastalPoint[],
		withDirection: boolean = false
	) {
		for (let i = 0; i < points.length; i += 4) {
			g.append('text')
				.attr('x', x(i))
				.attr('y', innerH + 12)
				.attr('text-anchor', 'middle')
				.attr('fill', '#666')
				.attr('font-size', '7px')
				.text(formatHourLabel(points[i].time));

			if (withDirection) {
				g.append('text')
					.attr('x', x(i))
					.attr('y', innerH + 24)
					.attr('text-anchor', 'middle')
					.attr('fill', '#7d7d7d')
					.attr('font-size', '7px')
					.text(points[i].windDirection);
			}
		}
	}

	function drawHoverGuide(
		g: Selection<SVGGElement, unknown, null, undefined>,
		x: ScaleLinear<number, number>,
		innerH: number
	) {
		if (!hoverState) return;
		g.append('line')
			.attr('x1', x(hoverState.index))
			.attr('x2', x(hoverState.index))
			.attr('y1', 0)
			.attr('y2', innerH)
			.attr('stroke', 'rgba(255,255,255,0.35)')
			.attr('stroke-width', 1)
			.attr('stroke-dasharray', '3,3');
	}

	function drawWaveChart() {
		if (!waveSvg || coastalPoints.length === 0) return;
		const waveValues = coastalPoints.map((point) => point.waveHeight ?? 0);
		const svg = select(waveSvg);
		svg.selectAll('*').remove();

		const width = waveSvg.clientWidth;
		const height = 126;
		const margin = { top: 8, right: CHART_RIGHT, bottom: 18, left: CHART_LEFT };
		const innerW = width - margin.left - margin.right;
		const innerH = height - margin.top - margin.bottom;
		const maxWave = Math.max(2, ...waveValues.map((value) => value + 0.2));
		const barW = innerW / Math.max(coastalPoints.length, 1);

		const x = scaleLinear()
			.domain([0, coastalPoints.length - 1])
			.range([0, innerW]);
		const y = scaleLinear().domain([0, maxWave]).range([innerH, 0]);

		const g = svg
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		g.selectAll('rect')
			.data(waveValues)
			.enter()
			.append('rect')
			.attr('x', (_d, i) => x(i) - barW * 0.35)
			.attr('y', (d) => y(d))
			.attr('width', Math.max(6, barW * 0.7))
			.attr('height', (d) => innerH - y(d))
			.attr('rx', 2)
			.attr('fill', 'rgba(147, 197, 253, 0.75)');

		g.append('text')
			.attr('x', -4)
			.attr('y', y(maxWave))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '8px')
			.text(`${maxWave.toFixed(1)}'`);

		g.append('text')
			.attr('x', -4)
			.attr('y', y(0))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '8px')
			.text("0'");

		drawHoverGuide(g, x, innerH);
		drawSharedXAxis(g, x, innerH, coastalPoints);
	}

	function drawWindChart() {
		if (!windSvg || coastalPoints.length === 0) return;
		const windValues = coastalPoints.map((point) => point.windSpeed ?? 0);
		const svg = select(windSvg);
		svg.selectAll('*').remove();

		const width = windSvg.clientWidth;
		const height = 154;
		const margin = { top: 8, right: CHART_RIGHT, bottom: 42, left: CHART_LEFT };
		const innerW = width - margin.left - margin.right;
		const innerH = height - margin.top - margin.bottom;
		const maxWind = Math.max(6, ...windValues.map((value) => value + 1));
		const barW = innerW / Math.max(coastalPoints.length, 1);

		const x = scaleLinear()
			.domain([0, coastalPoints.length - 1])
			.range([0, innerW]);
		const y = scaleLinear().domain([0, maxWind]).range([innerH, 0]);

		const g = svg
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		g.selectAll('rect')
			.data(windValues)
			.enter()
			.append('rect')
			.attr('x', (_d, i) => x(i) - barW * 0.35)
			.attr('y', (d) => y(d))
			.attr('width', Math.max(6, barW * 0.7))
			.attr('height', (d) => innerH - y(d))
			.attr('rx', 2)
			.attr('fill', 'rgba(244, 114, 182, 0.75)');

		g.append('text')
			.attr('x', -4)
			.attr('y', y(maxWind))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '8px')
			.text(`${Math.round(maxWind)} mph`);

		g.append('text')
			.attr('x', -4)
			.attr('y', y(0))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '8px')
			.text('0');

		drawHoverGuide(g, x, innerH);
		drawSharedXAxis(g, x, innerH, coastalPoints, true);
	}

	function drawTideChart() {
		if (!tideSvg || coastalPoints.length === 0) return;
		const tideValues = coastalPoints.map((point) => point.tideHeight ?? 0);
		const svg = select(tideSvg);
		svg.selectAll('*').remove();

		const width = tideSvg.clientWidth;
		const height = 162;
		const margin = { top: 8, right: CHART_RIGHT, bottom: 18, left: CHART_LEFT };
		const innerW = width - margin.left - margin.right;
		const innerH = height - margin.top - margin.bottom;
		const yMin = Math.min(...tideValues) - 0.5;
		const yMax = Math.max(...tideValues) + 0.5;

		const x = scaleLinear()
			.domain([0, coastalPoints.length - 1])
			.range([0, innerW]);
		const y = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

		const g = svg
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', `translate(${margin.left},${margin.top})`);

		if (yMin < 0) {
			g.append('line')
				.attr('x1', 0)
				.attr('x2', innerW)
				.attr('y1', y(0))
				.attr('y2', y(0))
				.attr('stroke', '#333')
				.attr('stroke-dasharray', '2,2');
		}

		const areaGen = area<CoastalPoint>()
			.x((_d, i) => x(i))
			.y0(innerH)
			.y1((d) => y(d.tideHeight ?? 0))
			.curve(curveBasis);

		g.append('path').datum(coastalPoints).attr('d', areaGen).attr('fill', 'rgba(16, 185, 129, 0.1)');

		const lineGen = line<CoastalPoint>()
			.x((_d, i) => x(i))
			.y((d) => y(d.tideHeight ?? 0))
			.curve(curveBasis);

		g.append('path')
			.datum(coastalPoints)
			.attr('d', lineGen)
			.attr('fill', 'none')
			.attr('stroke', '#10b981')
			.attr('stroke-width', 1.5);

		g.append('text')
			.attr('x', -4)
			.attr('y', y(yMax))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '8px')
			.text(`${yMax.toFixed(1)}'`);

		g.append('text')
			.attr('x', -4)
			.attr('y', y(yMin))
			.attr('text-anchor', 'end')
			.attr('dominant-baseline', 'middle')
			.attr('fill', '#888')
			.attr('font-size', '8px')
			.text(`${yMin.toFixed(1)}'`);

		drawHoverGuide(g, x, innerH);
		drawSharedXAxis(g, x, innerH, coastalPoints);
	}

	onMount(() => {
		let resizeTimer: ReturnType<typeof setTimeout>;
		function handleResize() {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				if (coastalPoints.length > 0 && waveSvg) drawWaveChart();
				if (coastalPoints.length > 0 && windSvg) drawWindChart();
				if (coastalPoints.length > 0 && tideSvg) drawTideChart();
			}, 150);
		}

		window.addEventListener('resize', handleResize);

		void (async () => {
			const [predictions, tides, marine, weather, snapshot] = await Promise.allSettled([
				fetchTidePredictions(tideStation),
				fetchHourlyTides(tideStation),
				fetchMarineHourly(24),
				fetchHourlyForecast(locationLat, locationLon),
				fetchMarineSnapshot()
			]);

			if (predictions.status === 'fulfilled') tidePredictions = predictions.value;
			if (tides.status === 'fulfilled') hourlyTides = tides.value;
			if (marine.status === 'fulfilled') hourlyMarine = marine.value;
			if (weather.status === 'fulfilled') hourlyWeather = weather.value;
			if (snapshot.status === 'fulfilled') marineSnapshot = snapshot.value;
			buildCoastalPoints();
			loading = false;
		})();

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	$effect(() => {
		if (coastalPoints.length > 0 && waveSvg) drawWaveChart();
	});

	$effect(() => {
		if (coastalPoints.length > 0 && windSvg) drawWindChart();
	});

	$effect(() => {
		if (coastalPoints.length > 0 && tideSvg) drawTideChart();
	});
</script>

<Panel id="tides" title="Coastal Conditions · {tideStationName}" {loading}>
	{#if marineSnapshot}
		<div class="snapshot-meta">Current marine state · Point Reyes nearshore</div>
		<div class="snapshot-grid">
			<div class="snapshot-card">
				<div class="snapshot-label">Wave</div>
				<div class="snapshot-value">{fmt(marineSnapshot.waveHeight, ' ft')}</div>
			</div>
			<div class="snapshot-card">
				<div class="snapshot-label">Swell</div>
				<div class="snapshot-value">{fmt(marineSnapshot.swellHeight, ' ft')}</div>
			</div>
			<div class="snapshot-card">
				<div class="snapshot-label">Period</div>
				<div class="snapshot-value">{fmt(marineSnapshot.swellPeriod, ' s')}</div>
			</div>
			<div class="snapshot-card">
				<div class="snapshot-label">Direction</div>
				<div class="snapshot-value">{dirToCompass(marineSnapshot.swellDirection)}</div>
			</div>
		</div>
		<div class="snapshot-peak">
			<div class="snapshot-label">Next 12h Peak Swell</div>
			<div class="snapshot-value">
				{fmt(marineSnapshot.next12hMaxSwell, ' ft')} @ {dirToCompass(
					marineSnapshot.next12hPeakDirection
				)}
			</div>
		</div>
	{/if}

	{#if coastalPoints.length > 0}
		<div class="chart-section">
			<div class="section-label">Wave Height (24h)</div>
			<div class="chart-wrap">
				<svg
					class="chart-svg wave-svg"
					bind:this={waveSvg}
					onpointermove={(event) => handleHover(event, 'wave')}
					onpointerleave={clearHover}
				></svg>
				{#if hoverState?.chart === 'wave'}
					<div class="chart-tooltip" style={`left:${Math.max(16, hoverState.x - 58)}px`}>
						<div class="tooltip-time">
							{formatTooltipTime(coastalPoints[hoverState.index].time)}
						</div>
						<div class="tooltip-line">
							Wave {coastalPoints[hoverState.index].waveHeight?.toFixed(1) ?? 'N/A'} ft
						</div>
						<div class="tooltip-line">
							Wind {coastalPoints[hoverState.index].windSpeed?.toFixed(0) ?? 'N/A'} mph {coastalPoints[
								hoverState.index
							].windDirection}
						</div>
						<div class="tooltip-line">
							Tide {coastalPoints[hoverState.index].tideHeight?.toFixed(1) ?? 'N/A'}'
						</div>
					</div>
				{/if}
			</div>
		</div>

		<div class="chart-section">
			<div class="section-label">Wind (24h)</div>
			<div class="chart-wrap">
				<svg
					class="chart-svg wind-svg"
					bind:this={windSvg}
					onpointermove={(event) => handleHover(event, 'wind')}
					onpointerleave={clearHover}
				></svg>
				{#if hoverState?.chart === 'wind'}
					<div class="chart-tooltip" style={`left:${Math.max(16, hoverState.x - 58)}px`}>
						<div class="tooltip-time">
							{formatTooltipTime(coastalPoints[hoverState.index].time)}
						</div>
						<div class="tooltip-line">
							Wave {coastalPoints[hoverState.index].waveHeight?.toFixed(1) ?? 'N/A'} ft
						</div>
						<div class="tooltip-line">
							Wind {coastalPoints[hoverState.index].windSpeed?.toFixed(0) ?? 'N/A'} mph {coastalPoints[
								hoverState.index
							].windDirection}
						</div>
						<div class="tooltip-line">
							Tide {coastalPoints[hoverState.index].tideHeight?.toFixed(1) ?? 'N/A'}'
						</div>
					</div>
				{/if}
			</div>
		</div>

		<div class="chart-section chart-section-last">
			<div class="section-label">Tides (24h)</div>
			<div class="chart-wrap">
				<svg
					class="chart-svg tide-svg"
					bind:this={tideSvg}
					onpointermove={(event) => handleHover(event, 'tide')}
					onpointerleave={clearHover}
				></svg>
				{#if hoverState?.chart === 'tide'}
					<div class="chart-tooltip" style={`left:${Math.max(16, hoverState.x - 58)}px`}>
						<div class="tooltip-time">
							{formatTooltipTime(coastalPoints[hoverState.index].time)}
						</div>
						<div class="tooltip-line">
							Wave {coastalPoints[hoverState.index].waveHeight?.toFixed(1) ?? 'N/A'} ft
						</div>
						<div class="tooltip-line">
							Wind {coastalPoints[hoverState.index].windSpeed?.toFixed(0) ?? 'N/A'} mph {coastalPoints[
								hoverState.index
							].windDirection}
						</div>
						<div class="tooltip-line">
							Tide {coastalPoints[hoverState.index].tideHeight?.toFixed(1) ?? 'N/A'}'
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if tidePredictions.length > 0}
		<div class="tide-predictions">
			{#each tidePredictions.slice(0, 6) as tide}
				<div class="tide-item">
					<span class="tide-type" class:high={tide.type === 'H'} class:low={tide.type === 'L'}>
						{tide.type === 'H' ? 'HI' : 'LO'}
					</span>
					<span class="tide-height">{tide.height.toFixed(1)}'</span>
					<span class="tide-time">{formatTideTime(tide.time)}</span>
				</div>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.snapshot-meta {
		font-size: 0.55rem;
		color: var(--text-muted);
		margin-bottom: 0.42rem;
	}

	.snapshot-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.35rem;
		margin-bottom: 0.35rem;
	}

	.snapshot-card,
	.snapshot-peak {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.35rem 0.45rem;
	}

	.snapshot-label {
		font-size: 0.52rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.snapshot-value {
		margin-top: 0.14rem;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text);
	}

	.snapshot-peak {
		margin-bottom: 0.55rem;
		background: rgba(16, 185, 129, 0.06);
	}

	.section-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
	}

	.chart-section {
		margin-bottom: 0.5rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.chart-section-last {
		margin-bottom: 0.35rem;
	}

	.chart-wrap {
		position: relative;
	}

	.chart-svg {
		width: 100%;
		display: block;
	}

	.wave-svg {
		height: 126px;
	}

	.wind-svg {
		height: 154px;
	}

	.tide-svg {
		height: 162px;
	}

	.chart-tooltip {
		position: absolute;
		top: 0.25rem;
		z-index: 2;
		min-width: 120px;
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

	.tide-predictions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.tide-item {
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
		padding: 0.22rem 0.35rem;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 4px;
		font-size: 0.56rem;
	}

	.tide-type {
		font-weight: 700;
		font-size: 0.52rem;
	}

	.tide-type.high {
		color: #10b981;
	}

	.tide-type.low {
		color: #818cf8;
	}

	.tide-height {
		color: var(--text);
		font-weight: 600;
	}

	.tide-time {
		color: var(--text-dim);
	}

	@media (max-width: 900px) {
		.snapshot-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
