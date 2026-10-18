<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * /map's phone sheet (MAPX3), non-modal: "peek" shows its summary on a handle, "half" adds the
	 * list. The handle toggles them by tap, ArrowUp/ArrowDown or a vertical swipe. The third state,
	 * an item's detail, is a DetailDialog (modal) over it, owned by the caller.
	 */
	let {
		label,
		summary,
		sheet,
		onsheet,
		children
	}: {
		label: string;
		summary: string;
		sheet: 'peek' | 'half';
		onsheet: (next: 'peek' | 'half') => void;
		children: Snippet;
	} = $props();

	/** A drag shorter than this is a tap. */
	const SWIPE_PX = 30;
	let startY: number | null = null;
	/** The click that follows a swipe's pointerup is not a second toggle. */
	let swiped = false;

	function onpointerdown(e: PointerEvent) {
		startY = e.clientY;
	}
	function onpointerup(e: PointerEvent) {
		if (startY === null) return;
		const dy = e.clientY - startY;
		startY = null;
		if (!Number.isFinite(dy) || Math.abs(dy) < SWIPE_PX) return;
		swiped = true;
		onsheet(dy < 0 ? 'half' : 'peek');
	}
	function onclick() {
		if (swiped) {
			swiped = false;
			return;
		}
		onsheet(sheet === 'half' ? 'peek' : 'half');
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		onsheet(e.key === 'ArrowUp' ? 'half' : 'peek');
	}
</script>

<section class="sheet" aria-label={label} data-sheet={sheet}>
	<button
		type="button"
		class="handle"
		aria-expanded={sheet === 'half'}
		data-sheet-handle
		data-text-role="label"
		{onclick}
		{onkeydown}
		{onpointerdown}
		{onpointerup}
		onpointercancel={() => (startY = null)}
	>
		<span class="grip" aria-hidden="true"></span>
		{summary}
	</button>
	{#if sheet === 'half'}
		<div class="body">{@render children()}</div>
	{/if}
</section>

<style>
	.sheet {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 25;
		display: flex;
		flex-direction: column;
		max-height: 50%;
		border: 1px solid var(--border-light);
		border-bottom: 0;
		border-radius: 12px 12px 0 0;
		background: var(--bg);
		color: var(--text-primary);
		box-shadow: 0 -4px 16px rgb(0 0 0 / 0.25);
	}
	.sheet[data-sheet='half'] {
		height: 50%;
	}
	.handle {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		width: 100%;
		min-height: 3.25rem;
		padding: 0.4rem 1rem 0.6rem;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
		/* The swipe is ours: the page neither scrolls nor zooms under it. */
		touch-action: none;
	}
	.handle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.grip {
		width: 2.5rem;
		height: 0.25rem;
		border-radius: 2px;
		background: var(--border-light);
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0 0.75rem 0.75rem;
	}
</style>
