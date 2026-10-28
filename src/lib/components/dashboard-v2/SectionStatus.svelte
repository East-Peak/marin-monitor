<script lang="ts">
	import { describePresentation, type SectionPresentation } from '$lib/dashboard/source-status';
	import DetailDialog from './DetailDialog.svelte';
	import SourceList from './SourceList.svelte';

	/**
	 * A section's coverage line, always visible beside its content, and "Coverage details": a
	 * dialog listing every source of the section with its state and time (plan-text-system.md
	 * rule 6). Nothing opens in place, so the page never moves.
	 */
	let { status, now, title }: { status: SectionPresentation; now: number; title: string } =
		$props();
	const text = $derived(describePresentation(status, now));
	let open = $state(false);
	let button = $state<HTMLButtonElement | null>(null);
	const titleId = $derived(`v2-coverage-${title.replace(/\W+/g, '-').toLowerCase()}`);
</script>

{#if text}
	<p class="v2-coverage-line" data-text-role="meta">
		<span class="v2-section-status" data-section-status={status.state}>{text}</span>
		{#if status.failing.length}
			<button
				bind:this={button}
				type="button"
				class="v2-coverage-button hit-44"
				data-coverage-details
				aria-haspopup="dialog"
				onclick={() => (open = true)}>Coverage details</button
			>
		{/if}
	</p>
	{#if open}
		<DetailDialog
			labelledby={titleId}
			variant="auto"
			opener={button}
			onclose={() => (open = false)}
		>
			<SourceList entries={status.entries} {now} title="{title} sources" {titleId} />
		</DetailDialog>
	{/if}
{/if}

<style>
	.v2-coverage-line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--v2-s2);
		margin: 0;
	}
	.v2-section-status {
		color: var(--text-muted);
	}
	.v2-section-status[data-section-status='unavailable'],
	.v2-section-status[data-section-status='partial'] {
		color: var(--warning, var(--text-primary));
	}
	.v2-coverage-button {
		/* Its padded hit area sits over the edge of a stretched row below it (Latest reporting's
		   first story) rather than under it: no height is added to keep them apart. */
		position: relative;
		z-index: 1;
		padding: 0;
		border: 0;
		background: transparent;
		font: inherit;
		color: var(--accent);
		cursor: pointer;
	}
	.v2-coverage-button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
