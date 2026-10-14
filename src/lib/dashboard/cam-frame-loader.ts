/**
 * A camera frame for the v2 strip, shown only once decoded (TV's preloadImage gate).
 * Where the source exposes it, the frame carries the source's capture time, read from
 * Last-Modified on the very bytes shown, never from our own clock (Decision 3).
 */
import { preloadImage } from '$lib/components/tv/image-preload';

export interface LoadedFrame {
	img: HTMLImageElement;
	/** The source's capture time (ms), or null: then the strip claims no age. */
	capturedAt: number | null;
}

interface FrameLoaderOptions {
	/** The tile's lifecycle; once aborted, no further request starts and nothing is returned. */
	signal?: AbortSignal;
	fetch?: typeof fetch;
	preload?: (url: string, signal?: AbortSignal) => Promise<HTMLImageElement | null>;
	toObjectUrl?: (b: Blob) => string;
	revoke?: (url: string) => void;
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
		return img && !signal?.aborted ? { img, capturedAt: null } : null;
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
		return { img, capturedAt: Number.isFinite(parsed) ? parsed : null };
	} finally {
		clearTimeout(timer);
	}
}

/** Free a replaced or unmounted frame's object URL (Caltrans frames only). */
export function releaseFrame(img: HTMLImageElement | null, revoke = defaultRevoke): void {
	if (img?.src.startsWith('blob:')) revoke(img.src);
}
