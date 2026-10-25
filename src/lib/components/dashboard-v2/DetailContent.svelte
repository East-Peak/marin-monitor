<script lang="ts" module>
	/** Any item's detail (MAPX): its own words and a link to its source, never more than we hold. */
	export interface Detail {
		title: string;
		/** Short facts under the title, e.g. scope and end time. */
		meta: string[];
		/** A line under the meta saying what isn't shown and why (CAMQUIET1: a camera's wedge). */
		status?: string;
		/** A camera's id: its Enlarge opens the camera viewer where the page offers one (CAMVIEW1). */
		camera?: string;
		/** `refreshS`: a live frame, reloaded that often while shown (MAPX4's cameras). */
		image?: { src: string; alt: string; refreshS?: number } | null;
		/** The source's text as we hold it (an excerpt, or NWS's own text). */
		paragraphs: string[];
		/** What to say when the source gave no text. */
		empty?: string;
		source: { label: string; href: string } | null;
	}
</script>

<script lang="ts">
	import { getContext } from 'svelte';
	import DetailDialog from './DetailDialog.svelte';
	import { camViewerOpen } from '$lib/dashboard/cam-viewer-open';
	import { CAM_VIEWER_CONTEXT, type CamViewerContext } from '$lib/dashboard/cam-viewer';

	let { detail, titleId }: { detail: Detail; titleId: string } = $props();

	let loadedAt = $state(Date.now());
	$effect(() => {
		const every = detail.image?.refreshS;
		// Under the camera viewer the preview pauses: the viewer refreshes its own frame.
		if (!every || $camViewerOpen) return;
		loadedAt = Date.now();
		const timer = setInterval(() => (loadedAt = Date.now()), every * 1000);
		return () => clearInterval(timer);
	});
	/** The shown src failed to load; a new src (the next refresh) clears it. */
	let failedSrc = $state<string | null>(null);
	const imageSrc = $derived(
		detail.image?.refreshS ? `${detail.image.src}?t=${loadedAt}` : detail.image?.src
	);

	// CAMQUIET1: the frame here is a preview; it opens whole, as large as the screen allows.
	let enlarged = $state(false);
	let frameButton = $state<HTMLButtonElement | null>(null);
	/** The enlarged view's own failed src, as the preview's. */
	let bigFailedSrc = $state<string | null>(null);
	/** The map's camera viewer (CAMVIEW1), where this detail sits on one. */
	const viewer = getContext<CamViewerContext | undefined>(CAM_VIEWER_CONTEXT);
	function enlarge() {
		// Esc and Close hand focus back to the frame (a click doesn't focus a button everywhere).
		frameButton?.focus();
		if (detail.camera && viewer) return viewer.open(detail.camera);
		enlarged = true;
	}
	/** Over the page, not inside the docked panel's stacking context. */
	function toBody(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
</script>

<article class="detail" data-detail>
	<h2 id={titleId} class="title" tabindex="-1" data-text-role="section-title">{detail.title}</h2>
	{#if detail.meta.length}
		<p class="muted" data-text-role="meta">{detail.meta.join(' · ')}</p>
	{/if}
	{#if detail.status}
		<p class="muted" data-detail-status data-text-role="meta">{detail.status}</p>
	{/if}
	{#if detail.image}
		<button
			bind:this={frameButton}
			type="button"
			class="frame"
			aria-label={`Enlarge: ${detail.image.alt}`}
			data-frame-enlarge
			onclick={enlarge}
		>
			<img
				src={imageSrc}
				alt=""
				loading={detail.image.refreshS ? 'eager' : 'lazy'}
				hidden={failedSrc === imageSrc}
				onerror={() => (failedSrc = imageSrc ?? null)}
			/>
			<span class="enlarge" data-text-role="label">Enlarge</span>
		</button>
		{#if failedSrc === imageSrc}
			<p class="muted" data-text-role="meta">Latest frame unavailable</p>
		{/if}
		{#if enlarged}
			<div use:toBody>
				<DetailDialog
					labelledby={`${titleId}-enlarged`}
					onclose={() => (enlarged = false)}
					variant="frame"
				>
					<figure class="enlarged" data-frame-enlarged>
						<!-- Not rendered while failed: `display: block` would beat `hidden` (Codex
						     CAMQUIET1 #2). The next refresh's src tries again. -->
						{#if bigFailedSrc === imageSrc}
							<p class="unavailable" data-text-role="body">Frame unavailable</p>
						{:else}
							<img
								src={imageSrc}
								alt={detail.image.alt}
								onerror={() => (bigFailedSrc = imageSrc ?? null)}
							/>
						{/if}
						<figcaption>
							<h2 id={`${titleId}-enlarged`} class="title" data-text-role="section-title">
								{detail.title}
							</h2>
							{#if detail.meta.length}
								<p class="muted" data-text-role="meta">{detail.meta.join(' · ')}</p>
							{/if}
						</figcaption>
					</figure>
				</DetailDialog>
			</div>
		{/if}
	{/if}
	{#each detail.paragraphs as p, i (i)}
		<p class="para" data-text-role="body">{p}</p>
	{:else}
		<p class="muted" data-text-role="body">{detail.empty ?? 'No text from the source.'}</p>
	{/each}
	{#if detail.source}
		<a
			class="hit-44"
			href={detail.source.href}
			target="_blank"
			rel="noopener"
			data-text-role="label">{detail.source.label} ↗</a
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
	/* Square corners: a rounded clip trims a camera frame's corners (CAMBAR1). */
	img {
		max-width: 100%;
	}
	.frame {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		cursor: zoom-in;
	}
	.frame:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	/* The whole frame at its own aspect, as large as fits: ~90vw × 80vh, room left for the
	   Close row and the caption below. Clear of the floated Close button (CAMBAR1). */
	.enlarged {
		clear: both;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		padding-top: 0.5rem;
	}
	.enlarged img {
		display: block;
		max-height: min(80vh, 100vh - 12rem);
	}
	.enlarged figcaption {
		align-self: stretch;
	}
	.unavailable {
		margin: 0;
		padding: 3rem 0;
		color: var(--text-muted);
	}
	a {
		color: var(--accent);
	}
</style>
