<script lang="ts">
	import { MapPanel, CamerasPanel, ExpandedCamerasPanel } from '$lib/components/panels';
	import { settings } from '$lib/stores';
	import type { NewsItem } from '$lib/types';
	import type { PanelId } from '$lib/config';

	interface Props {
		earthquakeItems: NewsItem[];
		isPanelVisible: (id: PanelId) => boolean;
	}

	let { earthquakeItems, isPanelVisible }: Props = $props();
</script>

<!-- Top stage: map + cameras -->
<div
	class="top-stage"
	class:map-full-width={$settings.camerasExpanded ||
		$settings.camerasHidden ||
		!isPanelVisible('cameras')}
>
	{#if isPanelVisible('map')}
		<div class="map-slot">
			<MapPanel earthquakes={earthquakeItems} />
		</div>
	{/if}

	{#if isPanelVisible('cameras') && !$settings.camerasExpanded && !$settings.camerasHidden}
		<div class="camera-stage">
			<CamerasPanel />
		</div>
	{/if}
</div>

{#if $settings.camerasExpanded && !$settings.camerasHidden && isPanelVisible('cameras')}
	<div class="expanded-cameras-stage">
		<ExpandedCamerasPanel />
	</div>
{/if}

<!-- Cameras show/hide toggle -->
{#if $settings.camerasHidden && isPanelVisible('cameras')}
	<button class="dash-toggle" onclick={() => settings.toggleCamerasHidden()}>
		<span class="dash-toggle-line"></span>
		<span class="dash-toggle-label">
			Show Cameras
			<span class="dash-toggle-chevron">{'\u25BE'}</span>
		</span>
		<span class="dash-toggle-line"></span>
	</button>
{/if}

<style>
	.top-stage {
		display: grid;
		grid-template-columns: 3fr 1fr;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.top-stage.map-full-width {
		grid-template-columns: 1fr;
	}

	.expanded-cameras-stage {
		margin-bottom: 0.5rem;
	}

	.map-slot,
	.camera-stage {
		min-width: 0;
	}

	.camera-stage :global(.panel-content) {
		max-height: 500px;
		overflow-y: auto;
	}

	.dash-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0;
		border: none;
		background: none;
		cursor: pointer;
		color: var(--text-dim);
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		transition: color 0.2s;
	}

	.dash-toggle:hover {
		color: var(--text-secondary);
	}

	.dash-toggle-line {
		flex: 1;
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
	}

	.dash-toggle-label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
	}

	.dash-toggle-chevron {
		font-size: 0.5rem;
	}

	@media (max-width: 800px) {
		.top-stage {
			grid-template-columns: 1fr;
		}
	}
</style>
