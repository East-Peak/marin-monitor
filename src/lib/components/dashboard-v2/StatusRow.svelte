<script lang="ts">
	import type { StatusRow } from '$lib/dashboard/status-row';

	/**
	 * One status row (plan-text-system.md rule 2; TEXT0 rev B): label above body, a meta line of
	 * provenance and qualifications. A link row is the anchor, ↗ at its trailing edge; a detail
	 * row is the button, › at its trailing edge; a static row does nothing. Nothing interactive
	 * nests inside either.
	 */
	let {
		row,
		onopen = () => {}
	}: {
		row: StatusRow;
		/** A detail row was chosen; `from` is its button, which gets focus back when the panel closes. */
		onopen?: (row: StatusRow & { kind: 'detail' }, from: HTMLElement) => void;
	} = $props();
</script>

{#snippet main()}
	<span class="sr-main">
		{#if row.label || row.chips.length}
			<span class="sr-label" data-text-role="label"
				>{#if row.tone}<span class="sr-dot" data-sr-dot data-tone={row.tone} aria-hidden="true"
					></span>{/if}{#if row.label}<span>{row.label}</span
					>{/if}{#each row.chips as chip (chip)}<span
						class="sr-chip"
						data-sr-chip
						data-text-role="meta">{chip}</span
					>{/each}</span
			>
		{/if}
		<span
			class="sr-body"
			class:sr-clamp={row.clamp}
			class:sr-attention={row.bodyAttention}
			data-attention={row.bodyAttention ? '' : undefined}
			data-text-role="body"
			title={row.original ?? undefined}
			>{#if row.swatch}<i class="sr-swatch" style:background={row.swatch} aria-hidden="true"
				></i>{/if}{row.body}</span
		>
		{#if row.meta.length}
			<span class="sr-meta" data-text-role="meta"
				>{#each row.meta as m, i (i)}{i ? ' · ' : ''}<span class:sr-attention={m.attention}
						>{m.text}</span
					>{/each}</span
			>
		{/if}
	</span>
{/snippet}

{#if row.kind === 'link'}
	<a class="sr sr-action" data-kind="link" href={row.href} target="_blank" rel="noopener noreferrer"
		>{@render main()}<svg class="sr-end" viewBox="0 0 16 16" aria-hidden="true"
			><path d="M5 11l6-6M6 5h5v5" /></svg
		></a
	>
{:else if row.kind === 'detail'}
	<button
		type="button"
		class="sr sr-action"
		data-kind="detail"
		aria-haspopup="dialog"
		onclick={(e) => row.kind === 'detail' && onopen(row, e.currentTarget)}
		>{@render main()}<svg class="sr-end sr-more" viewBox="0 0 16 16" aria-hidden="true"
			><path d="M6 3.5l4.5 4.5L6 12.5" /></svg
		></button
	>
{:else}
	<div class="sr" data-kind="static">{@render main()}</div>
{/if}

<style>
	.sr {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		column-gap: var(--v2-s3);
		padding-block: var(--v2-s1);
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.sr-action {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		width: 100%;
		min-height: 2.75rem;
		margin: 0;
		padding-inline: 0;
		border: 0;
		background: transparent;
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.sr-action:hover {
		background: var(--surface-hover, transparent);
	}
	.sr-action:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.sr-main {
		display: grid;
		min-width: 0;
	}
	.sr-label {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--v2-s1) var(--v2-s2);
		font-weight: 500;
		color: var(--text-secondary, var(--text-primary));
	}
	.sr-chip {
		padding: 0 var(--v2-s2);
		border: 1px solid var(--border-light);
		border-radius: 999px;
		font-weight: 400;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.sr-dot {
		flex: none;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--text-muted);
	}
	.sr-dot[data-tone='closed'],
	.sr-dot[data-tone='major'] {
		background: var(--danger);
	}
	.sr-dot[data-tone='moderate'],
	.sr-dot[data-tone='unknown'] {
		background: var(--warning);
	}
	.sr-body {
		font-weight: 400;
	}
	/* Only a link or detail row clamps: its destination shows the full text (rule 2). */
	.sr-clamp {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}
	.sr-swatch {
		display: inline-block;
		width: 0.6em;
		height: 0.6em;
		margin-right: 0.4em;
		border-radius: 50%;
	}
	.sr-meta {
		color: var(--text-muted);
	}
	.sr-attention {
		color: var(--warning, var(--text-primary));
	}
	.sr-end {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: var(--accent);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.sr-more {
		width: 1.25rem;
		height: 1.25rem;
		stroke: var(--text-muted);
	}
</style>
