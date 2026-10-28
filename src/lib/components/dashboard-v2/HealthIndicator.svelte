<script lang="ts">
	import type { Readable } from 'svelte/store';
	import type { HealthReportJson } from '$lib/api/marin/health-report';
	import { summarizeHealth } from '$lib/dashboard/health-summary';
	import type { DatasetFetch } from '$lib/dashboard/source-adapters';
	import DetailDialog from './DetailDialog.svelte';
	import SourceList from './SourceList.svelte';

	let {
		report,
		outcomes,
		now
	}: {
		report: Readable<HealthReportJson | null>;
		outcomes: Readable<Readonly<Record<string, DatasetFetch>>>;
		now: Readable<number>;
	} = $props();

	let open = $state(false);
	let button = $state<HTMLButtonElement | null>(null);
	const summary = $derived(summarizeHealth($report, $outcomes.health, $now));
	/** What the list alone can't say: a kept report, or one degraded with nothing listed. */
	const note = $derived(
		summary.state === 'unknown' || (summary.state === 'degraded' && !summary.degraded.length)
			? summary.label
			: null
	);
</script>

<!-- The same dialog as Coverage details, for every monitored source (TEXT0 inventory). -->
<div class="v2-health" data-health={summary.state}>
	<button
		bind:this={button}
		type="button"
		class="v2-health-button hit-44"
		data-text-role="label"
		aria-haspopup="dialog"
		onclick={() => (open = true)}
	>
		{summary.label}
	</button>
</div>
{#if open}
	<DetailDialog
		labelledby="v2-health-title"
		variant="auto"
		opener={button}
		onclose={() => (open = false)}
	>
		{#if summary.all.length}
			<SourceList
				entries={summary.all}
				now={$now}
				title="Source health"
				titleId="v2-health-title"
				{note}
			/>
		{:else}
			<h2 id="v2-health-title" class="v2-health-title" data-text-role="section-title">
				Source health
			</h2>
			<p class="v2-health-note" data-text-role="meta">{summary.label}</p>
		{/if}
	</DetailDialog>
{/if}

<style>
	.v2-health-button {
		min-height: 2.25rem;
		padding: 0 0.625rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
	}
	.v2-health[data-health='degraded'] .v2-health-button,
	.v2-health[data-health='unknown'] .v2-health-button {
		border-color: var(--warning, var(--accent));
	}
	.v2-health-title,
	.v2-health-note {
		margin: 0;
		padding-top: var(--v2-s2);
	}
	.v2-health-note {
		color: var(--text-muted);
	}
</style>
