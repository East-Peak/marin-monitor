/**
 * Cancellation primitives for the producer. Every await on the network or on
 * Blob storage goes through `abortable`, so an operation that ignores its
 * signal (or retries internally) still cannot outlive its deadline.
 */

/** Rejects with an AbortError once `signal` aborts (immediately if it already has). */
export function abortPromise(signal: AbortSignal): Promise<never> {
	const aborted = new Promise<never>((_, reject) => {
		const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
		if (signal.aborted) onAbort();
		else signal.addEventListener('abort', onAbort, { once: true });
	});
	aborted.catch(() => {}); // the loser of a race must not surface as unhandled
	return aborted;
}

/** `work`, or an AbortError as soon as `signal` aborts — whichever comes first. */
export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) {
		work.catch(() => {});
		return abortPromise(signal);
	}
	return Promise.race([work, abortPromise(signal)]);
}

/** An absolute invocation deadline, carved into per-operation signals. */
export interface Deadline {
	readonly at: number;
	remaining(): number;
	/** Aborts after min(capMs, time left minus reserveMs); already aborted if none is left. */
	signal(capMs: number, reserveMs?: number): AbortSignal;
}

export function createDeadline(at: number, now: () => number): Deadline {
	const remaining = () => at - now();
	return {
		at,
		remaining,
		signal(capMs, reserveMs = 0) {
			const ms = Math.min(capMs, remaining() - reserveMs);
			if (ms <= 0) return AbortSignal.abort(new DOMException('Deadline exceeded', 'TimeoutError'));
			return AbortSignal.timeout(ms);
		}
	};
}
