/**
 * The camera viewer's history, applied (CAMVIEW1): what `cam-viewer-url` decides, written with
 * SvelteKit's shallow routing so the page never navigates. Shallow routing moves `page.state`
 * but not `page.url`, so the URL is read from `location`, again on every state change.
 */
import { pushState, replaceState } from '$app/navigation';
import { browser } from '$app/environment';
import { page } from '$app/state';
import { openOp, type HistoryOp, type ViewerState } from './cam-viewer-url';

export function applyHistory(op: HistoryOp): void {
	if (op.op === 'back') history.back();
	else (op.op === 'push' ? pushState : replaceState)(op.href, op.state);
}

export const pageState = (): ViewerState => page.state as ViewerState;

/** The URL as it stands, shallow entries included; tracked through `page.state`. */
export function currentUrl(): URL {
	void page.state;
	return browser ? new URL(location.href) : page.url;
}

/** A tile or the map's Enlarge opens the viewer at `id`. */
export function openCamViewer(id: string, opts: { from: 'tile' | 'map'; seq?: string[] }): void {
	applyHistory(openOp(currentUrl(), pageState(), id, opts));
}
