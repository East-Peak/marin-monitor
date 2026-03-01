<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import {
		fetchAirQuality,
		fetchStreamGauges,
		fetchFireIncidents,
		fetchUvIndex
	} from '$lib/api/marin';
	import type { AirQualityData } from '$lib/types';
	import type { StreamGauge } from '$lib/api/marin/streams';
	import type { FireIncident } from '$lib/api/marin/calfire';
	import type { UvData } from '$lib/api/marin/uv';

	let aqi = $state<AirQualityData | null>(null);
	let streams = $state<StreamGauge[]>([]);
	let fires = $state<FireIncident[]>([]);
	let uv = $state<UvData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	function formatFlow(cfs: number | null): string {
		if (cfs === null) return '--';
		if (cfs >= 1000) return `${(cfs / 1000).toFixed(1)}K`;
		return cfs.toFixed(0);
	}

	function flowColor(cfs: number | null): string {
		if (cfs === null) return 'var(--text-muted)';
		if (cfs >= 500) return '#3b82f6';
		if (cfs >= 100) return '#06b6d4';
		if (cfs >= 20) return '#22c55e';
		return '#f59e0b';
	}

	function timeAgo(ts: number): string {
		const mins = Math.floor((Date.now() - ts) / 60000);
		if (mins < 1) return 'now';
		if (mins < 60) return `${mins}m`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h`;
		return `${Math.floor(hours / 24)}d`;
	}

	onMount(async () => {
		try {
			const [aqiResult, streamResult, fireResult, uvResult] = await Promise.allSettled([
				fetchAirQuality(),
				fetchStreamGauges(),
				fetchFireIncidents(),
				fetchUvIndex()
			]);

			if (aqiResult.status === 'fulfilled') aqi = aqiResult.value;
			if (streamResult.status === 'fulfilled') streams = streamResult.value;
			if (fireResult.status === 'fulfilled') fires = fireResult.value;
			if (uvResult.status === 'fulfilled') uv = uvResult.value;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			loading = false;
		}
	});
</script>

<Panel id="environment" title="Environment" variant="default" {loading} {error}>
	<!-- Top row: AQI + UV + Fire status -->
	<div class="env-grid">
		<div class="stat-card">
			<div class="label">Air Quality</div>
			{#if aqi}
				<div class="value" style="color: {aqi.color}">{aqi.aqi}</div>
				<div class="sub">{aqi.category} ({aqi.pollutant})</div>
			{:else}
				<div class="value dim">--</div>
				<div class="sub">No API key</div>
			{/if}
		</div>

		<div class="stat-card">
			<div class="label">UV Index</div>
			{#if uv}
				<div class="value" style="color: {uv.color}">{uv.current}</div>
				<div class="sub">{uv.category}</div>
			{:else}
				<div class="value dim">--</div>
			{/if}
		</div>

		<div class="stat-card">
			<div class="label">Active Fires</div>
			<div class="value" class:fire-alert={fires.length > 0}>
				{fires.length}
			</div>
			{#if fires.length > 0}
				<div class="sub">{fires.reduce((a, f) => a + f.acres, 0).toLocaleString()} acres</div>
			{:else}
				<div class="sub">None nearby</div>
			{/if}
		</div>
	</div>

	<!-- Fire incidents (if any) -->
	{#if fires.length > 0}
		<div class="section-label">Fire Incidents</div>
		<div class="fire-list">
			{#each fires as fire (fire.id)}
				<a class="fire-row" href={fire.url} target="_blank" rel="noopener">
					<span class="fire-name">{fire.name}</span>
					<span class="fire-detail">
						{fire.acres.toLocaleString()} ac · {fire.containment}% contained
					</span>
				</a>
			{/each}
		</div>
	{/if}

	<!-- Stream gauges -->
	<div class="section-label">Creek Levels</div>
	{#if streams.length === 0 && !loading}
		<div class="empty">No gauge data available</div>
	{:else}
		<div class="stream-table">
			<div class="stream-header">
				<span>Creek</span>
				<span class="right">Flow (cfs)</span>
				<span class="right">Height (ft)</span>
				<span class="right">Age</span>
			</div>
			{#each streams as gauge (gauge.siteId)}
				<div class="stream-row">
					<span class="creek-name">{gauge.shortName}</span>
					<span class="right" style="color: {flowColor(gauge.streamflow)}">
						{formatFlow(gauge.streamflow)}
					</span>
					<span class="right">
						{gauge.gageHeight !== null ? gauge.gageHeight.toFixed(1) : '--'}
					</span>
					<span class="right dim">{timeAgo(gauge.timestamp)}</span>
				</div>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.env-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.45rem;
		margin-bottom: 0.75rem;
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
		margin-top: 0.15rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text);
	}

	.value.dim {
		color: var(--text-muted);
	}

	.value.fire-alert {
		color: #ef4444;
	}

	.sub {
		font-size: 0.56rem;
		color: var(--text-muted);
		margin-top: 0.1rem;
	}

	.section-label {
		font-size: 0.56rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin-bottom: 0.35rem;
		margin-top: 0.25rem;
		padding-bottom: 0.2rem;
		border-bottom: 1px solid var(--border);
	}

	.fire-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.75rem;
	}

	.fire-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.3rem 0.4rem;
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 3px;
		text-decoration: none;
		color: inherit;
	}

	.fire-row:hover {
		background: rgba(239, 68, 68, 0.14);
	}

	.fire-name {
		font-size: 0.68rem;
		font-weight: 600;
		color: #ef4444;
	}

	.fire-detail {
		font-size: 0.56rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.stream-table {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.stream-header {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr 0.5fr;
		gap: 0.25rem;
		padding: 0.25rem 0.3rem;
		font-size: 0.52rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
	}

	.stream-row {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr 0.5fr;
		gap: 0.25rem;
		padding: 0.3rem;
		font-size: 0.65rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}

	.stream-row:last-child {
		border-bottom: none;
	}

	.creek-name {
		color: var(--text-secondary);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.right {
		text-align: right;
	}

	.dim {
		color: var(--text-muted);
	}

	.empty {
		font-size: 0.65rem;
		color: var(--text-muted);
		text-align: center;
		padding: 0.75rem;
	}
</style>
