/**
 * Memoize an async initializer (e.g. a lazy `import()`), but only its
 * success: a rejected attempt is forgotten, so the next call retries instead
 * of replaying the failure forever (a transient chunk-load error must not
 * disable RSS until the page reloads).
 */
export function createRetryingLoader<T>(load: () => Promise<T>): () => Promise<T> {
	let pending: Promise<T> | null = null;
	return () =>
		(pending ??= load().catch((err: unknown) => {
			pending = null;
			throw err;
		}));
}
