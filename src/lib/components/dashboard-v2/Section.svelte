<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import type { SectionId } from '$lib/dashboard/section-prefs';
	import type { SectionPresentation } from '$lib/dashboard/source-status';
	import { holdStill } from '$lib/dashboard/hold-still';
	import SectionStatus from './SectionStatus.svelte';

	let {
		id,
		title,
		open,
		ontoggle,
		status = null,
		meta = null,
		now = Date.now(),
		collapsible = true,
		class: className = '',
		children
	}: {
		id: SectionId;
		title: string;
		open: boolean;
		ontoggle: (id: SectionId) => void;
		status?: SectionPresentation | null;
		/** The header's quiet count (e.g. "9 of 10 feeds OK"), inside its button. */
		meta?: string | null;
		now?: number;
		/** False on desktop: a plain heading over an always-mounted body (no disclosure). */
		collapsible?: boolean;
		/** Grid placement from the owner (e.g. a span class). */
		class?: string;
		children: Snippet;
	} = $props();

	const bodyId = $derived(`section-${id}-body`);
	const shown = $derived(open || !collapsible);
	let header: HTMLElement;
	let release: (() => void) | null = null;
	function toggle() {
		release?.();
		release = holdStill(header);
		ontoggle(id);
	}
	onDestroy(() => release?.());
</script>

<section
	class="v2-section {className}"
	{id}
	tabindex="-1"
	data-section={id}
	data-open={shown ? 'true' : 'false'}
>
	<div class="v2-section-header" bind:this={header}>
		<!-- One full-width row (rule 5): title, a quiet count, a chevron at the trailing edge. -->
		<h2 class="v2-section-heading">
			{#if !collapsible}
				<span class="v2-section-row">
					<span class="v2-section-title" data-text-role="section-title">{title}</span>
					{#if meta}<span class="v2-section-count" data-section-meta data-text-role="meta"
							>{meta}</span
						>{/if}
				</span>
			{:else}
				<button
					type="button"
					class="v2-section-row v2-section-toggle"
					data-section-toggle={id}
					aria-expanded={open}
					aria-controls={bodyId}
					onclick={toggle}
				>
					<span class="v2-section-title" data-text-role="section-title">{title}</span>
					{#if meta}<span class="v2-section-count" data-section-meta data-text-role="meta"
							>{meta}</span
						>{/if}
					<svg class="v2-section-chevron" viewBox="0 0 20 20" aria-hidden="true"
						><path d="M5 7.5l5 5 5-5" /></svg
					>
				</button>
			{/if}
		</h2>
		<!-- Coverage sits outside the header button (rule 5) and stays visible (rule 6). -->
		{#if status}
			<SectionStatus {status} {now} {title} />
		{/if}
	</div>
	<!-- Lazy: the body mounts only while open, so closed sections start no work (§7). -->
	<div class="v2-section-body" id={bodyId} hidden={!shown}>
		{#if shown}
			{@render children()}
		{/if}
	</div>
</section>

<style>
	.v2-section {
		border-top: 1px solid var(--border-light);
		padding: var(--v2-card-padding) 0;
	}
	.v2-section:focus {
		outline: none;
	}
	.v2-section-header {
		display: grid;
		gap: 0;
	}
	.v2-section-heading {
		margin: 0;
		font: inherit;
	}
	.v2-section-row {
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: var(--v2-s3);
		width: 100%;
		min-height: 2.75rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		text-align: left;
	}
	.v2-section-toggle {
		cursor: pointer;
	}
	.v2-section-toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.v2-section-title {
		flex: none;
	}
	.v2-section-count {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		color: var(--text-muted);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.v2-section-chevron {
		flex: none;
		width: 1.25rem;
		height: 1.25rem;
		margin-left: auto;
		fill: none;
		stroke: var(--text-muted);
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform 160ms ease;
	}
	[aria-expanded='true'] > .v2-section-chevron {
		transform: rotate(180deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.v2-section-chevron {
			transition: none;
		}
	}
	.v2-section-body {
		padding-top: var(--v2-card-padding);
	}
</style>
