<script lang="ts">
	import {
		effectiveState,
		sourceWords,
		type SourceStatusEntry
	} from '$lib/dashboard/source-status';
	import { staticRow } from '$lib/dashboard/status-row';
	import StatusRow from './StatusRow.svelte';

	/**
	 * Every source of a section (or of the site) with its state and time, in reader words: the
	 * Coverage details and source health dialogs (plan-text-system.md rules 6, 7). Those needing
	 * a look come first; diagnostics never show.
	 */
	let {
		entries,
		now,
		title,
		titleId,
		note = null
	}: {
		entries: readonly SourceStatusEntry[];
		now: number;
		title: string;
		titleId: string;
		/** A qualification on the whole list (a report that couldn't be refreshed), in the status colour. */
		note?: string | null;
	} = $props();

	const rows = $derived(
		entries.map((e) => {
			const w = sourceWords(e, now);
			return {
				attention: w.attention,
				row: staticRow({
					id: e.id,
					label: e.name,
					body: w.body,
					bodyAttention: w.attention,
					meta: [w.meta]
				})
			};
		})
	);
	const reporting = $derived(
		entries.filter((e) => ['ok', 'reference'].includes(effectiveState(e, now))).length
	);
	const groups = $derived(
		[
			{ name: 'Needs a look', rows: rows.filter((r) => r.attention) },
			{ name: 'Reporting', rows: rows.filter((r) => !r.attention) }
		].filter((g) => g.rows.length)
	);
</script>

<article class="sl" data-source-list>
	<h2 id={titleId} class="sl-title" tabindex="-1" data-text-role="section-title">{title}</h2>
	<p class="sl-sum" data-text-role="meta">
		{reporting} of {entries.length} source{entries.length === 1 ? '' : 's'} reporting
	</p>
	{#if note}
		<p class="sl-note" data-source-note data-attention data-text-role="meta">{note}</p>
	{/if}
	{#each groups as g (g.name)}
		<section class="sl-group" data-source-group={g.name}>
			<h3 class="sl-group-title" data-text-role="label">{g.name}</h3>
			<ul class="sl-rows">
				{#each g.rows as { row } (row.id)}<li data-source={row.id}><StatusRow {row} /></li>{/each}
			</ul>
		</section>
	{/each}
</article>

<style>
	.sl {
		display: grid;
		gap: var(--v2-s3);
		padding-top: var(--v2-s2);
	}
	.sl-title,
	.sl-sum,
	.sl-group-title,
	.sl-rows {
		margin: 0;
	}
	.sl-title:focus {
		outline: none;
	}
	.sl-sum {
		color: var(--text-muted);
	}
	.sl-note {
		margin: 0;
		color: var(--warning, var(--text-primary));
	}
	.sl-group {
		display: grid;
		gap: var(--v2-s1);
	}
	.sl-group-title {
		padding-bottom: var(--v2-s1);
		border-bottom: 1px solid var(--border);
		font-weight: 500;
		color: var(--text-muted);
	}
	.sl-rows {
		display: grid;
		gap: var(--v2-s1);
		padding: 0;
		list-style: none;
	}
</style>
