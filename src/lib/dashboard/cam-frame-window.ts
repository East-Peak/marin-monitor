/**
 * The viewer's full frames (CAMVIEW1): at most three held (the current camera and its two
 * neighbours), each decode-gated by the strip's loader. Loads left behind are aborted and a late
 * completion is discarded; frames left behind are released. Only the current frame refreshes,
 * on the wall's cadence, and a failed refresh keeps the frame it had.
 */
import type { CameraConfig } from '$lib/config/cameras';
import { versionedFrameUrl } from '$lib/components/tv/camera-frame';
import { releaseFrame, type loadFrame } from './cam-frame-loader';
import { exposesCaptureTime } from './cam-strip';

export interface WindowFrame {
	img: HTMLImageElement;
	/** The source's capture time, where it exposes one. */
	capturedAt: number | null;
	/** When we received it: "last received", never "updated". */
	receivedAt: number;
}

export interface FrameSlot {
	frame: WindowFrame | null;
	loading: boolean;
	/** The last attempt failed (with a frame kept: "not updating"; without: unavailable). */
	failed: boolean;
	/** The source answered with its stand-in card. */
	placeholder: boolean;
}

interface Entry extends FrameSlot {
	cam: CameraConfig;
	url: string | null;
	ctrl: AbortController | null;
}

const EMPTY: FrameSlot = { frame: null, loading: false, failed: false, placeholder: false };

export function createFrameWindow(deps: {
	load: typeof loadFrame;
	release?: (img: HTMLImageElement) => void;
	clock?: () => number;
	refreshS: number;
	onchange?: () => void;
}) {
	const release = deps.release ?? ((img: HTMLImageElement) => releaseFrame(img));
	const clock = deps.clock ?? Date.now;
	const entries = new Map<string, Entry>();
	let current: string | null = null;
	let disposed = false;

	function drop(e: Entry) {
		e.ctrl?.abort();
		if (e.frame) release(e.frame.img);
		entries.delete(e.cam.id);
	}

	async function fetchInto(e: Entry) {
		const url = versionedFrameUrl(e.cam.url, deps.refreshS, clock());
		if (e.ctrl || url === e.url) return;
		const ctrl = (e.ctrl = new AbortController());
		e.loading = true;
		const got = await deps.load(url, exposesCaptureTime(e.cam), { signal: ctrl.signal });
		// Left behind, replaced or disposed while loading: discard what came back.
		if (ctrl.signal.aborted || entries.get(e.cam.id) !== e) {
			if (got) release(got.img);
			return;
		}
		e.ctrl = null;
		e.loading = false;
		e.url = url;
		if (got?.placeholder) {
			release(got.img);
			if (e.frame) release(e.frame.img);
			Object.assign(e, { frame: null, failed: false, placeholder: true });
		} else if (got) {
			if (e.frame) release(e.frame.img);
			e.frame = { img: got.img, capturedAt: got.capturedAt, receivedAt: clock() };
			Object.assign(e, { failed: false, placeholder: false });
		} else {
			e.failed = true;
		}
		deps.onchange?.();
	}

	return {
		/** `cams[0]` is the current camera; the rest are kept warm. Anything else is dropped. */
		focus(cams: readonly CameraConfig[]) {
			if (disposed) return;
			const keep = new Set(cams.map((c) => c.id));
			for (const e of [...entries.values()]) if (!keep.has(e.cam.id)) drop(e);
			current = cams[0]?.id ?? null;
			for (const cam of cams) {
				if (entries.has(cam.id)) continue;
				const e: Entry = { ...EMPTY, cam, url: null, ctrl: null };
				entries.set(cam.id, e);
				void fetchInto(e);
			}
			deps.onchange?.();
		},
		/** The current camera's next frame, once the cadence has moved on. */
		refresh() {
			const e = current ? entries.get(current) : undefined;
			if (e && !disposed) void fetchInto(e);
		},
		slot(id: string): FrameSlot {
			const e = entries.get(id);
			return e
				? { frame: e.frame, loading: e.loading, failed: e.failed, placeholder: e.placeholder }
				: { ...EMPTY };
		},
		dispose() {
			disposed = true;
			for (const e of [...entries.values()]) drop(e);
		}
	};
}
