/**
 * A camera frame for the v2 strip, shown only once decoded (TV's preloadImage gate).
 * Where the source exposes it, the frame carries the source's capture time, read from
 * Last-Modified on the very bytes shown, never from our own clock (Decision 3).
 */
import { preloadImage } from '$lib/components/tv/image-preload';
import { isCaltransPlaceholder } from './cam-placeholder';

export interface LoadedFrame {
	img: HTMLImageElement;
	/** The source's capture time (ms), or null: then the strip claims no age. */
	capturedAt: number | null;
	/** Caltrans' stand-in card ("Temporarily Unavailable"), not a picture (MAPX4b). */
	placeholder?: boolean;
}

interface FrameLoaderOptions {
	/** The tile's lifecycle; once aborted, no further request starts and nothing is returned. */
	signal?: AbortSignal;
	fetch?: typeof fetch;
	preload?: (url: string, signal?: AbortSignal) => Promise<HTMLImageElement | null>;
	toObjectUrl?: (b: Blob) => string;
	revoke?: (url: string) => void;
	/** Reads the decoded bytes for a stand-in card; only frames we fetched ourselves. */
	isPlaceholder?: (img: HTMLImageElement) => boolean;
}

const FETCH_TIMEOUT_MS = 8_000;
const defaultRevoke = (u: string) => URL.revokeObjectURL(u);

export async function loadFrame(
	url: string,
	withCaptureTime: boolean,
	opts: FrameLoaderOptions = {}
): Promise<LoadedFrame | null> {
	const { signal } = opts;
	// Cancelled before anything starts: no request on either path (Codex r3 #6).
	if (signal?.aborted) return null;
	const preload = opts.preload ?? ((u: string, s?: AbortSignal) => preloadImage(u, undefined, s));
	const revoke = opts.revoke ?? defaultRevoke;
	const plain = async () => {
		if (signal?.aborted) return null;
		const img = await preload(url, signal); // the download itself stops on cancel (Codex r3 #5)
		return img && !signal?.aborted ? { img, capturedAt: null, placeholder: false } : null;
	};
	if (!withCaptureTime) return plain();

	// One controller for the request: aborted by the tile's lifecycle or by our deadline, which
	// covers headers *and* body (Codex r3 #4). No AbortSignal.any: missing in jsdom and Safari < 17.4.
	const ctl = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		ctl.abort();
	}, FETCH_TIMEOUT_MS);
	signal?.addEventListener('abort', () => ctl.abort(), { once: true });
	const gone = () => signal?.aborted || timedOut;
	try {
		let res: Response;
		try {
			res = await (opts.fetch ?? globalThis.fetch.bind(globalThis))(url, {
				mode: 'cors',
				credentials: 'omit',
				signal: ctl.signal
			});
		} catch {
			// Cancelled or timed out: a failed frame. Anything else (CORS withdrawn) still shows
			// the frame through a plain decode, without an age.
			return gone() ? null : plain();
		}
		if (!res.ok || gone()) return null;
		const header = res.headers.get('last-modified');
		const parsed = header ? Date.parse(header) : NaN;
		let blob: Blob;
		try {
			blob = await res.blob(); // a stalled body is cut off by the same deadline
		} catch {
			return null;
		}
		if (gone()) return null;
		const objectUrl = (opts.toObjectUrl ?? ((b: Blob) => URL.createObjectURL(b)))(blob);
		const img = await preload(objectUrl, ctl.signal);
		if (!img || gone()) {
			revoke(objectUrl);
			return null;
		}
		return {
			img,
			capturedAt: Number.isFinite(parsed) ? parsed : null,
			placeholder: (opts.isPlaceholder ?? isCaltransPlaceholder)(img)
		};
	} finally {
		clearTimeout(timer);
	}
}

/** Free a replaced or unmounted frame's object URL (Caltrans frames only). */
export function releaseFrame(img: HTMLImageElement | null, revoke = defaultRevoke): void {
	if (img?.src.startsWith('blob:')) revoke(img.src);
}

/**
 * The frame the server put in the HTML (LCP1), handed to the tile once it has loaded and
 * decoded: the same element, so nothing is fetched twice. Always settles: an image that already
 * failed (its error event long gone) or fails to decode is no frame; a cancel or the deadline
 * stops its download.
 */
export function adoptFrame(
	img: HTMLImageElement,
	signal?: AbortSignal
): Promise<LoadedFrame | null> {
	return new Promise((resolve) => {
		let settled = false;
		// Settled once, after decoding: the deadline and a cancel cover the decode too.
		const finish = (frame: LoadedFrame | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener('abort', stop);
			img.removeEventListener('load', loaded);
			img.removeEventListener('error', failed);
			resolve(frame);
		};
		const stop = () => {
			if (settled) return;
			finish(null);
			img.src = '';
		};
		const loaded = () => {
			if (img.naturalWidth === 0) return finish(null);
			const frame = { img, capturedAt: null, placeholder: false };
			if (typeof img.decode !== 'function') return finish(frame);
			img.decode().then(
				() => finish(frame),
				() => finish(null)
			);
		};
		const failed = () => finish(null);
		const timer = setTimeout(stop, FETCH_TIMEOUT_MS);
		if (signal?.aborted) return stop();
		signal?.addEventListener('abort', stop, { once: true });
		if (img.complete) return loaded();
		img.addEventListener('load', loaded);
		img.addEventListener('error', failed);
	});
}
