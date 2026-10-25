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
		<SectionStatus status={view.presentation} {now} />
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
	.v2-latest-title {
		margin: 0;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.v2-latest-empty {
		margin: 0.25rem 0 0;
		color: var(--text-muted);
	}
	.v2-latest-list {
		margin: 0.25rem 0 0;
		padding: 0;
		list-style: none;
	}
	.v2-latest-list li {
		padding: var(--v2-card-padding) 0;
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
	/* Touch: its "Which sources" sits 12 px clear of the first story, so both keep a 44 px hit
	   area (MOBILE1). */
	@media (pointer: coarse) {
		.v2-latest :global(.v2-coverage) {
			margin-bottom: 12px;
		}
	}
</style>
