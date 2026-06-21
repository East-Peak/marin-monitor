<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchMarineOutlook, type MarineOutlookDay } from '$lib/api/marin/marine';
	import { fetchDailyRainForecast, type DailyRainForecast } from '$lib/api/marin/nws-hourly';
	import { selectedTownObj } from '$lib/stores/town-filter';
	import type { WeatherData } from '$lib/types';

	interface Props {
		forecast: (WeatherData & { name: string })[];
		loading?: boolean;
		error?: string | null;
		locationLat?: number;
		locationLon?: number;
	}

	let { forecast = [], loading = false, error = null, locationLat, locationLon }: Props = $props();

	let marineOutlook = $state<MarineOutlookDay[]>([]);
	let marineLoading = $state(true);
	let dailyRain = $state<DailyRainForecast[]>([]);

	type DailyForecast = {
		label: string;
		date: string;
		high: number;
		low: number | null;
		summary: string;
		rainInches: number;
	};

	type HighlightCard = {
		label: string;
		value: string;
		detail: string;
		tone: 'default' | 'accent' | 'marine' | 'warning';
	};

	const dailyForecast = $derived.by<DailyForecast[]>(() => {
		const rainByDate = new Map(dailyRain.map((d) => [d.date, d.totalInches]));
		const days: DailyForecast[] = [];
		for (let i = 0; i < forecast.length && days.length < 5; i++) {
			const period = forecast[i];
			if (!period.isDaytime) continue;
			// The next period (i+1) should be the corresponding night with the low
			const nightPeriod = forecast[i + 1]?.isDaytime === false ? forecast[i + 1] : null;
			const dateStr = new Date(period.timestamp).toLocaleDateString('en-CA');
			days.push({
				label:
					period.name === 'Today'
						? 'Today'
						: new Date(period.timestamp).toLocaleDateString('en-US', { weekday: 'short' }),
				date: dateStr,
				high: period.temperature,
				low: nightPeriod?.temperature ?? null,
				summary: period.shortForecast,
				rainInches: rainByDate.get(dateStr) ?? 0
			});
		}
		return days;
	});

	const outlookHighlights = $derived.by<HighlightCard[]>(() => {
		const cards: HighlightCard[] = [];

		if (dailyForecast.length > 0) {
			const warmest = dailyForecast.reduce((best, day) => (day.high > best.high ? day : best));
			const coolest = dailyForecast.reduce((best, day) => (day.high < best.high ? day : best));
			cards.push({
				label: 'Warmest Day',
				value: `${warmest.high}°`,
				detail: `${warmest.label} · ${warmest.summary}`,
				tone: 'accent'
			});
			cards.push({
				label: 'Coolest Day',
				value: `${coolest.high}°`,
				detail: `${coolest.label} · ${coolest.summary}`,
				tone: 'default'
			});
		}

		if (marineOutlook.length > 0) {
			const peakSwell = marineOutlook.reduce((best, day) => {
				const bestScore = (best.swellHeightMax ?? 0) * ((best.swellPeriodMax ?? 0) + 1);
				const dayScore = (day.swellHeightMax ?? 0) * ((day.swellPeriodMax ?? 0) + 1);
				return dayScore > bestScore ? day : best;
			});
			cards.push({
				label: 'Peak Swell',
				value: `${fmt(peakSwell.swellHeightMax, ' ft')} @ ${fmt(peakSwell.swellPeriodMax, ' s')}`,
				detail: `${formatDay(peakSwell.date)} · ${dirToCompass(peakSwell.swellDirectionDominant)}`,
				tone: 'marine'
			});
		}

		const rainy = dailyForecast.find((day) => /rain|showers|drizzle/i.test(day.summary));
		const foggy = dailyForecast.find((day) => /fog|haze|mist/i.test(day.summary));
		if (rainy) {
			cards.push({
				label: 'Watch',
				value: rainy.label,
				detail: rainy.summary,
				tone: 'warning'
			});
		} else if (foggy) {
			cards.push({
				label: 'Watch',
				value: foggy.label,
				detail: foggy.summary,
				tone: 'warning'
			});
		} else {
			cards.push({
				label: 'Watch',
				value: 'Clearer Run',
				detail: 'No rain signal in the next five days',
				tone: 'default'
			});
		}

		return cards;
	});

	function dirToCompass(deg: number | null): string {
		if (deg === null) return 'N/A';
		const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
		const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
		return `${dirs[idx]} ${Math.round(deg)}°`;
	}

	function fmt(value: number | null, suffix: string): string {
		return value === null ? 'N/A' : `${value.toFixed(1)}${suffix}`;
	}

	function formatDay(date: string): string {
		return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
	}

	function formatRain(inches: number): string {
		if (inches < 0.01) return '';
		if (inches < 0.1) return `${Math.round(inches * 100) / 100}"`;
		return `${Math.round(inches * 10) / 10}"`;
	}

	// Fetch marine outlook once (not location-dependent — Point Reyes nearshore)
	onMount(async () => {
		marineOutlook = await fetchMarineOutlook(5);
		marineLoading = false;
	});

	// Re-fetch rain forecast when location changes
	$effect(() => {
		const lat = locationLat;
		const lon = locationLon;
		fetchDailyRainForecast(lat, lon).then((rain) => {
			dailyRain = rain;
		});
	});
</script>

<Panel id="outlooks" title="Outlooks" loading={loading || marineLoading} {error}>
	<div class="outlooks-shell">
		<div class="outlooks-grid">
			<section class="outlook-section">
				<div class="section-header">
					<div class="section-title">5-Day Weather</div>
					<div class="section-meta">
						{$selectedTownObj ? $selectedTownObj.name : 'Central Marin'}
					</div>
				</div>

				{#if dailyForecast.length > 0}
					<div class="forecast-list">
						{#each dailyForecast as period}
							<div class="forecast-row weather-row">
								<span class="period">{period.label}</span>
								<span class="temp-pair">
									<span class="temp-high">{period.high}&deg;</span>
									<span class="temp-low">{period.low !== null ? `${period.low}°` : '--'}</span>
								</span>
								<span class="rain-col">{formatRain(period.rainInches)}</span>
								<span class="summary">{period.summary}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="empty">No 5-day weather outlook available</div>
				{/if}
			</section>

			<section class="outlook-section">
				<div class="section-header">
					<div class="section-title">5-Day Swell</div>
					<div class="section-meta">Point Reyes nearshore</div>
				</div>

				{#if marineOutlook.length > 0}
					<div class="forecast-list marine-list">
						{#each marineOutlook as day}
							<div class="forecast-row marine-row">
								<span class="period">{formatDay(day.date)}</span>
								<span class="marine-stat">{fmt(day.swellHeightMax, ' ft')}</span>
								<span class="marine-stat">{fmt(day.swellPeriodMax, ' s')}</span>
								<span class="summary">{dirToCompass(day.swellDirectionDominant)}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="empty">No 5-day swell outlook available</div>
				{/if}
			</section>
		</div>

		{#if outlookHighlights.length > 0}
			<div class="outlooks-summary">
				{#each outlookHighlights as card}
					<div class={`summary-card ${card.tone}`}>
						<div class="summary-label">{card.label}</div>
						<div class="summary-value">{card.value}</div>
						<div class="summary-detail">{card.detail}</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</Panel>

<style>
	.outlooks-shell {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.outlooks-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		flex: 1;
	}

	.outlook-section {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.outlook-section + .outlook-section {
		padding-left: 0.75rem;
		border-left: 1px solid var(--border);
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}

	.section-title {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--text);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.section-meta {
		font-size: 0.54rem;
		color: var(--text-muted);
	}

	.forecast-list {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.forecast-row {
		display: grid;
		grid-template-columns: minmax(56px, 0.8fr) 34px minmax(0, 2fr);
		gap: 0.4rem;
		align-items: center;
		padding: 0.45rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.forecast-row:last-child {
		border-bottom: none;
	}

	.weather-row {
		grid-template-columns: minmax(44px, 0.7fr) minmax(54px, auto) 28px minmax(0, 2fr);
	}

	.rain-col {
		font-size: 0.58rem;
		color: var(--accent);
		font-weight: 600;
		text-align: right;
	}

	.marine-row {
		grid-template-columns: minmax(44px, 0.8fr) minmax(0, 0.7fr) minmax(0, 0.7fr) minmax(0, 1fr);
	}

	.period {
		font-size: 0.63rem;
		color: var(--text);
		font-weight: 600;
	}

	.temp-pair {
		display: flex;
		gap: 0.2rem;
		align-items: baseline;
	}

	.temp-high {
		font-size: 0.66rem;
		color: #e8e8e8;
		font-weight: 700;
	}

	.temp-low {
		font-size: 0.58rem;
		color: var(--text-muted);
		font-weight: 500;
	}

	.marine-stat {
		font-size: 0.66rem;
		color: #e8e8e8;
		font-weight: 700;
	}

	.summary {
		font-size: 0.6rem;
		color: var(--text-dim);
		line-height: 1.3;
	}

	.outlooks-summary {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
	}

	.summary-card {
		padding: 0.55rem 0.6rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
		min-width: 0;
	}

	.summary-card.accent {
		background: rgba(68, 136, 255, 0.08);
	}

	.summary-card.marine {
		background: rgba(34, 197, 94, 0.08);
	}

	.summary-card.warning {
		background: rgba(245, 158, 11, 0.09);
	}

	.summary-label {
		font-size: 0.54rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.22rem;
	}

	.summary-value {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--text);
		line-height: 1.2;
	}

	.summary-detail {
		margin-top: 0.16rem;
		font-size: 0.56rem;
		line-height: 1.35;
		color: var(--text-dim);
	}

	.empty {
		font-size: 0.6rem;
		color: var(--text-dim);
		padding: 0.8rem 0;
	}

	@media (max-width: 1100px) {
		.outlooks-summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 900px) {
		.outlooks-grid {
			grid-template-columns: 1fr;
		}

		.outlook-section + .outlook-section {
			padding-left: 0;
			padding-top: 0.75rem;
			border-left: none;
			border-top: 1px solid var(--border);
		}
	}
</style>
