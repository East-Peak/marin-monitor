<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PanelId } from '$lib/config';

	interface Props {
		id: PanelId | string;
		title: string;
		variant?:
			| 'default'
			| 'local'
			| 'civic'
			| 'safety'
			| 'outdoors'
			| 'housing'
			| 'cycling'
			| 'endurance'
			| 'shows'
			| 'prep'
			| 'farm'
			| 'satire'
			| 'pulse'
			| 'community'
			| '311';
		count?: number | string | null;
		status?: string;
		statusClass?: string;
		loading?: boolean;
		error?: string | null;
		draggable?: boolean;
		collapsible?: boolean;
		collapsed?: boolean;
		onCollapse?: () => void;
		header?: Snippet;
		actions?: Snippet;
		children: Snippet;
	}

	let {
		id,
		title,
		variant = 'default',
		count = null,
		status = '',
		statusClass = '',
		loading = false,
		error = null,
		draggable = true,
		collapsible = false,
		collapsed = false,
		onCollapse,
		header,
		actions,
		children
	}: Props = $props();

	function handleCollapse() {
		if (collapsible && onCollapse) {
			onCollapse();
		}
	}
</script>

<div
	class="panel"
	class:draggable
	class:collapsed
	class:variant-local={variant === 'local'}
	class:variant-civic={variant === 'civic'}
	class:variant-safety={variant === 'safety'}
	class:variant-outdoors={variant === 'outdoors'}
	class:variant-housing={variant === 'housing'}
	class:variant-cycling={variant === 'cycling'}
	class:variant-endurance={variant === 'endurance'}
	class:variant-shows={variant === 'shows'}
	class:variant-prep={variant === 'prep'}
	class:variant-farm={variant === 'farm'}
	class:variant-satire={variant === 'satire'}
	class:variant-pulse={variant === 'pulse'}
	class:variant-community={variant === 'community'}
	class:variant-311={variant === '311'}
	data-panel-id={id}
>
	<div class="panel-header">
		<div class="panel-title-row">
			<h3 class="panel-title">{title}</h3>
			{#if count !== null}
				<span class="panel-count">{count}</span>
			{/if}
			{#if status}
				<span class="panel-status {statusClass}">{status}</span>
			{/if}
			{#if loading}
				<span class="panel-loading"></span>
			{/if}
		</div>

		{#if header}
			{@render header()}
		{/if}

		<div class="panel-actions">
			{#if actions}
				{@render actions()}
			{/if}
			{#if collapsible}
				<button class="panel-collapse-btn" onclick={handleCollapse} aria-label="Toggle panel">
					{collapsed ? '▼' : '▲'}
				</button>
			{/if}
		</div>
	</div>

	<div class="panel-content" class:hidden={collapsed}>
		{#if error}
			<div class="error-msg">{error}</div>
		{:else if loading}
			<div class="loading-msg">Loading...</div>
		{:else}
			{@render children()}
		{/if}
	</div>
</div>

<style>
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-top: 2px solid var(--border-light);
		border-radius: 4px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.panel.draggable {
		cursor: grab;
	}

	.panel.draggable:active {
		cursor: grabbing;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		min-height: 2rem;
	}

	.panel-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.panel-title {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		margin: 0;
	}

	.panel-count {
		font-size: 0.65rem;
		font-weight: 500;
		color: var(--accent);
		background: rgba(var(--accent-rgb), 0.1);
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
	}

	.panel-status {
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		text-transform: uppercase;
	}

	.panel-status.monitoring {
		color: var(--text-secondary);
		background: rgba(255, 255, 255, 0.05);
	}

	.panel-status.elevated {
		color: #ffa500;
		background: rgba(255, 165, 0, 0.15);
	}

	.panel-status.critical {
		color: #ff4444;
		background: rgba(255, 68, 68, 0.15);
	}

	.panel-loading {
		width: 12px;
		height: 12px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.panel-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.panel-collapse-btn {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 0.25rem;
		font-size: 0.5rem;
		line-height: 1;
	}

	.panel-collapse-btn:hover {
		color: var(--text-primary);
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.panel-content.hidden {
		display: none;
	}

	.panel.variant-local {
		border-top-color: #3b82f6;
	}

	.panel.variant-civic {
		border-top-color: #f59e0b;
	}

	.panel.variant-safety {
		border-top-color: #ef4444;
	}

	.panel.variant-outdoors {
		border-top-color: #22c55e;
	}

	.panel.variant-housing {
		border-top-color: #14b8a6;
	}

	.panel.variant-cycling {
		border-top-color: #06b6d4;
	}

	.panel.variant-endurance {
		border-top-color: #84cc16;
	}

	.panel.variant-shows {
		border-top-color: #f97316;
	}

	.panel.variant-prep {
		border-top-color: #6366f1;
	}

	.panel.variant-farm {
		border-top-color: #65a30d;
	}

	.panel.variant-satire {
		border-top-color: #ec4899;
		border-style: dashed;
	}

	.panel.variant-pulse {
		border-top-color: #a78bfa;
	}

	.panel.variant-community {
		border-top-color: #a855f7;
	}

	.panel.variant-311 {
		border-top-color: #ff6b35;
	}

	.panel.variant-community .panel-count {
		color: #a855f7;
		background: rgba(168, 85, 247, 0.14);
	}

	.panel.variant-civic .panel-count {
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.14);
	}

	.panel.variant-safety .panel-count {
		color: #ef4444;
		background: rgba(239, 68, 68, 0.14);
	}

	.panel.variant-outdoors .panel-count {
		color: #22c55e;
		background: rgba(34, 197, 94, 0.14);
	}

	.panel.variant-satire .panel-count {
		color: #ec4899;
		background: rgba(236, 72, 153, 0.15);
	}

	.panel.variant-cycling .panel-count {
		color: #06b6d4;
		background: rgba(6, 182, 212, 0.15);
	}

	.panel.variant-endurance .panel-count {
		color: #84cc16;
		background: rgba(132, 204, 22, 0.16);
	}

	.panel.variant-shows .panel-count {
		color: #f97316;
		background: rgba(249, 115, 22, 0.15);
	}

	.panel.variant-prep .panel-count {
		color: #6366f1;
		background: rgba(99, 102, 241, 0.16);
	}

	.panel.variant-farm .panel-count {
		color: #65a30d;
		background: rgba(101, 163, 13, 0.16);
	}

	.error-msg {
		color: var(--danger);
		text-align: center;
		padding: 1rem;
		font-size: 0.7rem;
	}

	.loading-msg {
		color: var(--text-secondary);
		text-align: center;
		padding: 1rem;
		font-size: 0.7rem;
	}
</style>
