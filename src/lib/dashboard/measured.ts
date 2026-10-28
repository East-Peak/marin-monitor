/**
 * Decision M (batch 3a): one representation for every value the v2 models display.
 * A value carries its own observation time (null = not reported) and whether it was
 * kept after a failure. Anything this owner can't vouch for is loading, unknown or
 * unavailable: never a 0, an empty list or "nothing new". Legacy code never imports this.
 */
import { FAILURE_WORDS } from './failure-kind';
import { effectiveState, type SourceStatusEntry } from './source-status';

/** Why an entry failed, in reader words (rule 7); its detail is a diagnostic and never shown. */
const why = (entry: SourceStatusEntry, otherwise: string) =>
	entry.failure ? FAILURE_WORDS[entry.failure] : otherwise;

export type Measured<T> =
	| { kind: 'loading'; source: string }
	| {
			kind: 'value';
			value: T;
			observedAt: number | null;
			source: string;
			/** The failure after which this value was kept (last good), or null when fresh. */
			retainedAfter: string | null;
	  }
	| { kind: 'unknown'; source: string; reason: string }
	| { kind: 'unavailable'; source: string; reason: string };

const FUTURE_SKEW_MS = 5 * 60_000;

export const measuredLoading = <T>(source: string): Measured<T> => ({ kind: 'loading', source });

export function measuredValue<T>(
	value: T,
	source: string,
	observedAt: number | null,
	retainedAfter: string | null = null
): Measured<T> {
	const at = observedAt !== null && Number.isFinite(observedAt) ? observedAt : null;
	return { kind: 'value', value, observedAt: at, source, retainedAfter };
}

export const measuredUnknown = <T>(source: string, reason: string): Measured<T> => ({
	kind: 'unknown',
	source,
	reason
});

export const measuredUnavailable = <T>(source: string, reason: string): Measured<T> => ({
	kind: 'unavailable',
	source,
	reason
});

export function mapMeasured<T, U>(m: Measured<T>, f: (v: T) => U): Measured<U> {
	return m.kind === 'value' ? { ...m, value: f(m.value) } : m;
}

/**
 * A value read through the status entry of the owner that loads it. Only an entry this
 * owner settled (ok, reference, unknown, stale) promotes a value: the shared stores survive
 * controller re-creation, so a value next to a loading/unavailable/missing entry isn't ours.
 * Freshness is the clock's: an ok entry past its max age is retained "out of date".
 */
export function measuredFromEntry<T>(
	entry: SourceStatusEntry | undefined,
	value: T | null,
	source: string,
	now: number
): Measured<T> {
	if (!entry || entry.state === 'loading') return measuredLoading(source);
	if (entry.state === 'unavailable')
		return measuredUnavailable(source, why(entry, FAILURE_WORDS.unknown));
	if (value === null) {
		return entry.state === 'stale'
			? measuredUnavailable(source, why(entry, 'refresh failed'))
			: measuredUnknown(source, 'no value');
	}
	const state = effectiveState(entry, now);
	if (state === 'stale') {
		const reason = entry.state === 'stale' ? why(entry, 'refresh failed') : 'out of date';
		return measuredValue(value, source, entry.observedAt, reason);
	}
	return measuredValue(value, source, state === 'unknown' ? null : entry.observedAt);
}

/** Only a fresh, successful, empty read within its max age may be described as empty. */
export function emptyWording(
	coverage: Measured<readonly unknown[]>,
	empty: string,
	{ now, maxAgeMs }: { now: number; maxAgeMs: number | null }
): string | null {
	if (coverage.kind !== 'value' || coverage.retainedAfter !== null) return null;
	if (coverage.value.length !== 0 || coverage.observedAt === null) return null;
	const age = now - coverage.observedAt;
	if (age < -FUTURE_SKEW_MS) return null;
	if (maxAgeMs !== null && age > maxAgeMs) return null;
	return empty;
}
