<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchMarineSnapshot, type MarineSnapshot } from '$lib/api/marin/marine';

	let snapshot = $state<MarineSnapshot | null>(null);
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

	onMount(async () => {
		snapshot = await fetchMarineSnapshot();
		loading = false;
	});
</script>

<Panel id="surf" title="Swell Now" {loading}>
	<div class="surf-meta">Point Reyes nearshore (Open-Meteo Marine)</div>

	<div class="surf-grid">
		<div class="metric">
			<div class="label">Wave</div>
			<div class="value">{fmt(snapshot?.waveHeight ?? null, ' ft')}</div>
		</div>
		<div class="metric">
			<div class="label">Swell</div>
			<div class="value">{fmt(snapshot?.swellHeight ?? null, ' ft')}</div>
		</div>
		<div class="metric">
			<div class="label">Period</div>
			<div class="value">{fmt(snapshot?.swellPeriod ?? null, ' s')}</div>
		</div>
		<div class="metric">
			<div class="label">Direction</div>
			<div class="value">{dirToCompass(snapshot?.swellDirection ?? null)}</div>
		</div>
	</div>

	<div class="projection">
		<div class="label">Next 12h Peak Swell</div>
		<div class="value">
			{fmt(snapshot?.next12hMaxSwell ?? null, ' ft')} @ {dirToCompass(
				snapshot?.next12hPeakDirection ?? null
			)}
		</div>
	</div>
</Panel>

<style>
	.surf-meta {
		font-size: 0.55rem;
		color: var(--text-muted);
		margin-bottom: 0.45rem;
	}

	.surf-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem;
	}

	.metric {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.35rem 0.45rem;
	}

	.label {
		font-size: 0.52rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.value {
		margin-top: 0.16rem;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text);
	}

	.projection {
		margin-top: 0.45rem;
		padding: 0.35rem 0.45rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: rgba(16, 185, 129, 0.06);
	}
</style>
