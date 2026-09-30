<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SectionId } from '$lib/dashboard/section-prefs';
	import type { SectionPresentation } from '$lib/dashboard/source-status';
	import SectionStatus from './SectionStatus.svelte';

	let {
		id,
		title,
		open,
		ontoggle,
		status = null,
		now = Date.now(),
		children
	}: {
		id: SectionId;
		title: string;
		open: boolean;
		ontoggle: (id: SectionId) => void;
		status?: SectionPresentation | null;
		now?: number;
		children: Snippet;
	} = $props();

	const bodyId = $derived(`section-${id}-body`);
</script>

<section
	class="v2-section"
	{id}
	tabindex="-1"
	data-section={id}
	data-open={open ? 'true' : 'false'}
>
	<div class="v2-section-header">
		<h2 class="v2-section-heading">
			<button
				type="button"
				class="v2-section-toggle"
				data-section-toggle={id}
				data-text-role="section-title"
				aria-expanded={open}
				aria-controls={bodyId}
				onclick={() => ontoggle(id)}
			>
				<span class="v2-section-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
				{title}
			</button>
		</h2>
		{#if status}
			<SectionStatus {status} {now} />
		{/if}
	</div>
	<!-- Lazy: the body mounts only while open, so closed sections start no work (§7). -->
	<div class="v2-section-body" id={bodyId} hidden={!open}>
		{#if open}
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
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
	}
	.v2-section-heading {
		margin: 0;
		font: inherit;
	}
	.v2-section-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
		text-align: left;
	}
	.v2-section-toggle:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.v2-section-body {
		padding-top: var(--v2-card-padding);
	}
</style>
