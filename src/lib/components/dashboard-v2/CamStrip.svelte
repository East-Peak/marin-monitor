<script lang="ts">
	import { settings } from '$lib/stores/settings';
	import type { CameraConfig } from '$lib/config/cameras';
	import type { TileStatus } from '$lib/components/tv/camera-frame';
	import { stripCameras, stripNotice } from '$lib/dashboard/cam-strip';
	import { loadFrame } from '$lib/dashboard/cam-frame-loader';
	import CamTile from './CamTile.svelte';
	import type { CamHeadings, HeadingsState } from '$lib/dashboard/cam-headings-store';
	import { headingFooter } from '$lib/dashboard/cam-heading';

	interface Props {
		now: number;
		cams?: CameraConfig[];
		load?: typeof loadFrame;
		/** The cameras' last reported headings (MAPX4), held while the tiles load. */
		headings?: CamHeadings;
	}
	let { now, cams = stripCameras(), load = loadFrame, headings }: Props = $props();

	let headingState = $state<HeadingsState | null>(null);
	$effect(() => headings?.subscribe((s) => (headingState = s)));
	$effect(() => (headings && pageVisible && stripNear ? headings.hold() : undefined));
	const footer = (id: string) => headingFooter(headingState?.read?.cams.find((c) => c.id === id));

	let row = $state<HTMLElement | null>(null);
	let stripNear = $state(false);
	let near = $state<Record<string, boolean>>({});
	let pageVisible = $state(
		typeof document === 'undefined' || document.visibilityState !== 'hidden'
	);
	/** Statuses of tiles tried since this row mounted (proxy writes only: no effect loop). */
	let attempted = $state<Record<string, TileStatus>>({});
	const isActive = (id: string) => pageVisible && stripNear && !!near[id];
	/** Judged on the tiles in view: an abandoned request elsewhere can't hold the notice off (Codex r2 #4). */
	const notice = $derived(
		stripNotice(cams.flatMap((c) => (isActive(c.id) && attempted[c.id] ? [attempted[c.id]] : [])))
	);

	$effect(() => {
		const onVisibility = () => (pageVisible = document.visibilityState !== 'hidden');
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	// Two observers (Decision 9): the strip within 200 px of the viewport, and each tile within
	// a quarter of the row's width of its visible part (on a phone: the shown tile and the peek).
	$effect(() => {
		const el = row;
		if (!el) return;
		if (typeof IntersectionObserver === 'undefined') {
			stripNear = true;
			for (const c of cams) near[c.id] = true;
			return;
		}
		const page = new IntersectionObserver(([e]) => (stripNear = e.isIntersecting), {
			rootMargin: '200px 0px'
		});
		page.observe(el);
		const tiles = new IntersectionObserver(
			(entries) => {
				for (const e of entries)
					near[(e.target as HTMLElement).dataset.camSlot!] = e.isIntersecting;
			},
			{ root: el, rootMargin: '0px 25%' }
		);
		el.querySelectorAll('[data-cam-slot]').forEach((li) => tiles.observe(li));
		return () => {
			page.disconnect();
			tiles.disconnect();
			// A hidden or re-mounted row starts from fresh observations and statuses (Codex r1 #5).
			stripNear = false;
			near = {};
			attempted = {};
		};
	});

	const page = (dir: 1 | -1) => row?.scrollBy({ left: dir * row.clientWidth, behavior: 'smooth' });
</script>

<section id="cams" class="v2-cams" aria-labelledby="v2-cams-title" data-slot="cams">
	<div class="cams-head">
		<h2 id="v2-cams-title" class="cams-title" data-text-role="section-title">Cameras</h2>
		{#if !$settings.camerasHidden}
			<!-- In the heading line: the all-failed notice never changes the strip's height. -->
			{#if notice}
				<span class="cams-notice" role="status" data-text-role="meta" data-cams-notice
					>{notice === 'all-offline'
						? 'No cameras are loading right now.'
						: 'Cameras not updating right now.'}</span
				>
			{:else}
				<span class="cams-scope" data-text-role="meta">Ridge cams, then 101</span>
			{/if}
			<span class="cams-pager" data-cams-pager>
				<button
					type="button"
					aria-label="Earlier cameras"
					data-text-role="control"
					onclick={() => page(-1)}>‹</button
				>
				<button
					type="button"
					aria-label="Next cameras"
					data-text-role="control"
					onclick={() => page(1)}>›</button
				>
			</span>
		{/if}
	</div>
	{#if $settings.camerasHidden}
		<p class="cams-hidden" data-text-role="body">
			Cameras are hidden.
			<button type="button" data-text-role="control" onclick={() => settings.toggleCamerasHidden()}
				>Show cameras</button
			>
		</p>
	{:else}
		<ul class="cams-row" bind:this={row} aria-label="Cameras, swipe for more">
			{#each cams as cam (cam.id)}
				<li data-cam-slot={cam.id}>
					<CamTile
						{cam}
						active={isActive(cam.id)}
						{now}
						{load}
						heading={footer(cam.id)}
						onstatus={(id, s) => (attempted[id] = s)}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	/* Its own padding: DashboardV2's .v2-region rule is component-scoped (Codex r1 #13). */
	.v2-cams {
		padding: var(--v2-card-padding) 0;
	}
	.cams-head {
		display: flex;
		flex-wrap: wrap; /* one line at 100% (Decision 6's cap); wraps at enlarged UI scales (Codex r2 #6) */
		align-items: baseline;
		gap: 0.25rem 0.75rem;
	}
	.cams-title {
		margin: 0;
	}
	.cams-scope {
		color: var(--text-muted);
	}
	.cams-notice {
		color: var(--warning, var(--text-primary));
	}
	.cams-pager {
		margin-left: auto;
		display: flex;
		gap: 0.25rem;
	}
	.cams-pager button,
	.cams-hidden button {
		min-width: 2rem;
		padding: 0 0.5rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: transparent;
		color: var(--text-primary);
		font-size: var(--v2-fs-label);
		cursor: pointer;
	}
	.cams-hidden {
		margin: 0.5rem 0 0;
	}
	.cams-row {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		min-width: 0;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scroll-snap-type: x mandatory;
		scrollbar-width: thin;
	}
	.cams-row > li {
		/* Desktop: five tiles per view (Decision 10). */
		flex: 0 0 calc((100% - 4 * 0.5rem) / 5);
		min-width: 0;
		scroll-snap-align: start;
	}
	@media (max-width: 767px) {
		/* Phone: one tile and a peek of the next (Decision 6). */
		.cams-row > li {
			flex-basis: 78%;
		}
	}
	@media (max-width: 767px), (hover: none) {
		.cams-pager {
			display: none;
		}
	}
</style>
