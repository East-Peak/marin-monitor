<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The docked, non-modal shell for the map's in-view list and DetailContent (MAPX2): no focus
	 * trap and no scrim, so the map and its controls stay reachable. Collapsible to a tab on the
	 * map's right edge. Esc, wherever focus is, goes back from a detail to the list; a
	 * DetailDialog's Esc wins (it is modal, handles its key first and marks it handled).
	 */
	let {
		label,
		collapsed,
		ontoggle,
		onback,
		children
	}: {
		label: string;
		collapsed: boolean;
		ontoggle: () => void;
		/** Set while a detail is shown: renders "Back" and takes Esc. */
		onback?: () => void;
		children: Snippet;
	} = $props();

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || e.defaultPrevented || !onback) return;
		e.preventDefault();
		onback();
	}
</script>

<svelte:window {onkeydown} />

<aside
	class="panel"
	aria-label={label}
	data-detail-panel
	data-collapsed={collapsed ? 'true' : 'false'}
>
	<div class="bar">
		{#if onback && !collapsed}
			<button type="button" data-text-role="label" onclick={onback}>← Back to list</button>
		{/if}
		<button
			type="button"
			class="toggle"
			aria-expanded={!collapsed}
			data-text-role="label"
			onclick={ontoggle}>{collapsed ? `Show ${label.toLowerCase()}` : 'Hide'}</button
		>
	</div>
	{#if !collapsed}
		<div class="body">{@render children()}</div>
	{/if}
</aside>

<style>
	.panel {
		position: absolute;
		top: 0.5rem;
		right: 3.25rem;
		bottom: 2rem;
		z-index: 20;
		display: flex;
		flex-direction: column;
		width: 360px;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text-primary);
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
	}
	.panel[data-collapsed='true'] {
		bottom: auto;
		width: auto;
	}
	.bar {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		border-bottom: 1px solid var(--border-light);
	}
	.panel[data-collapsed='true'] .bar {
		border-bottom: 0;
	}
	.toggle {
		margin-left: auto;
	}
	button {
		min-height: 2.25rem;
		padding: 0 0.6rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
	}
</style>
