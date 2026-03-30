<script lang="ts">
	import type { MapFeatureInspectorData } from '$lib/types';

	interface Props {
		feature: MapFeatureInspectorData;
		onClose?: () => void;
	}

	let { feature, onClose }: Props = $props();

	function kindLabel(kind: MapFeatureInspectorData['kind']): string {
		switch (kind) {
			case 'landmark':
				return 'Map Landmark';
			case 'fire-zone':
				return 'Fire Context';
			case 'traffic-event':
				return 'Traffic Event';
			case 'earthquake':
				return 'Earthquake';
			case 'fire-incident':
				return 'Active Fire';
			case 'gas-station':
				return 'Gas Station';
			case 'ev-charging-station':
				return 'EV Charging Station';
			case 'coffee-shop':
				return 'Coffee Shop';
			case 'fitness-studio':
				return 'Fitness Studio';
			case 'airport':
				return 'Airport Status';
			default:
				return 'Map Feature';
		}
	}
</script>

<aside class="feature-inspector" aria-label="Map feature inspector">
	<div class="feature-inspector-header">
		<div class="feature-kicker">{kindLabel(feature.kind)}</div>
		<button
			class="close-btn"
			type="button"
			onclick={() => onClose?.()}
			aria-label="Close inspector"
		>
			&times;
		</button>
	</div>
	<div class="feature-title">{feature.title}</div>
	{#if feature.subtitle}
		<div class="feature-subtitle">{feature.subtitle}</div>
	{/if}
	{#if feature.severity}
		<div class="feature-severity">{feature.severity}</div>
	{/if}
	{#if feature.description}
		<div class="feature-description">{feature.description}</div>
	{/if}
	{#if feature.source}
		<div class="feature-source">{feature.source}</div>
	{/if}
</aside>

<style>
	.feature-inspector {
		position: absolute;
		right: 0.5rem;
		top: 3rem;
		width: min(320px, calc(100% - 1rem));
		background: color-mix(in srgb, var(--surface) 93%, transparent);
		border: 1px solid var(--border-light);
		border-radius: 4px;
		backdrop-filter: blur(6px);
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.3);
		z-index: 30;
		padding: 0.55rem 0.65rem;
	}

	.feature-inspector-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.4rem;
	}

	.feature-kicker {
		font-size: 0.54rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
	}

	.close-btn {
		border: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-dim);
		width: 1.2rem;
		height: 1.2rem;
		font: inherit;
		line-height: 1;
		cursor: pointer;
		border-radius: 3px;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text);
	}

	.feature-title {
		margin-top: 0.25rem;
		color: var(--text);
		font-weight: 700;
		font-size: 0.78rem;
	}

	.feature-subtitle {
		margin-top: 0.2rem;
		color: var(--text-secondary);
		font-size: 0.62rem;
	}

	.feature-severity {
		display: inline-block;
		margin-top: 0.25rem;
		padding: 0.08rem 0.28rem;
		font-size: 0.56rem;
		border-radius: 3px;
		color: #fca5a5;
		border: 1px solid rgba(239, 68, 68, 0.4);
		background: rgba(239, 68, 68, 0.18);
	}

	.feature-description {
		margin-top: 0.3rem;
		color: var(--text-muted);
		font-size: 0.6rem;
		line-height: 1.35;
	}

	.feature-source {
		margin-top: 0.35rem;
		color: var(--text-dim);
		font-size: 0.55rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
</style>
