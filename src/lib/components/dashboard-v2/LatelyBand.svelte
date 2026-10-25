<script lang="ts">
	import { LATELY_LINK, type LatelyView } from '$lib/dashboard/lately';
	import CardSource from './CardSource.svelte';

	let { view, now }: { view: LatelyView; now: number } = $props();
</script>

<!-- Satire, clearly labelled (CLAUDE.md): its own band, never mixed into the news.
     The page renders it only while it has a recent piece (lately.ts). -->
<section class="lately" data-slot="lately" aria-labelledby="lately-title">
	<div class="head">
		<h2 id="lately-title" data-text-role="section-title">Marin Lately</h2>
		<p class="meta" data-text-role="meta">
			Satire. Unconfirmed reports from the county’s least reliable newsroom.
		</p>
		<p class="meta" data-lately-latest data-text-role="meta">
			{view.latest}
			<a class="hit-44" href={LATELY_LINK} target="_blank" rel="noopener">marinlately.com</a>
		</p>
		<CardSource lines={[{ measured: view.source }]} {now} />
	</div>
	<ol>
		{#each view.pieces as p (p.id)}
			<li class="hit-row">
				<a class="hit-stretch" href={p.link} target="_blank" rel="noopener" data-text-role="body"
					>{p.title}</a
				>
				{#if p.summary}
					<p data-text-role="label">{p.summary}</p>
				{/if}
			</li>
		{/each}
	</ol>
</section>

<style>
	/* The approved mockup's `.lately` band (desktop-v2-mockup.html). */
	.lately {
		display: grid;
		grid-template-columns: 1fr;
		gap: 12px 18px;
		padding: 14px 16px;
		border: 1px solid rgba(236, 72, 153, 0.45);
		border-radius: 8px;
		background: linear-gradient(90deg, rgba(236, 72, 153, 0.07), transparent 40%);
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	h2 {
		margin: 0;
		color: var(--pink, #ec4899);
	}
	.meta {
		margin: 0;
		color: var(--text-muted);
	}
	ol {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px 22px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	a {
		color: inherit;
		font-weight: 500;
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	li p {
		margin: 2px 0 0;
		color: var(--text-dim, var(--text-muted));
		font-style: italic;
	}
	@media (min-width: 1024px) {
		.lately {
			grid-template-columns: 16rem 1fr;
		}
		ol {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 1700px) {
		ol {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (min-width: 1024px) and (max-width: 1279px) {
		.lately {
			grid-template-columns: 1fr;
		}
		ol {
			grid-template-columns: 1fr;
		}
	}
</style>
