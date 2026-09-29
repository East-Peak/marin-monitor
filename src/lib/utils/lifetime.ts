import { onDestroy } from 'svelte';

/**
 * An AbortSignal owned by the calling component: it aborts when the component is
 * destroyed. Call it during component initialisation, pass it to mount-time fetches,
 * and check `aborted` before any continuation that writes state or starts a request.
 */
export function componentLifetime(): AbortSignal {
	const controller = new AbortController();
	onDestroy(() => controller.abort());
	return controller.signal;
}
