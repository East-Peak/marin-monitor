<!-- The camera viewer (CAMVIEW1): one camera's full frame, whole and uncovered, with a corner
     map of where it looks and a strip of the sequence. ← → step, ↑ ↓ jump an area, Esc closes;
     on a phone the frame takes swipes. Lazy-loaded on first open; the host owns the URL. -->
<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import type { Action } from 'svelte/action';
	import {
		areaJump,
		camPosition,
		frameTimeLine,
		headingLines,
		sequenceAreas,
		stepIndex,
		type SequenceItem
	} from '$lib/dashboard/cam-viewer';
	import {
		ANCHORS,
		MARIN_BOUNDS,
		anchorLabel,
		createProjection,
		outlinePaths,
		pathOf,
		viewerCone
	} from '$lib/dashboard/cam-viewer-map';
	import { createFrameWindow } from '$lib/dashboard/cam-frame-window';
	import { loadFrame } from '$lib/dashboard/cam-frame-loader';
	import { STRIP_REFRESH_S, STRIP_RETRY_S } from '$lib/dashboard/cam-strip';
	import { camThumbs, type ThumbRegistry } from '$lib/dashboard/cam-thumbs';
	import type { CamHeadings, HeadingsState } from '$lib/dashboard/cam-headings-store';

	interface Props {
		seq: SequenceItem[];
		id: string;
		now: number;
		headings?: CamHeadings;
		onstep: (id: string) => void;
		onclose: () => void;
		load?: typeof loadFrame;
		thumbs?: ThumbRegistry;
	}
	let {
		seq,
		id,
		now,
		headings,
		onstep,
		onclose,
		load = loadFrame,
		thumbs = camThumbs
	}: Props = $props();

	const index = $derived(
		Math.max(
			0,
			seq.findIndex((s) => s.cam.id === id)
		)
	);
	const item = $derived(seq[index]);
	const cam = $derived(item.cam);
	const areas = $derived(sequenceAreas(seq));
	const fromAlertCalifornia = $derived(/\.alertcalifornia\.org\//.test(cam.url));

	// Full frames: the current camera and its neighbours, nothing more (cam-frame-window).
	let version = $state(0);
	const frames = createFrameWindow({
		load: (...args) => load(...args),
		refreshS: STRIP_REFRESH_S,
		onchange: () => version++
	});
	$effect(() => {
		const near = [seq[index], seq[index - 1], seq[index + 1]].filter(Boolean).map((s) => s.cam);
		untrack(() => frames.focus(near));
	});
	const slot = $derived((void version, frames.slot(cam.id)));
	const timeLine = $derived(frameTimeLine(slot, now));

	// The open frame refreshes on the wall's cadence, only while the page is visible: the
	// window asks again once the cadence moves on, so a 10 s tick is one request a minute.
	let pageVisible = $state(document.visibilityState !== 'hidden');
	$effect(() => {
		const onVisibility = () => {
			pageVisible = document.visibilityState !== 'hidden';
			if (pageVisible) frames.refresh();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});
	$effect(() => {
		if (!pageVisible) return;
		const timer = setInterval(() => frames.refresh(), STRIP_RETRY_S * 1000);
		return () => clearInterval(timer);
	});
	onDestroy(() => frames.dispose());

	// Headings, held while open; a failed read clears them (cam-headings-store).
	let headingState = $state<HeadingsState | null>(null);
	$effect(() => headings?.subscribe((s) => (headingState = s)));
	$effect(() => headings?.hold());
	const headingOf = (camId: string) =>
		headingState?.state === 'ok' ? headingState.read?.cams.find((c) => c.id === camId) : undefined;
	const lines = $derived(headingLines(cam, headingState, now));

	// The strip's thumbnails: only those already loaded on the page, retained while open.
	let thumbSrc = $state<Record<string, string>>({});
	const held = new Map<string, () => void>();
	$effect(() =>
		thumbs.subscribe(() => {
			for (const s of untrack(() => seq)) {
				if (held.has(s.cam.id)) continue;
				const got = thumbs.retain(s.cam.id);
				if (!got) continue;
				held.set(s.cam.id, got.release);
				thumbSrc[s.cam.id] = got.src;
			}
		})
	);
	onDestroy(() => held.forEach((release) => release()));

	// The corner map.
	const proj = createProjection(MARIN_BOUNDS, 240, 8);
	const outline = outlinePaths(proj);
	const cone = $derived(viewerCone(cam, headingOf(cam.id), now, proj));
	const dots = $derived(
		seq.flatMap((s) => {
			const at = camPosition(s.cam);
			return at ? [{ id: s.cam.id, at: proj.project(at) }] : [];
		})
	);
	/** The sequence's other traffic cams keep their approximate road cones, faint, as the map does. */
	const roadCones = $derived(
		seq.flatMap((s) => {
			if (s.cam.id === cam.id || s.cam.category !== 'traffic') return [];
			const c = viewerCone(s.cam, undefined, now, proj);
			return c.style ? [{ id: s.cam.id, d: pathOf(c.points) }] : [];
		})
	);
	const here = $derived(dots.find((d) => d.id === cam.id) ?? null);
	let mapShown = $state(false);

	function go(dir: 1 | -1) {
		const j = stepIndex(seq.length, index, dir);
		if (j !== index) onstep(seq[j].cam.id);
	}
	function jump(dir: 1 | -1) {
		const j = areaJump(seq, index, dir);
		if (j !== index) onstep(seq[j].cam.id);
	}

	let root = $state<HTMLElement | null>(null);
	const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
	/** The viewer's keys stop here: never the map's panning, Back or deselection. */
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') go(e.key === 'ArrowRight' ? 1 : -1);
		else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') jump(e.key === 'ArrowDown' ? 1 : -1);
		else if (e.key === 'Escape') onclose();
		else if (e.key === 'Tab') {
			e.stopPropagation();
			const items = [...root!.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
				(el) => el.offsetParent !== null
			);
			const first = items[0];
			const last = items.at(-1);
			const at = document.activeElement;
			if (e.shiftKey && (at === first || at === root)) last?.focus();
			else if (!e.shiftKey && at === last) first?.focus();
			else return;
			e.preventDefault();
			return;
		} else return;
		e.preventDefault();
		e.stopPropagation();
	}

	// A phone's swipe, on the frame only: sideways steps, downward closes.
	let swipe: { x: number; y: number; pointer: number } | null = null;
	function onpointerdown(e: PointerEvent) {
		swipe = { x: e.clientX, y: e.clientY, pointer: e.pointerId };
	}
	function onpointerup(e: PointerEvent) {
		if (!swipe || e.pointerId !== swipe.pointer) return;
		const dx = e.clientX - swipe.x;
		const dy = e.clientY - swipe.y;
		swipe = null;
		if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
		else if (dy > 80 && dy > 1.5 * Math.abs(dx)) onclose();
	}

	/** Over the page, the rest of it inert and still. */
	const modal: Action<HTMLElement> = (node) => {
		document.body.appendChild(node);
		const others = [...document.body.children].filter(
			(el) => el !== node && !el.hasAttribute('inert')
		);
		for (const el of others) el.setAttribute('inert', '');
		const html = document.documentElement;
		const overflow = html.style.overflow;
		html.style.overflow = 'hidden';
		node.focus();
		return {
			destroy() {
				for (const el of others) el.removeAttribute('inert');
				html.style.overflow = overflow;
				node.remove();
			}
		};
	};

	const showFrame: Action<HTMLElement, HTMLImageElement> = (host, img) => {
		const mount = (frame: HTMLImageElement) => {
			frame.alt = `Latest frame from ${cam.name}`;
			frame.className = 'viewer-img';
			host.replaceChildren(frame);
		};
		mount(img);
		return { update: mount, destroy: () => host.replaceChildren() };
	};

	let strip = $state<HTMLElement | null>(null);
	$effect(() => {
		void index;
		void tick().then(() =>
			strip
				?.querySelector('[aria-current="true"]')
				?.scrollIntoView({ block: 'nearest', inline: 'center' })
		);
	});
</script>

<div
	class="viewer"
	use:modal
	bind:this={root}
	role="dialog"
	aria-modal="true"
	aria-labelledby="cam-viewer-title"
	tabindex="-1"
	data-cam-viewer
	data-camera-id={cam.id}
	{onkeydown}
>
	<header class="top">
		<h2 id="cam-viewer-title" class="name" data-text-role="section-title">{cam.name}</h2>
		<span class="area" data-text-role="meta">{item.area}</span>
		<p class="live" aria-live="polite" data-cam-viewer-live>
			{cam.name}, {index + 1} of {seq.length}
		</p>
		<button class="btn close" type="button" data-text-role="control" onclick={onclose}>Close</button
		>
	</header>

	<!-- CAMBAR1: the frame shows whole and nothing of ours sits on any part of it. -->
	<div
		class="stage"
		data-cam-viewer-frame
		role="presentation"
		{onpointerdown}
		{onpointerup}
		onpointercancel={() => (swipe = null)}
	>
		{#if slot.frame}
			<div class="pic" use:showFrame={slot.frame.img}></div>
		{:else}
			<p class="state" data-text-role="body" data-cam-viewer-state>{timeLine.text}</p>
		{/if}
	</div>

	<div class="controls">
		{#if seq.length > 1}
			<button
				class="btn step"
				type="button"
				aria-label="Previous camera"
				data-text-role="control"
				aria-disabled={index === 0}
				onclick={() => go(-1)}>‹</button
			>
		{/if}
		<span class="count" data-text-role="meta">{index + 1} / {seq.length}</span>
		<button
			class="btn map-toggle"
			type="button"
			aria-expanded={mapShown}
			aria-controls="cam-viewer-map"
			data-text-role="control"
			onclick={() => (mapShown = !mapShown)}>{mapShown ? 'Hide map' : 'Map'}</button
		>
		{#if seq.length > 1}
			<button
				class="btn step"
				type="button"
				aria-label="Next camera"
				data-text-role="control"
				aria-disabled={index === seq.length - 1}
				onclick={() => go(1)}>›</button
			>
		{/if}
	</div>

	<aside class="side">
		<figure
			class="corner"
			id="cam-viewer-map"
			data-shown={mapShown ? 'true' : undefined}
			data-cam-viewer-map
			data-cone={cone.style ?? 'none'}
		>
			<svg
				viewBox="0 0 {proj.width} {proj.height.toFixed(0)}"
				role="img"
				aria-label="Map of Marin: {cam.name}{cone.style
					? cone.style === 'approximate'
						? ', facing its road (approximate)'
						: ', with its direction of view'
					: ''}"
			>
				{#each outline as d, i (i)}<path class="land" {d} />{/each}
				{#each roadCones as c (c.id)}<path class="cone faint" d={c.d} />{/each}
				{#if cone.style}
					<path class="cone" data-style={cone.style} d={pathOf(cone.points)} />
				{/if}
				{#each ANCHORS as a (a.name)}
					{@const [x, y] = proj.project(a.at)}
					{@const label = anchorLabel(a, proj)}
					<circle class="anchor" cx={x} cy={y} r="1.5" />
					<text class="anchor-name" x={label.x} y={label.y} text-anchor={label.anchor}
						>{a.name}</text
					>
				{/each}
				{#each dots as d (d.id)}
					{#if d.id !== cam.id}<circle class="dot" cx={d.at[0]} cy={d.at[1]} r="2.5" />{/if}
				{/each}
				{#if here}
					<circle class="dot here" cx={here.at[0]} cy={here.at[1]} r="4" />
				{/if}
			</svg>
			<figcaption class="key" data-text-role="meta">
				{#if cone.style}
					Cone: direction of view; its length is illustrative, not how far it sees.
					{#if cone.style === 'sweeping'}Dashed: sweeping, or patrol status unknown.{/if}
					{#if cone.style === 'approximate'}Approximate: the road's direction.{/if}
				{:else}
					{cone.reason}
				{/if}
			</figcaption>
		</figure>

		<div class="caption">
			<p class="line" class:warn={timeLine.warn} data-text-role="meta" data-cam-viewer-time>
				{timeLine.text}
			</p>
			{#each lines as line, i (i)}
				<p class="line" data-text-role="meta" data-cam-viewer-heading>{line}</p>
			{/each}
			<p class="line" data-text-role="meta" data-cam-viewer-credit>
				{cam.source}{#if fromAlertCalifornia}{' · '}<a
						href="https://creativecommons.org/licenses/by-nc-nd/4.0/"
						target="_blank"
						rel="noopener noreferrer license">CC BY-NC-ND 4.0</a
					>{/if}
			</p>
			<a
				class="open"
				href={cam.url}
				target="_blank"
				rel="noopener noreferrer"
				data-text-role="label">Open image ↗</a
			>
		</div>
	</aside>

	<nav class="strip" aria-label="Cameras in this sequence" bind:this={strip} data-cam-viewer-strip>
		{#each areas as a (a.label)}
			<div class="grp">
				<h3 class="grp-name" data-text-role="label">{a.label}</h3>
				<ul>
					{#each a.items as t (t.cam.id)}
						<li>
							<button
								class="thumb"
								type="button"
								aria-label={t.cam.name}
								aria-current={t.index === index ? 'true' : undefined}
								data-cam-thumb={t.cam.id}
								onclick={() => onstep(t.cam.id)}
							>
								{#if thumbSrc[t.cam.id]}
									<img src={thumbSrc[t.cam.id]} alt="" />
								{:else}
									<span class="ph" data-text-role="meta">{t.cam.name}</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</nav>
</div>

<style>
	.viewer {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 264px;
		grid-template-rows: auto minmax(0, 1fr) auto auto;
		grid-template-areas:
			'top top'
			'stage side'
			'controls side'
			'strip strip';
		gap: 8px 16px;
		padding: 12px 16px;
		background: var(--bg);
		color: var(--text-primary);
	}
	.viewer:focus {
		outline: none;
	}
	.top {
		grid-area: top;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}
	.name {
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.area {
		color: var(--text-muted);
		white-space: nowrap;
	}
	/* Announced, not shown: the counter below says the same to the eye. */
	.live {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		margin: 0;
	}
	.btn {
		min-width: 44px;
		min-height: 44px;
		padding: 0 0.75rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
	}
	/* aria-disabled, not disabled: a disabled button would drop the focus it holds, and the
	   viewer's keys with it (Codex CAMVIEW1 #1). The ends are no-ops in go(). */
	.btn[aria-disabled='true'] {
		opacity: 0.35;
		cursor: default;
	}
	.btn:focus-visible,
	.thumb:focus-visible,
	.open:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.close {
		margin-left: auto;
	}
	/* The frame's own box; the picture sits out of flow inside it, `contain`: never cropped. */
	.stage {
		grid-area: stage;
		position: relative;
		min-height: 0;
		background: #0b1220;
		touch-action: none;
	}
	.pic {
		position: absolute;
		inset: 0;
	}
	.pic :global(.viewer-img) {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.state {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		color: #cbd5e1;
	}
	.controls {
		grid-area: controls;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
	}
	.step {
		font-size: 1.5rem;
		line-height: 1;
	}
	.count {
		color: var(--text-muted);
		min-width: 4rem;
		text-align: center;
	}
	.map-toggle {
		display: none;
	}
	.side {
		grid-area: side;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-height: 0;
		overflow-y: auto;
	}
	.corner {
		margin: 0;
	}
	.corner svg {
		display: block;
		width: 100%;
		max-width: 240px;
		height: auto;
	}
	.land {
		fill: var(--surface, #111827);
		stroke: var(--border-light);
		stroke-width: 1;
	}
	.cone {
		fill: rgb(56 189 248 / 0.35);
		stroke: #38bdf8;
		stroke-width: 1.25;
	}
	.cone[data-style='sweeping'] {
		stroke-dasharray: 3 2;
		fill: rgb(56 189 248 / 0.2);
	}
	.cone[data-style='approximate'],
	.cone.faint {
		stroke-dasharray: 1.5 1.5;
		fill: rgb(56 189 248 / 0.2);
	}
	.cone.faint {
		opacity: 0.5;
	}
	.anchor {
		fill: var(--text-muted);
	}
	.anchor-name {
		fill: var(--text-muted);
		font-size: 9px;
	}
	.dot {
		fill: var(--text-muted);
		stroke: var(--bg);
		stroke-width: 1;
	}
	.dot.here {
		fill: #38bdf8;
		stroke: var(--text-primary);
		stroke-width: 1.5;
	}
	.key {
		margin-top: 0.25rem;
		color: var(--text-muted);
	}
	.caption {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.line {
		margin: 0;
		color: var(--text-muted);
	}
	.line.warn {
		color: var(--warning, #f59e0b);
	}
	.caption a {
		color: var(--accent);
	}
	.open {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.strip {
		grid-area: strip;
		display: flex;
		gap: 1rem;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		padding: 4px 4px 6px;
		scrollbar-width: thin;
	}
	.grp {
		flex: 0 0 auto;
	}
	.grp-name {
		margin: 0 0 4px;
		font-size: var(--v2-fs-label, 0.8rem);
		font-weight: 500;
		color: var(--text-muted);
	}
	.grp ul {
		display: flex;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* The highlight rings the thumbnail; it never sits on it. */
	.thumb {
		display: block;
		width: 96px;
		aspect-ratio: 16 / 9;
		padding: 0;
		border: 1px solid var(--border-light);
		background: #0b1220;
		cursor: pointer;
	}
	.thumb[aria-current='true'] {
		outline: 2px solid #38bdf8;
		outline-offset: 2px;
	}
	.thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.ph {
		display: grid;
		place-items: center;
		height: 100%;
		padding: 0 4px;
		color: #cbd5e1;
		font-size: 0.7rem;
		line-height: 1.2;
		text-align: center;
		overflow: hidden;
	}
	@media (max-width: 767px) {
		/* Phone: one column that scrolls; the frame keeps its 16:9 and the map is a toggle. */
		.viewer {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto auto auto auto;
			grid-template-areas: 'top' 'stage' 'controls' 'strip' 'side';
			align-content: start;
			overflow-y: auto;
			padding: 8px 12px max(12px, env(safe-area-inset-bottom));
		}
		.stage {
			aspect-ratio: 16 / 9;
		}
		.map-toggle {
			display: inline-block;
		}
		.corner:not([data-shown]) {
			display: none;
		}
		.side {
			overflow: visible;
		}
	}
</style>
