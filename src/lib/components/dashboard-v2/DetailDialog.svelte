<script lang="ts">
	import { onMount, tick, type Snippet } from 'svelte';
	import { overPage } from '$lib/dashboard/page-lock';

	/**
	 * The modal shell for DetailContent (MAPX) and the text system's panels (plan-text-system.md
	 * rule 6): a right-side panel (a sheet on the phone) over an inert, still page. It traps focus,
	 * closes on Esc or its Close button, and hands focus back to whatever opened it without
	 * scrolling; the page's scroll is where it was. The map's docked, non-modal panel is a
	 * separate shell (DetailPanel, MAPX2).
	 */
	let {
		labelledby,
		onclose,
		variant = 'side',
		opener = null,
		children
	}: {
		labelledby: string;
		onclose: () => void;
		/**
		 * The control that opened it, which gets focus back. WebKit doesn't focus a tapped button,
		 * so the focused element can't be trusted to be it; without one, the focused element.
		 */
		opener?: HTMLElement | null;
		/**
		 * 'sheet': /map's phone sheet at full height (MAPX3), rising from the bottom. 'frame': a
		 * camera's frame enlarged, centred; a full-screen sheet on the phone (CAMQUIET1). 'auto': the
		 * text system's panels, a sheet on the phone and a side panel on desktop.
		 */
		variant?: 'side' | 'sheet' | 'frame' | 'auto';
		children: Snippet;
	} = $props();

	let panel: HTMLElement;
	const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

	onMount(() => {
		const back = opener ?? (document.activeElement as HTMLElement | null);
		void tick().then(() => panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus());
		// The opener can leave with the dialog (an advisory that expired while open): then the
		// page root takes focus rather than nothing (Codex #5).
		return () =>
			queueMicrotask(() =>
				(back?.isConnected ? back : document.getElementById('top'))?.focus({
					preventScroll: true
				})
			);
	});

	function onkeydown(e: KeyboardEvent) {
		// A dialog opened from inside this one (an enlarged frame) took the key first.
		if (e.defaultPrevented) return;
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

<!-- In the v2 type scope wherever it is portalled (its roles keep their sizes). -->
<div class="layer dash-v2" data-dialog-layer use:overPage>
	<div class="scrim" aria-hidden="true" onclick={onclose}></div>
	<div
		bind:this={panel}
		class="panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby={labelledby}
		data-variant={variant}
		tabindex="-1"
		{onkeydown}
	>
		<button class="close" type="button" data-text-role="label" onclick={onclose}>Close</button>
		{@render children()}
	</div>
</div>

<style>
	/* The scrollbar's room is kept while the page is locked: nothing beneath shifts sideways. */
	:global(html[data-dialog-open]) {
		scrollbar-gutter: stable;
	}
	/* Each layer its own stack, in opening order: a nested dialog's scrim dims the one beneath. */
	.layer {
		position: fixed;
		inset: 0;
		z-index: 60;
	}
	.scrim {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.45);
	}
	.panel {
		position: fixed;
		inset: 0 0 0 auto;
		width: min(28rem, 100vw);
		overflow-y: auto;
		overscroll-behavior: contain;
		/* Clear of the notch and the home indicator. */
		padding: max(1rem, env(safe-area-inset-top)) max(1.25rem, env(safe-area-inset-right))
			max(1.5rem, env(safe-area-inset-bottom)) 1.25rem;
		border-left: 1px solid var(--border-light);
		background: var(--bg);
		color: var(--text-primary);
	}
	.panel[data-variant='sheet'] {
		/* Its content's height, from the bottom: the map and the ringed pin stay in sight. */
		inset: auto 0 0 0;
		width: auto;
		max-height: 88vh;
		border-top: 1px solid var(--border-light);
		border-left: 0;
		border-radius: 12px 12px 0 0;
		padding-top: 1rem;
		padding-left: max(1.25rem, env(safe-area-inset-left));
	}
	/* 'auto' (the text system's panels): a sheet on the phone, a side panel above it; a media
	   query, so it follows a rotation while open and needs nothing on the server. */
	@media (max-width: 767px) {
		.panel[data-variant='auto'] {
			/* Its content's height, from the bottom: the map and the ringed pin stay in sight. */
			inset: auto 0 0 0;
			width: auto;
			max-height: 88vh;
			border-top: 1px solid var(--border-light);
			border-left: 0;
			border-radius: 12px 12px 0 0;
			padding-top: 1rem;
			padding-left: max(1.25rem, env(safe-area-inset-left));
		}
	}
	.panel[data-variant='frame'] {
		inset: 50% auto auto 50%;
		transform: translate(-50%, -50%);
		width: min(calc(90vw + 2.5rem), 100vw - 1rem);
		max-height: 100vh;
		border: 1px solid var(--border-light);
		border-radius: 8px;
	}
	@media (max-width: 767px) {
		.panel[data-variant='frame'] {
			inset: 0;
			transform: none;
			width: auto;
			border: 0;
			border-radius: 0;
		}
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
