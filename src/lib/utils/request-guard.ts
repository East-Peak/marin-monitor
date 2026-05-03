/**
 * Monotonic request-ID guard for racy async work.
 *
 * Each call to `next()` issues a fresh ID and bumps the internal counter.
 * `isLatest(id)` returns true only when `id` is still the newest issued ID.
 *
 * Use to suppress out-of-order async results: capture the ID before awaiting,
 * then check `isLatest` before committing the result. Slow-old responses
 * cannot overwrite faster-newer ones.
 */
export function createRequestGuard() {
	let latest = 0;
	return {
		next(): number {
			return ++latest;
		},
		isLatest(id: number): boolean {
			return id === latest;
		}
	};
}
