<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { allNewsItems, refresh } from '$lib/stores';
	import { townFilter, selectedTownObj } from '$lib/stores/town-filter';
	import { fetchTidePredictions } from '$lib/api/marin';
	import type { FireWeatherAlert, WeatherData, EarthquakeData, TidePrediction } from '$lib/types';

	interface Props {
		forecast?: (WeatherData & { name: string })[];
		weatherAlerts?: FireWeatherAlert[];
		earthquakes?: EarthquakeData[];
	}

	let { forecast = [], weatherAlerts = [], earthquakes = [] }: Props = $props();

	let nextTide = $state<TidePrediction | null>(null);
	let tideError = $state<string | null>(null);

	const recentItems = $derived(
		$allNewsItems.filter((item) => Date.now() - item.timestamp <= 24 * 60 * 60 * 1000)
	);

	const filteredRecentItems = $derived(
		$townFilter ? recentItems.filter((i) => i.townSlug === $townFilter) : recentItems
	);

	const stories24h = $derived(filteredRecentItems.length);

	const alerts24h = $derived(
		filteredRecentItems.filter((item) => item.isAlert).length + weatherAlerts.length
	);

	const temperature = $derived(forecast[0]?.temperature ?? null);

	const lastRefreshText = $derived(
		$refresh.lastRefresh ? new Date($refresh.lastRefresh).toLocaleTimeString() : 'Never'
	);

	const lastEarthquake = $derived(
		earthquakes.length > 0 ? [...earthquakes].sort((a, b) => b.time - a.time)[0] : null
	);

	function formatTide(tide: TidePrediction): string {
		const [, timePart] = tide.time.split(' ');
		const [h, m] = (timePart || '00:00').split(':').map((v) => parseInt(v, 10));
		const ampm = h >= 12 ? 'p' : 'a';
		const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
		return `${tide.type === 'H' ? 'HI' : 'LO'} ${h12}:${String(m).padStart(2, '0')}${ampm}`;
	}

	function formatQuake(eq: EarthquakeData): string {
		return `M${eq.magnitude.toFixed(1)} ${new Date(eq.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
	}

	onMount(async () => {
		try {
			const predictions = await fetchTidePredictions();
			const now = Date.now();
			nextTide =
				predictions
					.filter((p) => new Date(p.time).getTime() > now)
					.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())[0] ?? null;
		} catch (error) {
			tideError = (error as Error).message;
		}
	});
</script>

<Panel id="pulse" title="Pulse" variant="pulse" count={stories24h}>
	<div class="pulse-grid">
		<div class="stat-card">
			<div class="label">
				{$selectedTownObj ? `${$selectedTownObj.name} (24h)` : 'Stories (24h)'}
			</div>
			<div class="value">{stories24h}</div>
		</div>
		<div class="stat-card">
			<div class="label">Alerts</div>
			<div class="value">{alerts24h}</div>
		</div>
		<div class="stat-card">
			<div class="label">Temp</div>
			<div class="value">{temperature !== null ? `${temperature}\u00b0` : 'N/A'}</div>
		</div>
		<div class="stat-card">
			<div class="label">Next Tide</div>
			<div class="value">{nextTide ? formatTide(nextTide) : tideError ? 'Error' : 'Loading'}</div>
		</div>
		<div class="stat-card">
			<div class="label">Last Quake</div>
			<div class="value">{lastEarthquake ? formatQuake(lastEarthquake) : 'None'}</div>
		</div>
		<div class="stat-card">
			<div class="label">Last Refresh</div>
			<div class="value">{lastRefreshText}</div>
		</div>
	</div>
</Panel>

<style>
	.pulse-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.stat-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.4rem 0.5rem;
	}

	.label {
		font-size: 0.56rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.value {
		margin-top: 0.2rem;
		font-size: 0.72rem;
		color: var(--text);
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
