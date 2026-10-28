<script lang="ts">
	import { linkRow, type RowDetail } from '$lib/dashboard/status-row';
	import StatusRow from './StatusRow.svelte';

	/** A detail row's panel: the full words its row may clamp, its meta, and the row's links (rule 2). */
	let { detail, titleId }: { detail: RowDetail; titleId: string } = $props();
	const links = $derived(
		detail.links.map((l, i) =>
			linkRow({ id: `link-${i}`, label: l.label, body: l.body, href: l.href })
		)
	);
</script>

<article class="sd" data-status-detail>
	<h2 id={titleId} class="sd-title" tabindex="-1" data-text-role="section-title">{detail.title}</h2>
	{#each detail.paragraphs as p, i (i)}
		<p class="sd-p" class:sd-lead={i === 0} data-text-role="body">{p}</p>
	{/each}
	{#if detail.meta.length}
		<p class="sd-meta" data-text-role="meta">{detail.meta.join(' · ')}</p>
	{/if}
	{#if links.length}
		<ul class="sd-links">
			{#each links as row (row.id)}<li><StatusRow {row} /></li>{/each}
		</ul>
	{/if}
</article>

<style>
	.sd {
		display: grid;
		gap: var(--v2-s3);
		padding-top: var(--v2-s2);
	}
	.sd-title,
	.sd-p,
	.sd-meta,
	.sd-links {
		margin: 0;
	}
	.sd-title:focus {
		outline: none;
	}
	.sd-p {
		color: var(--text-secondary, var(--text-primary));
	}
	.sd-lead {
		color: var(--text-primary);
	}
	.sd-meta {
		color: var(--text-muted);
	}
	.sd-links {
		display: grid;
		gap: var(--v2-s1);
		padding: 0;
		list-style: none;
	}
</style>
