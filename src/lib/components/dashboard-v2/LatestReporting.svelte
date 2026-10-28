<!-- Latest reporting (§2.4): at most 5 dated items; rows exist only inside a value coverage. -->
<script lang="ts">
	import type { LatestReportingView } from '$lib/dashboard/latest-reporting';
	import SectionStatus from './SectionStatus.svelte';
	import NewsRow from './NewsRow.svelte';

	let { view, now }: { view: LatestReportingView; now: number } = $props();
	const rows = $derived(view.coverage.kind === 'value' ? view.coverage.value : []);
</script>

<div class="v2-latest" data-slot="latest-reporting">
	<h3 class="v2-latest-title" data-text-role="label">Latest reporting</h3>
	{#if view.empty}
		<p class="v2-latest-empty" data-text-role="body" data-reporting-empty>{view.empty}</p>
	{:else}
		<SectionStatus status={view.presentation} {now} title="Latest reporting" />
	{/if}
	{#if rows.length}
		<ol class="v2-latest-list">
			{#each rows as row (row.id)}
				<li class="hit-row" data-reporting-row={row.id}><NewsRow {row} /></li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	/* A label names the list (rule 1): one style, no caps (TEXT0 rev B). */
	.v2-latest-title {
		margin: 0;
		font-weight: 600;
		color: var(--text-dim, var(--text-muted));
	}
	.v2-latest-empty {
		margin: var(--v2-s1) 0 0;
		color: var(--text-muted);
	}
	.v2-latest-list {
		margin: var(--v2-s1) 0 0;
		padding: 0;
		list-style: none;
	}
	.v2-latest-list li {
		padding: var(--v2-s2) 0;
		border-bottom: 1px solid var(--border-light);
	}
	.v2-latest-list li:last-child {
		border-bottom: 0;
	}
	@media (min-width: 1024px) {
		/* Under the full-width map (MAPX2): one row of five. */
		.v2-latest-list {
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			gap: var(--v2-gap);
		}
		.v2-latest-list li {
			border-bottom: 0;
		}
	}
</style>
