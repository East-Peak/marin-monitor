<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchMarineOutlook, type MarineOutlookDay } from '$lib/api/marin/marine';

	let outlook = $state<MarineOutlookDay[]>([]);
	let loading = $state(true);

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

	onMount(async () => {
		outlook = await fetchMarineOutlook(5);
		loading = false;
	});
</script>

<Panel id="marine-outlook" title="5-Day Swell Outlook" {loading}>
	<div class="source">Point Reyes nearshore (Open-Meteo Marine)</div>

	{#if outlook.length > 0}
		<div class="outlook-list">
			{#each outlook as day}
				<div class="outlook-row">
					<div class="day">{formatDay(day.date)}</div>
					<div class="stats">
						<span>{fmt(day.swellHeightMax, ' ft')}</span>
						<span>{fmt(day.swellPeriodMax, ' s')}</span>
						<span>{dirToCompass(day.swellDirectionDominant)}</span>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty">No marine outlook available</div>
	{/if}
</Panel>

<style>
	.source {
		font-size: 0.55rem;
		color: var(--text-muted);
		margin-bottom: 0.45rem;
	}

	.outlook-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.outlook-row {
		display: grid;
		grid-template-columns: 48px minmax(0, 1fr);
		gap: 0.5rem;
		padding-bottom: 0.26rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.day {
		font-size: 0.62rem;
		color: var(--text);
		font-weight: 700;
		text-transform: uppercase;
	}

	.stats {
		display: flex;
		justify-content: space-between;
		gap: 0.4rem;
		font-size: 0.58rem;
		color: var(--text-dim);
	}

	.empty {
		font-size: 0.62rem;
		color: var(--text-dim);
	}
</style>
