/**
 * The camera viewer's place in history (CAMVIEW1): `?cam=<id>` in the URL and a mark in the
 * shallow-routing state. Opening from a tile or the map pushes an entry, stepping replaces it,
 * Back closes and Forward reopens. A viewer we pushed closes by going back; a loaded link (or a
 * reload, which keeps the URL but not the state) closes by dropping `cam`, never a blind back.
 * Other params, the hash and other state are carried through untouched. Pure.
 */

export const CAM_PARAM = 'cam';

export interface ViewerMark {
	id: string;
	/** We pushed this entry, so closing may go back to the one before it. */
	pushed: boolean;
	/** The map's snapshot (in wall order); null for the whole wall's sequence. */
	seq: string[] | null;
	/** Where focus goes on close: the tile, the map's Enlarge, or nowhere in particular. */
	from: 'tile' | 'map' | 'link';
}

export type ViewerState = Record<string, unknown> & { camViewer?: ViewerMark };

export type HistoryOp =
	| { op: 'push' | 'replace'; href: string; state: ViewerState }
	| { op: 'back' };

export function camParam(url: URL): string | null {
	return url.searchParams.get(CAM_PARAM) || null;
}

/** The same path, query and hash, with `cam` set or removed. */
export function camHref(url: URL, id: string | null): string {
	const params = new URLSearchParams(url.searchParams);
	if (id) params.set(CAM_PARAM, id);
	else params.delete(CAM_PARAM);
	const query = params.toString();
	return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

function withMark(state: ViewerState, mark: ViewerMark | null): ViewerState {
	const rest = { ...state };
	delete rest.camViewer;
	return mark ? { ...rest, camViewer: mark } : rest;
}

export function openOp(
	url: URL,
	state: ViewerState,
	id: string,
	opts: { from: 'tile' | 'map'; seq?: string[] }
): HistoryOp {
	return {
		op: 'push',
		href: camHref(url, id),
		state: withMark(state, { id, pushed: true, seq: opts.seq ?? null, from: opts.from })
	};
}

export function stepOp(url: URL, state: ViewerState, id: string): HistoryOp {
	const mark = state.camViewer ?? { id, pushed: false, seq: null, from: 'link' as const };
	return { op: 'replace', href: camHref(url, id), state: withMark(state, { ...mark, id }) };
}

export function closeOp(url: URL, state: ViewerState): HistoryOp {
	if (state.camViewer?.pushed) return { op: 'back' };
	return { op: 'replace', href: camHref(url, null), state: withMark(state, null) };
}

/** A loaded link's sequence (the map's cameras in view at load), fixed in its own entry. */
export function snapshotOp(url: URL, state: ViewerState, id: string, seq: string[]): HistoryOp {
	return {
		op: 'replace',
		href: camHref(url, id),
		state: withMark(state, { ...(state.camViewer ?? { pushed: false, from: 'link' }), id, seq })
	};
}

/**
 * What the location says is open. The URL decides: no `cam`, nothing open. A mark for the same
 * camera is ours; without one it's a link (or a reload). An id the viewer can't show is dropped.
 */
export function viewerAt(
	url: URL,
	state: ViewerState,
	supported: (id: string) => boolean
): { open: ViewerMark | null; drop: boolean } {
	const id = camParam(url);
	if (!id) return { open: null, drop: false };
	if (!supported(id)) return { open: null, drop: true };
	const mark = state.camViewer;
	return {
		open: mark?.id === id ? mark : { id, pushed: false, seq: null, from: 'link' },
		drop: false
	};
}
