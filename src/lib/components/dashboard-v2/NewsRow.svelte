<!-- One news row: the headline, then "source · age · scope", then (when its feed was only kept)
     that feed's own "not updated since" line. No alert affordance, ever (Decision 10). The caller owns the <li>. -->
<script lang="ts">
	import type { ReportingRow } from '$lib/dashboard/latest-reporting';

	let { row }: { row: ReportingRow } = $props();
</script>

{#if row.link}
	<a
		class="v2-news-title hit-stretch"
		href={row.link}
		target="_blank"
		rel="noopener noreferrer"
		data-text-role="body">{row.title}</a
	>
{:else}
	<span class="v2-news-title" data-text-role="body">{row.title}</span>
{/if}
<p class="v2-news-meta" data-text-role="meta">{row.source} · {row.age} · {row.scope}</p>
{#if row.retained}<p class="v2-news-retained" data-text-role="meta" data-retained>
		{row.retained}
	</p>{/if}

<style>
	.v2-news-title {
		display: block;
		color: var(--text-primary);
		text-decoration: none;
	}
	a.v2-news-title:hover,
	a.v2-news-title:focus-visible {
		text-decoration: underline;
	}
	.v2-news-meta,
	.v2-news-retained {
		margin: 0.125rem 0 0;
		color: var(--text-muted);
	}
</style>
