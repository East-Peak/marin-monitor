<!-- Where the camera viewer opens (CAMVIEW1): reads `?cam` and the history mark, loads the viewer
     on first open, and hands focus back on close (the tile last viewed, or the map's Enlarge). -->
<script lang="ts">
	import { tick } from 'svelte';
	import { camSequence, mapSequence, viewerCameras } from '$lib/dashboard/cam-viewer';
	import {
		camHref,
		closeOp,
		snapshotOp,
		stepOp,
		viewerAt,
		type ViewerMark
	} from '$lib/dashboard/cam-viewer-url';
	import { applyHistory, currentUrl, pageState } from '$lib/dashboard/cam-viewer-nav';
	import { camViewerOpen } from '$lib/dashboard/cam-viewer-open';
	import type { Bounds } from '$lib/dashboard/map-in-view';
	import type { CamHeadings } from '$lib/dashboard/cam-headings-store';
	import { replaceState } from '$app/navigation';

	interface Props {
		now: number;
		headings?: CamHeadings;
		/**
		 * /map: the map's visible bounds once it has settled, for a loaded link's sequence (the
		 * cameras in view at load). Absent on the dashboard, whose links step the whole wall.
		 */
		visible?: Bounds | null;
		mapPage?: boolean;
	}
	let { now, headings, visible = null, mapPage = false }: Props = $props();

	const supported = new Set(viewerCameras().map((c) => c.id));
	const url = $derived(currentUrl());
	const at = $derived(viewerAt(url, pageState(), (id) => supported.has(id)));
	const mark = $derived(at.open);

	// An id the viewer can't show opens nothing, and leaves the URL.
	$effect(() => {
		if (at.drop) replaceState(camHref(currentUrl(), null), pageState());
	});

	// /map's loaded link: its sequence is fixed once, from the cameras in view at load.
	const waiting = $derived(mapPage && mark !== null && mark.seq === null && mark.from === 'link');
	$effect(() => {
		if (!waiting || !visible || !mark) return;
		const ids = mapSequence(visible, mark.id).map((s) => s.cam.id);
		applyHistory(snapshotOp(currentUrl(), pageState(), mark.id, ids));
	});

	const seq = $derived(
		mark && !waiting ? (mark.seq ? camSequence([...mark.seq, mark.id]) : camSequence()) : []
	);
	const open = $derived(mark !== null && seq.length > 0);
	$effect(() => camViewerOpen.set(open));

	let Viewer = $state<typeof import('./CamViewer.svelte').default | null>(null);
	$effect(() => {
		if (open && !Viewer) void import('./CamViewer.svelte').then((m) => (Viewer = m.default));
	});

	// Focus goes back where the viewer came from, however it closed (Close, Esc, Back).
	let last: ViewerMark | null = null;
	$effect(() => {
		const m = open ? mark : null;
		if (m) last = m;
		else if (last) {
			const from = last;
			last = null;
			void tick().then(() => {
				const target =
					from.from === 'map'
						? document.querySelector<HTMLElement>('[data-frame-enlarge]')
						: from.from === 'tile'
							? document.querySelector<HTMLElement>(`a.cam-tile[data-camera-id="${from.id}"]`)
							: null;
				target?.focus();
			});
		}
	});
</script>

{#if open && Viewer && mark}
	<Viewer
		{seq}
		id={mark.id}
		{now}
		{headings}
		onstep={(id: string) => applyHistory(stepOp(currentUrl(), pageState(), id))}
		onclose={() => applyHistory(closeOp(currentUrl(), pageState()))}
	/>
{/if}
