/**
 * The thumbnails already loaded on the page (CAMVIEW1), shared with the viewer's strip so it
 * never fetches its own. Tiles publish what they show; the viewer retains what it draws. Each
 * holder renders its own <img> from the src, and a blob URL is revoked only when its last
 * holder lets go: a tile unmounting under an open viewer keeps the viewer's thumbnail.
 */

export interface ThumbRegistry {
	/** A tile shows `src` for `id`; the returned release drops that hold. */
	publish(id: string, src: string): () => void;
	/** Hold `id`'s current thumbnail; null when none is loaded. */
	retain(id: string): { src: string; release: () => void } | null;
	current(id: string): string | null;
	/** Called now and on every change to what is current. */
	subscribe(fn: () => void): () => void;
}

export function createThumbRegistry(
	revoke: (src: string) => void = (src) => URL.revokeObjectURL(src)
): ThumbRegistry {
	const holds = new Map<string, number>();
	const latest = new Map<string, string>();
	const listeners = new Set<() => void>();
	const changed = () => listeners.forEach((fn) => fn());

	function hold(id: string, src: string): () => void {
		holds.set(src, (holds.get(src) ?? 0) + 1);
		let held = true;
		return () => {
			if (!held) return;
			held = false;
			const left = (holds.get(src) ?? 1) - 1;
			if (left > 0) return void holds.set(src, left);
			holds.delete(src);
			if (src.startsWith('blob:')) revoke(src);
			if (latest.get(id) === src) {
				latest.delete(id);
				changed();
			}
		};
	}

	return {
		publish(id, src) {
			const release = hold(id, src);
			latest.set(id, src);
			changed();
			return release;
		},
		retain(id) {
			const src = latest.get(id);
			return src ? { src, release: hold(id, src) } : null;
		},
		current: (id) => latest.get(id) ?? null,
		subscribe(fn) {
			listeners.add(fn);
			fn();
			return () => listeners.delete(fn);
		}
	};
}

/** The page's registry: the wall's or strip's tiles and the viewer share it. */
export const camThumbs = createThumbRegistry();
