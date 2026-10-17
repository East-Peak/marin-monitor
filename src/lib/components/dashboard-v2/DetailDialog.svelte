<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';

	/**
	 * The modal shell for DetailContent (MAPX): a right-side panel that traps focus, closes on
	 * Esc or its Close button, and hands focus back to whatever opened it. The map's docked,
	 * non-modal panel is a separate shell (DetailPanel, MAPX2).
	 */
	let {
		labelledby,
		onclose,
		children
	}: { labelledby: string; onclose: () => void; children: Snippet } = $props();

	let panel: HTMLElement;
	const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

	onMount(() => {
		const opener = document.activeElement as HTMLElement | null;
		void tick().then(() => panel.querySelector<HTMLElement>(FOCUSABLE)?.focus());
		// The opener can leave with the dialog (an advisory that expired while open): then the
		// page root takes focus rather than nothing (Codex #5).
		return () =>
			queueMicrotask(() =>
				(opener?.isConnected ? opener : document.getElementById('top'))?.focus()
			);
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
			return;
		}
		if (e.key !== 'Tab') return;
		const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
</script>

<div class="scrim" aria-hidden="true" onclick={onclose}></div>
<div
	bind:this={panel}
	class="panel"
	role="dialog"
	aria-modal="true"
	aria-labelledby={labelledby}
	tabindex="-1"
	{onkeydown}
>
	<button class="close" type="button" data-text-role="label" onclick={onclose}>Close</button>
	{@render children()}
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgb(0 0 0 / 0.45);
	}
	.panel {
		position: fixed;
		inset: 0 0 0 auto;
		z-index: 61;
		width: min(28rem, 100vw);
		overflow-y: auto;
		padding: 1rem 1.25rem 1.5rem;
		border-left: 1px solid var(--border-light);
		background: var(--bg);
		color: var(--text-primary);
	}
	.panel:focus {
		outline: none;
	}
	.close {
		float: right;
		min-height: 2.75rem;
		padding: 0 0.75rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
	}
	.close:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
