/**
 * The v2 advisory feed: our own attempt/success record for the advisory row.
 * Failure keeps the last good advisories (they still expire by the clock) and
 * records the error, so the row can show "not updated since". One request at
 * a time, so an obsolete result can never land after a newer one.
 */
import { writable, type Readable } from 'svelte/store';
import type { AdvisoryFeedState, ParsedAlerts } from '$lib/weather/advisories';

export function createAdvisoryFeed(deps: {
	fetch: (signal: AbortSignal) => Promise<ParsedAlerts>;
	signal: AbortSignal;
	now: () => number;
}): Readable<AdvisoryFeedState> & { refresh(): Promise<void> } {
	const state = writable<AdvisoryFeedState>({
		advisories: [],
		unreadable: 0,
		lastAttemptAt: null,
		lastSuccessAt: null,
		lastError: null
	});
	let running: Promise<void> | null = null;

	function refresh(): Promise<void> {
		if (deps.signal.aborted) return Promise.resolve();
		if (running) return running;
		const attemptAt = deps.now();
		running = deps
			.fetch(deps.signal)
			.then(
				({ advisories, unreadable }) => {
					if (deps.signal.aborted) return;
					state.set({
						advisories,
						unreadable,
						lastAttemptAt: attemptAt,
						lastSuccessAt: deps.now(),
						lastError: null
					});
				},
				(err: unknown) => {
					if (deps.signal.aborted) return;
					const lastError = err instanceof Error ? err.message : String(err);
					state.update((s) => ({ ...s, lastAttemptAt: attemptAt, lastError }));
				}
			)
			.finally(() => {
				running = null;
			});
		return running;
	}

	return { subscribe: state.subscribe, refresh };
}
