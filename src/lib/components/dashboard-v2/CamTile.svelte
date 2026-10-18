<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { Action } from 'svelte/action';
	import type { CameraConfig } from '$lib/config/cameras';
	import {
		initialTileState,
		onFrameFailed,
		onFrameLoaded,
		staleAfterMs,
		tileStatus,
		versionedFrameUrl,
		type TileState,
		type TileStatus
	} from '$lib/components/tv/camera-frame';
	import { loadFrame, releaseFrame } from '$lib/dashboard/cam-frame-loader';
	import {
		STRIP_REFRESH_S,
		STRIP_RETRY_S,
		captureAgeLabel,
		exposesCaptureTime,
		stripFrameUrl
	} from '$lib/dashboard/cam-strip';

	interface Props {
		cam: CameraConfig;
		/** Near the viewport and the page visible: only then does the tile fetch (Decision 9). */
		active: boolean;
		now: number;
		load?: typeof loadFrame;
		onstatus?: (id: string, status: TileStatus) => void;
		clock?: () => number;
		/** "Looking SSE · 163°" or "Sweeping" (MAPX4); absent without a reported heading. */
		heading?: string | null;
	}
	let {
		cam,
		active,
		now,
		load = loadFrame,
		onstatus,
		clock = Date.now,
		heading = null
	}: Props = $props();

	// TV's decode gate (camera-frame.ts): a frame is shown only after it decoded.
	let tile = $state<TileState>(initialTileState());
	let shownImg = $state.raw<HTMLImageElement | null>(null);
	let capturedAt = $state<number | null>(null);
	let attempted = $state(false);
	/** The source answered with its stand-in card (Caltrans "Temporarily Unavailable"; MAPX4b). */
	let unavailable = $state(false);
	/** A request is out (reactive, unlike `pending`). */
	let requesting = $state(false);
	/** The request in flight; aborted when the tile deactivates or unmounts. */
	let pending: AbortController | null = null;

	const machine = $derived(tileStatus(tile, now, staleAfterMs(STRIP_REFRESH_S)));
	/** No picture yet and a request out: connecting, even after earlier failures (Codex r2 #3). */
	const status = $derived<TileStatus>(
		unavailable ? 'offline' : requesting && tile.shownUrl === null ? 'connecting' : machine
	);
	/**
	 * What the strip aggregates: refresh progress, not frame age (Codex r6 #1). A request out is
	 * "connecting"; an old frame with no failed refresh since it arrived (e.g. back from offscreen
	 * or a hidden tab) is not evidence of an outage, so it reports "live" until a refresh fails.
	 */
	const reported = $derived<TileStatus>(
		unavailable
			? 'offline'
			: requesting
				? 'connecting'
				: machine === 'stale' && tile.failures === 0
					? 'live'
					: machine
	);
	const hasFrame = $derived(tile.shownUrl !== null);
	const age = $derived(captureAgeLabel(capturedAt, now));
	const lastFrameMin = $derived(
		tile.shownAt === null ? 0 : Math.max(1, Math.round((now - tile.shownAt) / 60_000))
	);

	function cancel() {
		pending?.abort();
		pending = null;
		requesting = false;
	}

	async function refresh() {
		const url = versionedFrameUrl(stripFrameUrl(cam), STRIP_REFRESH_S, clock());
		if (pending || url === tile.shownUrl) return;
		// Reported before the await: a tile with a request out is "connecting", never a
		// silent gap the strip could read as "all offline" (Codex r1 #4).
		attempted = true;
		requesting = true;
		const ctrl = (pending = new AbortController());
		const frame = await load(url, exposesCaptureTime(cam), { signal: ctrl.signal });
		if (ctrl.signal.aborted) return releaseFrame(frame?.img ?? null); // cancel() reset the flags
		pending = null;
		requesting = false;
		if (frame?.placeholder) {
			// A definite answer, not a failed load: no picture and no age until a real one returns.
			releaseFrame(frame.img);
			releaseFrame(shownImg);
			shownImg = null;
			capturedAt = null;
			tile = initialTileState();
			unavailable = true;
		} else if (frame) {
			unavailable = false;
			const previous = shownImg;
			tile = onFrameLoaded(tile, url, clock());
			shownImg = frame.img;
			capturedAt = frame.capturedAt;
			if (previous !== frame.img) releaseFrame(previous);
		} else {
			tile = onFrameFailed(tile);
		}
	}

	// Refresh while active: every minute once a frame is up, every 10 s until then.
	$effect(() => {
		if (!active) return;
		const period = (hasFrame ? STRIP_REFRESH_S : STRIP_RETRY_S) * 1000;
		untrack(() => void refresh());
		const timer = setInterval(() => void refresh(), period);
		return () => clearInterval(timer);
	});

	// Deactivated: drop the request in flight. Its own effect, because a cleanup sees the old
	// prop value (Codex r3 #1, reproduced with the compiler).
	$effect(() => {
		if (!active) untrack(cancel);
	});

	// Report outside tracking: the parent's write must not re-trigger this effect (a loop).
	$effect(() => {
		const s = reported;
		if (attempted) untrack(() => onstatus?.(cam.id, s));
	});

	const showFrame: Action<HTMLElement, HTMLImageElement> = (host, img) => {
		const mount = (frame: HTMLImageElement) => {
			frame.alt = cam.name;
			frame.className = 'cam-img';
			host.replaceChildren(frame);
		};
		mount(img);
		return { update: mount, destroy: () => host.replaceChildren() };
	};

	onDestroy(() => {
		cancel();
		releaseFrame(shownImg);
	});
</script>

<a
	class="cam-tile"
	href={cam.url}
	target="_blank"
	rel="noopener noreferrer"
	data-camera-id={cam.id}
	data-status={attempted ? status : active ? 'connecting' : 'idle'}
>
	{#if shownImg}
		<div class="cam-frame" use:showFrame={shownImg}></div>
	{/if}
	{#if attempted && status === 'offline'}
		<span class="cam-state" data-text-role="meta"
			>{unavailable ? 'Camera temporarily unavailable' : 'Camera offline'}</span
		>
	{:else if active && !shownImg}
		<span class="cam-state" data-text-role="meta">Connecting…</span>
	{/if}
	<span class="cam-chip cam-name" data-text-role="label">{cam.name}</span>
	<span class="cam-chip cam-meta" data-text-role="meta" data-cam-meta>
		<!-- The source's own age wins, even while our refresh is failing (Codex r2 #7). Without
		     one, a failing refresh says when *we* last received a picture, never "updated". -->
		<!-- Explicit separators: Svelte trims the whitespace before a block's text (Codex r5 #1). -->
		{cam.source}{#if age}{' · '}<span class:cam-old={age.old || status === 'stale'}
				>updated {age.text}</span
			>{:else if status === 'stale'}{' · '}<span class="cam-old"
				>last received {lastFrameMin} min ago</span
			>{/if}
	</span>
	{#if heading}
		<span class="cam-chip cam-heading" data-text-role="meta" data-cam-heading>{heading}</span>
	{/if}
</a>

<style>
	.cam-tile {
		position: relative;
		display: block;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: 6px;
		border: 1px solid var(--border-light);
		background: #0b1220;
		color: #fff;
		text-decoration: none;
	}
	.cam-frame,
	.cam-frame :global(.cam-img) {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.cam-state {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: #cbd5e1;
	}
	/* Photos are dark or bright whatever the theme: fixed dark chips keep text legible. */
	.cam-chip {
		position: absolute;
		left: 0.375rem;
		max-width: calc(100% - 0.75rem);
		padding: 0 0.375rem;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.62);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		pointer-events: none;
	}
	.cam-name {
		top: 0.375rem;
		font-weight: 600;
	}
	.cam-meta {
		bottom: 0.375rem;
		color: #e2e8f0;
	}
	.cam-heading {
		left: auto;
		right: 0.375rem;
		bottom: 0.375rem;
		max-width: 45%;
		color: #e2e8f0;
	}
	.cam-old {
		color: var(--warning, #f59e0b);
	}
	.cam-tile:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
