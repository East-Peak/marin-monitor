<script lang="ts" module>
	/** Any item's detail (MAPX): its own words and a link to its source, never more than we hold. */
	export interface Detail {
		title: string;
		/** Short facts under the title, e.g. scope and end time. */
		meta: string[];
		image?: { src: string; alt: string } | null;
		/** The source's text as we hold it (an excerpt, or NWS's own text). */
		paragraphs: string[];
		/** What to say when the source gave no text. */
		empty?: string;
		source: { label: string; href: string } | null;
	}
</script>

<script lang="ts">
	let { detail, titleId }: { detail: Detail; titleId: string } = $props();
</script>

<article class="detail" data-detail>
	<h2 id={titleId} class="title" tabindex="-1" data-text-role="section-title">{detail.title}</h2>
	{#if detail.meta.length}
		<p class="muted" data-text-role="meta">{detail.meta.join(' · ')}</p>
	{/if}
	{#if detail.image}
		<img src={detail.image.src} alt={detail.image.alt} loading="lazy" />
	{/if}
	{#each detail.paragraphs as p, i (i)}
		<p class="para" data-text-role="body">{p}</p>
	{:else}
		<p class="muted" data-text-role="body">{detail.empty ?? 'No text from the source.'}</p>
	{/each}
	{#if detail.source}
		<a href={detail.source.href} target="_blank" rel="noopener" data-text-role="label"
			>{detail.source.label} ↗</a
		>
	{/if}
</article>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.title,
	.detail p {
		margin: 0;
	}
	.muted {
		color: var(--text-muted);
	}
	.para {
		white-space: pre-line;
	}
	img {
		max-width: 100%;
		border-radius: 6px;
	}
	a {
		color: var(--accent);
	}
</style>
