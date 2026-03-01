<script lang="ts">
	import { Panel } from '$lib/components/common';
	import type { WeatherData } from '$lib/types';

	interface Props {
		forecast: (WeatherData & { name: string })[];
		loading?: boolean;
		error?: string | null;
	}

	let { forecast = [], loading = false, error = null }: Props = $props();

	type DailyForecast = {
		label: string;
		temperature: number;
		summary: string;
	};

	const dailyForecast = $derived.by<DailyForecast[]>(() =>
		forecast
			.filter((period) => period.isDaytime)
			.slice(0, 5)
			.map((period) => ({
				label:
					period.name === 'Today'
						? 'Today'
						: new Date(period.timestamp).toLocaleDateString('en-US', { weekday: 'long' }),
				temperature: period.temperature,
				summary: period.shortForecast
			}))
	);
</script>

<Panel id="forecast-5day" title="5-Day Forecast · Central Marin" {loading} {error}>
	{#if dailyForecast.length > 0}
		<div class="forecast-list">
			{#each dailyForecast as period}
				<div class="forecast-row">
					<span class="period">{period.label}</span>
					<span class="temp">{period.temperature}&deg;</span>
					<span class="summary">{period.summary}</span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty">No 5-day forecast available</div>
	{/if}
</Panel>

<style>
	.forecast-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		flex: 1 1 auto;
		min-height: 0;
		height: 100%;
	}

	.forecast-row {
		display: grid;
		grid-template-columns: minmax(72px, 1fr) 36px 2fr;
		gap: 0.4rem;
		align-items: center;
		flex: 1 1 0;
		min-height: 0;
		padding: 0.55rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.forecast-row:last-child {
		border-bottom: none;
	}

	.period {
		font-size: 0.66rem;
		color: var(--text);
		font-weight: 600;
	}

	.temp {
		font-size: 0.76rem;
		color: #e8e8e8;
		font-weight: 700;
	}

	.summary {
		font-size: 0.62rem;
		color: var(--text-dim);
		line-height: 1.35;
	}

	.empty {
		font-size: 0.62rem;
		color: var(--text-dim);
		display: flex;
		align-items: center;
		height: 100%;
	}
</style>
