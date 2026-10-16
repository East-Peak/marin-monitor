<script lang="ts">
	import type { Readable } from 'svelte/store';
	import type { HealthReportJson } from '$lib/api/marin/health-report';
	import { measuredFromEntry } from '$lib/dashboard/measured';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import {
		datasetEntry,
		fromHealthSource,
		type DatasetFetch
	} from '$lib/dashboard/source-adapters';
	import { effectiveState, type SourceEntryState } from '$lib/dashboard/source-status';
	import CardSource from './CardSource.svelte';

	let {
		report,
		outcomes,
		now
	}: {
		report: Readable<HealthReportJson | null>;
		outcomes: Readable<Readonly<Record<string, DatasetFetch>>>;
		now: number;
	} = $props();

	const STATE_LABEL: Record<SourceEntryState, string> = {
		ok: 'current',
		reference: 'reference',
		stale: 'out of date',
		unavailable: 'unavailable',
		unknown: 'unverified',
		loading: 'loading'
	};

	/** The G0a report through its own read: a failed /api/health is unavailable, never "all OK". */
	const read = $derived(
		measuredFromEntry(
			datasetEntry('health', 'Source health', $outcomes.health, null),
			$report,
			'Source health',
			now
		)
	);
	const rows = $derived(
		read.kind === 'value'
			? read.value.sources.map(fromHealthSource).map((e) => ({
					name: e.name,
					state: effectiveState(e, now),
					when: e.observedAt === null ? 'time not reported' : formatAsOf(e.observedAt, now)
				}))
			: []
	);
	const current = $derived(rows.filter((r) => r.state === 'ok' || r.state === 'reference').length);
</script>

<section class="srcs-foot" data-slot="sources-footer" aria-labelledby="sources-title">
	<div class="head">
		<h2 id="sources-title" data-text-role="label">Data sources</h2>
		{#if rows.length}
			<span class="meta" data-text-role="meta">{current} of {rows.length} current</span>
		{/if}
		<CardSource lines={[{ measured: read, untimed: 'times per source below' }]} {now} />
	</div>
	{#if rows.length}
		<ul class="srcs">
			{#each rows as r (r.name)}
				<li data-source-row data-state={r.state} data-text-role="meta">
					<i class="dot {r.state}" aria-hidden="true"></i>
					<span>{r.name}</span>
					<span class="sr-only">: {STATE_LABEL[r.state]}</span>
					<em>{r.when}</em>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	/* The mockup's sources footer: one line per G0a source, its status dot and as-of. */
	.srcs-foot {
		margin-top: 28px;
		padding-top: 12px;
		border-top: 1px solid var(--border-light);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.9rem;
		margin-bottom: 8px;
	}
	h2 {
		margin: 0;
		color: var(--text-secondary);
		font-weight: 500;
	}
	.meta {
		color: var(--text-muted);
	}
	.srcs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 4px 18px;
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--text-dim, var(--text-muted));
	}
	.srcs li {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.srcs em {
		margin-left: auto;
		color: var(--text-muted);
		font-style: normal;
		white-space: nowrap;
	}
	.dot {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--yellow, #f59e0b);
	}
	.dot.ok {
		background: var(--green, #10b981);
	}
	.dot.reference {
		background: var(--text-muted);
	}
	.dot.unavailable {
		background: var(--red, #ef4444);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
