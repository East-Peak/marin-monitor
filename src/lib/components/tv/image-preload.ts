// src/lib/components/tv/image-preload.ts
/**
 * Resolve the element only once it has loaded AND decoded (null otherwise; never
 * rejects). Callers mount this element itself: a fresh <img src> would refetch
 * once a short max-age expires, even though these bytes are already decoded.
 */
export function preloadImage(
	url: string,
	timeoutMs = 8_000,
	signal?: AbortSignal,
	/** Load in CORS mode, so a canvas may read the pixels. */
	cors = false
): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		if (signal?.aborted) return resolve(null);
		const img = new Image();
		if (cors) img.crossOrigin = 'anonymous';
		let settled = false;
		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			img.onload = null;
			img.onerror = null;
			resolve(ok ? img : null);
		};
		// Cancelled (v2 strip only): stop the download too. TV passes no signal.
		const onAbort = () => {
			finish(false);
			img.src = '';
		};
		signal?.addEventListener('abort', onAbort, { once: true });
		const timer = setTimeout(() => {
			finish(false);
			// Signal-enabled callers (the v2 strip) also stop a slow download (Codex r4 #2);
			// TV passes no signal and keeps its exact behaviour.
			if (signal) img.src = '';
		}, timeoutMs);
		img.onload = () => {
			if (typeof img.decode === 'function') {
				img.decode().then(
					() => finish(true),
					() => finish(false)
				);
			} else {
				finish(true);
			}
		};
		img.onerror = () => finish(false);
		img.src = url;
	});
}
