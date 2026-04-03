<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import type { WeatherData, FireWeatherAlert } from '$lib/types';
	import type { HourlyPeriod, DailyRainForecast } from '$lib/api/marin/nws-hourly';
	import { fetchHourlyForecast, fetchDailyRainForecast } from '$lib/api/marin/nws-hourly';
	import { fetchSunTimes } from '$lib/api/marin/sun';
	import type { SunData } from '$lib/api/marin/sun';
	import { buildChart, type ChartPaths } from '$lib/utils/chart';

	interface Props {
		forecast: (WeatherData & { name: string })[];
		alerts: FireWeatherAlert[];
		loading?: boolean;
		error?: string | null;
		locationLat?: number;
		locationLon?: number;
		locationName?: string;
	}

	type SummarySignal = {
		label: string;
		value: string;
		detail: string;
		tone?: 'default' | 'accent' | 'warning';
	};

	type HoverState = { chart: 'temp' | 'precip'; index: number; x: number } | null;

	const TEMP_ACCENT = '#4488ff';
	const PRECIP_ACCENT = '#22c55e';
	const TEMP_HEIGHT = 196;
	const PRECIP_HEIGHT = 144;
	const TEMP_MARGINS = { top: 8, right: 4, bottom: 18, left: 24 };
	const PRECIP_MARGINS = { top: 8, right: 4, bottom: 16, left: 24 };

	let {
		forecast = [],
		alerts = [],
		loading = false,
		error = null,
		locationLat,
		locationLon,
		locationName = 'Central Marin'
	}: Props = $props();

	const currentPeriod = $derived(forecast[0] ?? null);

	let hourlyData = $state<HourlyPeriod[]>([]);
	let dailyRain = $state<DailyRainForecast[]>([]);
	let sunData = $state<SunData | null>(null);
	let tempContainer = $state<HTMLDivElement>(undefined!);
	let precipContainer = $state<HTMLDivElement>(undefined!);
	let tempWidth = $state(0);
	let precipWidth = $state(0);
	let hoverState = $state<HoverState>(null);

	// Build chart geometry reactively via shared utility
	const tempChartPaths = $derived.by<ChartPaths | null>(() => {
		if (tempWidth === 0 || hourlyData.length < 2) return null;
		return buildChart({
			width: tempWidth,
			height: TEMP_HEIGHT,
			margins: TEMP_MARGINS,
			accentColor: TEMP_ACCENT,
			data: hourlyData.map((h) => ({
				value: h.temperature,
				label: formatHour(h.startTime)
			}))
		});
	});

	const precipChartPaths = $derived.by<ChartPaths | null>(() => {
		if (precipWidth === 0 || hourlyData.length < 2) return null;
		return buildChart({
			width: precipWidth,
			height: PRECIP_HEIGHT,
			margins: PRECIP_MARGINS,
			accentColor: PRECIP_ACCENT,
			data: hourlyData.map((h) => ({
				value: Math.max(0, Math.min(100, h.precipitationChance)),
				label: formatHour(h.startTime)
			}))
		});
	});

	const summarySignals = $derived.by<SummarySignal[]>(() => {
		if (hourlyData.length === 0) return [];
		const temps = hourlyData.map((period) => period.temperature);
		const tempLow = Math.min(...temps);
		const tempHigh = Math.max(...temps);
		const peakRain = hourlyData.reduce((best, period) =>
			period.precipitationChance > best.precipitationChance ? period : best
		);
		const strongestWind = hourlyData.reduce((best, period) => {
			const bestSpeed = parseWindSpeed(best.windSpeed) ?? -1;
			const periodSpeed = parseWindSpeed(period.windSpeed) ?? -1;
			return periodSpeed > bestSpeed ? period : best;
		});

		// Find today's estimated rain total from QPF data
		const todayDate = new Date().toLocaleDateString('en-CA');
		const todayRain = dailyRain.find((d) => d.date === todayDate);
		const rainDetail =
			todayRain && todayRain.totalInches > 0
				? `${formatTooltipTime(peakRain.startTime)} · Est. ${formatRainAmount(todayRain.totalInches)} today`
				: `${formatTooltipTime(peakRain.startTime)} · ${peakRain.shortForecast}`;

		return [
			{
				label: 'Temp Range',
				value: `${tempLow}°-${tempHigh}°`,
				detail: 'next 24 hours',
				tone: 'accent'
			},
			{
				label: 'Peak Rain',
				value: `${peakRain.precipitationChance}%`,
				detail: rainDetail,
				tone: peakRain.precipitationChance >= 25 ? 'warning' : 'default'
			},
			{
				label: 'Wind Peak',
				value: strongestWind.windSpeed,
				detail: `${strongestWind.windDirection} · ${formatTooltipTime(strongestWind.startTime)}`,
				tone: 'default'
			}
		];
	});

	function alertSeverityClass(severity: string): string {
		switch (severity) {
			case 'Extreme':
			case 'Severe':
				return 'critical';
			case 'Moderate':
				return 'elevated';
			default:
				return 'monitoring';
		}
	}

	function formatHour(iso: string): string {
		const d = new Date(iso);
		const h = d.getHours();
		if (h === 0) return '12a';
		if (h === 12) return '12p';
		return h > 12 ? `${h - 12}p` : `${h}a`;
	}

	function formatTooltipTime(iso: string): string {
		return new Date(iso).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatRainAmount(inches: number): string {
		if (inches < 0.01) return 'trace';
		if (inches < 0.1) return `${Math.round(inches * 100) / 100}"`;
		return `${Math.round(inches * 10) / 10}"`;
	}

	function parseWindSpeed(value: string): number | null {
		const matches = value.match(/\d+/g);
		if (!matches || matches.length === 0) return null;
		const nums = matches.map((part) => Number(part));
		return nums.reduce((sum, num) => sum + num, 0) / nums.length;
	}

	function updateHover(event: PointerEvent, chart: 'temp' | 'precip') {
		const paths = chart === 'temp' ? tempChartPaths : precipChartPaths;
		const margins = chart === 'temp' ? TEMP_MARGINS : PRECIP_MARGINS;
		if (!paths) return;
		const target = event.currentTarget as SVGSVGElement;
		const rect = target.getBoundingClientRect();
		const innerWidth = rect.width - margins.left - margins.right;
		const relativeX = Math.max(0, Math.min(innerWidth, event.clientX - rect.left - margins.left));
		const ratio = innerWidth <= 0 ? 0 : relativeX / innerWidth;
		const index = Math.max(
			0,
			Math.min(paths.dots.length - 1, Math.round(ratio * (paths.dots.length - 1)))
		);
		hoverState = { chart, index, x: margins.left + paths.dots[index].x };
	}

	function clearHover() {
		hoverState = null;
	}

	function measureWidths() {
		if (tempContainer) tempWidth = tempContainer.clientWidth;
		if (precipContainer) precipWidth = precipContainer.clientWidth;
	}

	onMount(() => {
		measureWidths();

		let resizeTimer: ReturnType<typeof setTimeout>;
		function handleResize() {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(measureWidths, 150);
		}

		window.addEventListener('resize', handleResize);

		void (async () => {
			hourlyData = await fetchHourlyForecast(locationLat, locationLon);
		})();
		void (async () => {
			dailyRain = await fetchDailyRainForecast(locationLat, locationLon);
		})();
		void (async () => {
			sunData = await fetchSunTimes(locationLat, locationLon);
		})();

		return () => {
			window.removeEventListener('resize', handleResize);
		};
	});

	// Re-measure widths when hourly data arrives
	$effect(() => {
		if (hourlyData.length > 1) measureWidths();
	});
</script>

<Panel id="weather" title="Weather · {locationName}" {loading} {error}>
	{#if alerts.length > 0}
		<div class="weather-alerts">
			{#each alerts as alert}
				<div class="weather-alert {alertSeverityClass(alert.severity)}">
					<div class="alert-event">{alert.event}</div>
					<div class="alert-headline">{alert.headline}</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if currentPeriod}
		<div class="current-weather">
			<div class="current-main">
				<span class="temp-large">{currentPeriod.temperature}&deg;</span>
				<div class="current-details">
					<div class="forecast-text">{currentPeriod.shortForecast}</div>
					<div class="wind-line">Wind {currentPeriod.windSpeed} {currentPeriod.windDirection}</div>
					{#if sunData}
						<div class="sun-line">
							<span class="sun-rise">Rise {sunData.sunrise}</span>
							<span class="sun-sep">&middot;</span>
							<span class="sun-set">Set {sunData.sunset}</span>
							<span class="sun-sep">&middot;</span>
							<span class="sun-length">{sunData.dayLength}</span>
						</div>
					{/if}
				</div>
			</div>
		</div>

		{#if hourlyData.length > 1}
			<div class="chart-section">
				<div class="section-label">24h Temperature</div>
				<div class="chart-wrap" bind:this={tempContainer}>
					{#if tempChartPaths}
						<svg
							class="chart-svg temp-svg"
							width={tempWidth}
							height={TEMP_HEIGHT}
							role="img"
							aria-label="24 hour temperature chart"
							onpointermove={(event) => updateHover(event, 'temp')}
							onpointerleave={clearHover}
						>
							<g transform={`translate(${TEMP_MARGINS.left},${TEMP_MARGINS.top})`}>
								<path d={tempChartPaths.areaPath} fill="rgba(68, 136, 255, 0.1)" />
								<path d={tempChartPaths.linePath} fill="none" stroke={TEMP_ACCENT} stroke-width="1.5" />
								{#if hoverState?.chart === 'temp'}
									<line
										x1={tempChartPaths.dots[hoverState.index].x}
										x2={tempChartPaths.dots[hoverState.index].x}
										y1="0"
										y2={TEMP_HEIGHT - TEMP_MARGINS.top - TEMP_MARGINS.bottom}
										stroke="rgba(255,255,255,0.35)"
										stroke-width="1"
										stroke-dasharray="3,3"
									/>
									<circle
										cx={tempChartPaths.dots[hoverState.index].x}
										cy={tempChartPaths.dots[hoverState.index].y}
										r="4"
										fill={TEMP_ACCENT}
										stroke="#111"
										stroke-width="1"
									/>
								{/if}
								<text x="-4" y={tempChartPaths.yScale(tempChartPaths.yMax)} text-anchor="end" dominant-baseline="middle" fill="#888" font-size="8px">{Math.round(tempChartPaths.yMax)}°</text>
								<text x="-4" y={tempChartPaths.yScale(tempChartPaths.yMin)} text-anchor="end" dominant-baseline="middle" fill="#888" font-size="8px">{Math.round(tempChartPaths.yMin)}°</text>
								{#each tempChartPaths.axisLabels.x as lbl}
									<text x={lbl.x} y={TEMP_HEIGHT - TEMP_MARGINS.top - TEMP_MARGINS.bottom + 12} text-anchor="middle" fill="#666" font-size="7px">{lbl.label}</text>
								{/each}
							</g>
						</svg>
					{/if}
					{#if hoverState?.chart === 'temp'}
						<div class="chart-tooltip" style={`left:${Math.max(16, hoverState.x - 58)}px`}>
							<div class="tooltip-time">
								{formatTooltipTime(hourlyData[hoverState.index].startTime)}
							</div>
							<div class="tooltip-line">Temp {hourlyData[hoverState.index].temperature}&deg;</div>
							<div class="tooltip-line">
								Rain {hourlyData[hoverState.index].precipitationChance}%
							</div>
							<div class="tooltip-line">
								Wind {hourlyData[hoverState.index].windSpeed}
								{hourlyData[hoverState.index].windDirection}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if hourlyData.length > 1}
			<div class="chart-section precip-section">
				<div class="section-label">Chance of Precipitation (24h)</div>
				<div class="chart-wrap" bind:this={precipContainer}>
					{#if precipChartPaths}
						<svg
							class="chart-svg precip-svg"
							width={precipWidth}
							height={PRECIP_HEIGHT}
							role="img"
							aria-label="24 hour precipitation chance chart"
							onpointermove={(event) => updateHover(event, 'precip')}
							onpointerleave={clearHover}
						>
							<g transform={`translate(${PRECIP_MARGINS.left},${PRECIP_MARGINS.top})`}>
								<path d={precipChartPaths.areaPath} fill="rgba(34, 197, 94, 0.14)" />
								<path d={precipChartPaths.linePath} fill="none" stroke={PRECIP_ACCENT} stroke-width="1.4" />
								{#if hoverState?.chart === 'precip'}
									<line
										x1={precipChartPaths.dots[hoverState.index].x}
										x2={precipChartPaths.dots[hoverState.index].x}
										y1="0"
										y2={PRECIP_HEIGHT - PRECIP_MARGINS.top - PRECIP_MARGINS.bottom}
										stroke="rgba(255,255,255,0.35)"
										stroke-width="1"
										stroke-dasharray="3,3"
									/>
									<circle
										cx={precipChartPaths.dots[hoverState.index].x}
										cy={precipChartPaths.dots[hoverState.index].y}
										r="4"
										fill={PRECIP_ACCENT}
										stroke="#111"
										stroke-width="1"
									/>
								{/if}
								<text x="-4" y={precipChartPaths.yScale(precipChartPaths.yMax)} text-anchor="end" dominant-baseline="middle" fill="#888" font-size="8px">{Math.round(precipChartPaths.yMax)}%</text>
								<text x="-4" y={precipChartPaths.yScale(precipChartPaths.yMin)} text-anchor="end" dominant-baseline="middle" fill="#888" font-size="8px">{Math.round(precipChartPaths.yMin)}%</text>
								{#each precipChartPaths.axisLabels.x as lbl}
									<text x={lbl.x} y={PRECIP_HEIGHT - PRECIP_MARGINS.top - PRECIP_MARGINS.bottom + 12} text-anchor="middle" fill="#666" font-size="7px">{lbl.label}</text>
								{/each}
							</g>
						</svg>
					{/if}
					{#if hoverState?.chart === 'precip'}
						<div class="chart-tooltip" style={`left:${Math.max(16, hoverState.x - 58)}px`}>
							<div class="tooltip-time">
								{formatTooltipTime(hourlyData[hoverState.index].startTime)}
							</div>
							<div class="tooltip-line">
								Rain {hourlyData[hoverState.index].precipitationChance}%
							</div>
							<div class="tooltip-line">Temp {hourlyData[hoverState.index].temperature}&deg;</div>
							<div class="tooltip-line">Forecast {hourlyData[hoverState.index].shortForecast}</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if summarySignals.length > 0}
			<div class="weather-summary">
				{#each summarySignals as signal}
					<div class={`summary-card ${signal.tone ?? 'default'}`}>
						<div class="summary-label">{signal.label}</div>
						<div class="summary-value">{signal.value}</div>
						<div class="summary-detail">{signal.detail}</div>
					</div>
				{/each}
			</div>
		{/if}
	{:else if !loading && !error}
		<div class="empty-state">No weather data available</div>
	{/if}
</Panel>

<style>
	.weather-alerts {
		margin-bottom: 0.5rem;
	}

	.weather-alert {
		padding: 0.4rem 0.5rem;
		border-radius: 4px;
		margin-bottom: 0.3rem;
		font-size: 0.65rem;
	}

	.weather-alert.critical {
		background: rgba(255, 68, 68, 0.15);
		border: 1px solid rgba(255, 68, 68, 0.3);
	}

	.weather-alert.elevated {
		background: rgba(255, 165, 0, 0.15);
		border: 1px solid rgba(255, 165, 0, 0.3);
	}

	.weather-alert.monitoring {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--border);
	}

	.alert-event {
		font-weight: 700;
		text-transform: uppercase;
		font-size: 0.6rem;
		letter-spacing: 0.03em;
	}

	.alert-headline {
		color: var(--text-dim);
		margin-top: 0.15rem;
		line-height: 1.3;
	}

	.current-weather {
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
		margin-bottom: 0.5rem;
	}

	.current-main {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.temp-large {
		font-size: 2.2rem;
		font-weight: 700;
		line-height: 1;
		color: var(--text);
	}

	.current-details {
		flex: 1;
		padding-top: 0.2rem;
	}

	.forecast-text {
		font-size: 0.7rem;
		color: var(--text);
	}

	.wind-line {
		font-size: 0.6rem;
		color: var(--text-dim);
		margin-top: 0.2rem;
	}

	.sun-line {
		font-size: 0.58rem;
		color: var(--text-dim);
		margin-top: 0.15rem;
		display: flex;
		gap: 0.3rem;
		align-items: baseline;
	}

	.sun-rise {
		color: #fbbf24;
	}

	.sun-set {
		color: #f97316;
	}

	.sun-sep {
		color: var(--text-muted);
		font-size: 0.5rem;
	}

	.sun-length {
		color: var(--text-muted);
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

	.chart-svg {
		width: 100%;
		display: block;
	}

	.chart-wrap {
		position: relative;
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

	.temp-svg {
		height: 196px;
	}

	.precip-svg {
		height: 144px;
	}

	.weather-summary {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.summary-card {
		padding: 0.5rem 0.55rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.summary-card.accent {
		background: rgba(68, 136, 255, 0.08);
	}

	.summary-card.warning {
		background: rgba(245, 158, 11, 0.08);
	}

	.summary-label {
		font-size: 0.52rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.summary-value {
		margin-top: 0.14rem;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--text);
	}

	.summary-detail {
		margin-top: 0.12rem;
		font-size: 0.54rem;
		line-height: 1.35;
		color: var(--text-dim);
	}

	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.7rem;
		padding: 1rem;
	}

	@media (max-width: 900px) {
		.weather-summary {
			grid-template-columns: 1fr;
		}
	}
</style>
