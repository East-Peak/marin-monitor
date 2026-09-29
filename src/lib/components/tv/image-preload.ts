// src/lib/components/tv/image-preload.ts
/**
 * Resolve the element only once it has loaded AND decoded (null otherwise; never
 * rejects). Callers mount this element itself: a fresh <img src> would refetch
 * once a short max-age expires, even though these bytes are already decoded.
 */
export function preloadImage(url: string, timeoutMs = 8_000): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		let settled = false;
		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			img.onload = null;
			img.onerror = null;
			resolve(ok ? img : null);
		};
		const timer = setTimeout(() => finish(false), timeoutMs);
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
