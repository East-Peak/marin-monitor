// src/lib/components/tv/image-preload.ts
/** Resolve true only once the image has loaded AND decoded; never rejects. */
export function preloadImage(url: string, timeoutMs = 8_000): Promise<boolean> {
	return new Promise((resolve) => {
		const img = new Image();
		let settled = false;
		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			img.onload = null;
			img.onerror = null;
			resolve(ok);
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
