<script lang="ts">
	import { mapStore, activeLayers, showTraffic } from '$lib/stores/map';
	import { MAPBOX_TOKEN } from '$lib/config/api';
	import { LAYER_COLORS } from '$lib/config';
	import type { MapLayer } from '$lib/types';

	const LAYER_LABELS: Record<MapLayer, string> = {
		news: 'News',
		civic: 'Civic',
		safety: 'Crime & Safety',
		housing: 'Housing',
		activity: 'Activity',
		satire: 'Marin Lately'
	};

	const LAYER_ORDER: MapLayer[] = ['news', 'safety', 'civic', 'activity', 'housing', 'satire'];

	function toggleLayer(layer: MapLayer) {
		mapStore.toggleLayer(layer);
	}

	function toggleTraffic() {
		mapStore.toggleTrafficAll();
	}

	const trafficLegendItems = [
		{ label: 'Moderate', color: '#f59e0b' },
		{ label: 'Heavy', color: '#f97316' },
		{ label: 'Severe', color: '#dc2626' },
		{ label: 'Closed', color: '#7f1d1d' }
	];

	const hasTrafficCongestion = Boolean(MAPBOX_TOKEN.trim());
</script>

<div class="map-controls">
	{#each LAYER_ORDER as layer}
		<button
			class="layer-toggle"
			class:active={$activeLayers[layer]}
			style:--layer-color={LAYER_COLORS[layer]}
			onclick={() => toggleLayer(layer)}
			title="{LAYER_LABELS[layer]} layer"
		>
			<span class="layer-dot"></span>
			<span class="layer-label">{LAYER_LABELS[layer]}</span>
		</button>
	{/each}

	<button
		class="layer-toggle traffic-toggle"
		class:active={$showTraffic}
		style:--layer-color={'#f97316'}
		onclick={toggleTraffic}
		title={hasTrafficCongestion
			? 'Traffic overlay (Mapbox congestion + 511 traffic events)'
			: 'Traffic overlay (511 traffic events only)'}
	>
		<span class="layer-dot"></span>
		<span class="layer-label">Traffic</span>
	</button>

	{#if $showTraffic}
		<div class="traffic-legend">
			{#if hasTrafficCongestion}
				{#each trafficLegendItems as item}
					<div class="legend-item">
						<span class="legend-swatch" style:--swatch-color={item.color}></span>
						<span>{item.label}</span>
					</div>
				{/each}
			{/if}
			<div class="legend-item incidents">
				<span class="legend-dot"></span>
				<span>511 traffic events</span>
			</div>
			{#if !hasTrafficCongestion}
				<div class="legend-note">Set `VITE_MAPBOX_TOKEN` to enable congestion lines</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.map-controls {
		position: absolute;
		top: 0.5rem;
		left: 0.5rem;
		display: flex;
		gap: 0.25rem;
		z-index: 10;
		flex-wrap: wrap;
	}

	.layer-toggle {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.4rem;
		background: rgba(10, 10, 10, 0.8);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-dim);
		font-size: 0.6rem;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s ease;
		backdrop-filter: blur(4px);
	}

	.layer-toggle:hover {
		background: rgba(20, 20, 20, 0.9);
		color: var(--text);
	}

	.layer-toggle.active {
		border-color: var(--layer-color);
		color: var(--text);
	}

	.layer-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--layer-color);
		opacity: 0.3;
		transition: opacity 0.15s ease;
	}

	.layer-toggle.active .layer-dot {
		opacity: 1;
	}

	.layer-label {
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-weight: 500;
	}

	.traffic-legend {
		margin-top: 0.15rem;
		padding: 0.32rem 0.42rem;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		background: rgba(10, 10, 10, 0.8);
		border: 1px solid var(--border);
		border-radius: 3px;
		font-size: 0.56rem;
		color: var(--text-dim);
		backdrop-filter: blur(4px);
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.24rem;
	}

	.legend-swatch {
		width: 10px;
		height: 3px;
		background: var(--swatch-color);
		border-radius: 2px;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: #ef4444;
		border: 1px solid rgba(10, 10, 10, 0.9);
	}

	.legend-note {
		color: var(--text-muted);
		font-size: 0.52rem;
		letter-spacing: 0.02em;
	}
</style>
