/**
 * The v2 advisory feed: our own attempt/success record for the advisory row.
 * Failure keeps the last good advisories (they still expire by the clock) and
 * records the error, so the row can show "not updated since". One request at
 * a time, so an obsolete result can never land after a newer one.
 */
import { writable, type Readable } from 'svelte/store';
import type { AdvisoryFeedState, ParsedAlerts } from '$lib/weather/advisories';

/** Nothing attempted yet: the row stays hidden. */
export const EMPTY_ADVISORY_FEED: AdvisoryFeedState = {
	advisories: [],
	unreadable: 0,
	lastAttemptAt: null,
	lastSuccessAt: null,
	lastError: null
};

export function createAdvisoryFeed(deps: {
	fetch: (signal: AbortSignal) => Promise<ParsedAlerts>;
	signal: AbortSignal;
	now: () => number;
	/** The first paint's server read (MOBILE1), so the row is there before the first refresh. */
	initial?: AdvisoryFeedState | null;
}): Readable<AdvisoryFeedState> & { refresh(): Promise<void> } {
	const state = writable<AdvisoryFeedState>(deps.initial ?? EMPTY_ADVISORY_FEED);
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
