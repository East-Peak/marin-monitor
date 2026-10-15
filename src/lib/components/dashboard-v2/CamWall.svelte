<script lang="ts">
	import { settings } from '$lib/stores/settings';
	import type { CameraConfig } from '$lib/config/cameras';
	import type { TileStatus } from '$lib/components/tv/camera-frame';
	import { stripCameras, stripNotice } from '$lib/dashboard/cam-strip';
	import { camWallGroups } from '$lib/dashboard/cam-wall';
	import { loadFrame } from '$lib/dashboard/cam-frame-loader';
	import CamTile from './CamTile.svelte';

	interface Props {
		now: number;
		cams?: CameraConfig[];
		load?: typeof loadFrame;
	}
	let { now, cams = stripCameras(), load = loadFrame }: Props = $props();

	const groups = $derived(camWallGroups(cams));
	let wall = $state<HTMLElement | null>(null);
	let wallNear = $state(false);
	let pageVisible = $state(
		typeof document === 'undefined' || document.visibilityState !== 'hidden'
	);
	/** Statuses of tiles tried since the wall mounted (proxy writes only: no effect loop). */
	let attempted = $state<Record<string, TileStatus>>({});
	/** Every tile is on screen together, so the wall loads (and judges) them as one. */
	const active = $derived(pageVisible && wallNear);
	const notice = $derived(active ? stripNotice(Object.values(attempted)) : null);

	$effect(() => {
		const onVisibility = () => (pageVisible = document.visibilityState !== 'hidden');
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	// The strip's page observer (Decision 9): tiles load only with the wall within 200 px of view.
	$effect(() => {
		const el = wall;
		if (!el) return;
		if (typeof IntersectionObserver === 'undefined') {
			wallNear = true;
			return;
		}
		const io = new IntersectionObserver(([e]) => (wallNear = e.isIntersecting), {
			rootMargin: '200px 0px'
		});
		io.observe(el);
		return () => {
			io.disconnect();
			wallNear = false;
			attempted = {};
		};
	});
</script>

<section id="cams" class="v2-cam-wall" aria-labelledby="v2-cams-title" data-slot="cam-wall">
	<div class="wall-head">
		<h2 id="v2-cams-title" class="wall-title" data-text-role="section-title">Cameras</h2>
		{#if !$settings.camerasHidden}
			{#if notice}
				<span class="wall-notice" role="status" data-text-role="meta" data-cams-notice
					>{notice === 'all-offline'
						? 'No cameras are loading right now.'
						: 'Cameras not updating right now.'}</span
				>
			{:else}
				<span class="wall-scope" data-text-role="meta">Ridge cams by area, then 101</span>
			{/if}
		{/if}
	</div>
	{#if $settings.camerasHidden}
		<p class="wall-hidden" data-text-role="body">
			Cameras are hidden.
			<button type="button" data-text-role="control" onclick={() => settings.toggleCamerasHidden()}
				>Show cameras</button
			>
		</p>
	{:else}
		<div class="wall" bind:this={wall}>
			{#each groups as g (g.id)}
				<div class="grp" data-cam-group={g.id} data-span={g.span}>
					<h3 class="grp-title" data-text-role="label">{g.label}</h3>
					<ul class="tiles" aria-label="{g.label} cameras">
						{#each g.cams as cam (cam.id)}
							<li data-cam-slot={cam.id}>
								<CamTile {cam} {active} {now} {load} onstatus={(id, s) => (attempted[id] = s)} />
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	/* The mockup's .wall (desktop-v2-mockup.html): a six-column grid of area groups. */
	.v2-cam-wall {
		padding: var(--v2-card-padding) 0;
	}
	.wall-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		margin-bottom: 0.5rem;
	}
	.wall-title {
		margin: 0;
	}
	.wall-scope {
		color: var(--text-muted);
	}
	.wall-notice {
		color: var(--warning, var(--text-primary));
	}
	.wall-hidden {
		margin: 0.5rem 0 0;
	}
	.wall-hidden button {
		padding: 0 0.5rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: transparent;
		color: var(--text-primary);
		font-size: var(--v2-fs-label);
		cursor: pointer;
	}
	.wall {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 18px var(--v2-gap, 14px);
	}
	.grp {
		grid-column: span 2;
		min-width: 0;
	}
	.grp[data-span='4'] {
		grid-column: span 4;
	}
	.grp-title {
		margin: 0 0 6px;
		font-size: var(--v2-fs-label);
		font-weight: 500;
		color: var(--text-secondary, var(--text-primary));
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.grp[data-span='4'] .tiles {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
	/* South Marin's lead camera fills a 2×2 block. */
	/* South Marin's lead camera fills a 2×2 block; out of flow, so the 16:9 tiles beside it
	   set the two rows' heights. */
	.grp[data-span='4'] li:first-child {
		position: relative;
		grid-column: span 2;
		grid-row: span 2;
	}
	.grp[data-span='4'] li:first-child :global(.cam-tile) {
		position: absolute;
		inset: 0;
		aspect-ratio: auto;
	}
	li {
		min-width: 0;
	}
	@media (max-width: 1279px) {
		.wall {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.grp,
		.grp[data-span='4'] {
			grid-column: span 2;
		}
	}
</style>
