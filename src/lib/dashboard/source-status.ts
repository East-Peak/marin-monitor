/**
 * Per-source status and section coverage for the v2 dashboard (spec §3, §13.2).
 *
 * States are the G0a evaluator's (src/lib/server/health/evaluate.ts
 * `SourceStatus`; a type test pins them equal) plus UI-only `loading`.
 * Freshness is evaluated against the clock on every read (G1a): nothing
 * persists "ok". An ok source whose observation outlives `maxAgeMs` is stale.
 */
import { parseFeedDate } from '$lib/news/feed-date';
import { FAILURE_WORDS, type FailureKind } from './failure-kind';
import { formatAsOf } from './pacific-time';

export type SourceState = 'ok' | 'stale' | 'unavailable' | 'reference' | 'unknown';
export type SourceEntryState = SourceState | 'loading';

export interface SourceStatusEntry {
	/** Stable id, e.g. `news:marin-ij`, `dataset:gas`, `part:seeclickfix`. */
	id: string;
	/** Human name shown in coverage lists. */
	name: string;
	state: SourceEntryState;
	/** When the source last observed its data (epoch ms); null = unknown. */
	observedAt: number | null;
	/** Clock-driven freshness limit for `ok`; null = no age rule. */
	maxAgeMs: number | null;
	/** Short reason ("HTTP 503", "failures not reported by this source"); never a stack. A
	 * diagnostic: it stays in probes and /api/health, never on screen (rule 7). */
	detail: string | null;
	/** Why the latest read failed, typed where the failure entered the model; what readers see. */
	failure?: FailureKind;
	/** Our own reader-safe words about the source ("Part of News feeds"), shown beside its state. */
	note?: string | null;
}

export type SectionState =
	| 'loading'
	| 'ok'
	| 'partial'
	| 'stale'
	| 'empty'
	| 'no-match'
	| 'unavailable'
	| 'unknown';

export interface CoverageCounts {
	/** Items available across the section's sources, before the town filter. */
	total: number;
	/** Items that match the current scope. */
	matching: number;
}

export interface SectionPresentation {
	state: SectionState;
	/** Stale, unavailable or unknown sources, in input order. */
	failing: SourceStatusEntry[];
	/** For `stale`: the oldest failing observation; null if any is unknown. */
	asOf: number | null;
	/** Every source of the section, evaluated, in input order: the Coverage details list (rule 6). */
	entries: SourceStatusEntry[];
}

const FUTURE_SKEW_MS = 5 * 60_000;
const FAILING: ReadonlySet<SourceEntryState> = new Set(['stale', 'unavailable', 'unknown']);
const HEALTHY: ReadonlySet<SourceEntryState> = new Set(['ok', 'reference']);
const MAX_NAMES = 3;

/** The one way a provenance time enters the model: zoned date-time or unknown (null), never NaN. */
export function parseObservedAt(value: unknown): number | null {
	return typeof value === 'string' ? parseFeedDate(value) : null;
}

/** Fails closed: anything we cannot vouch for is unknown, never ok. */
export function effectiveState(entry: SourceStatusEntry, now: number): SourceEntryState {
	if (entry.state !== 'ok' || entry.maxAgeMs === null) return entry.state;
	if (
		!Number.isFinite(entry.maxAgeMs) ||
		entry.observedAt === null ||
		!Number.isFinite(entry.observedAt)
	) {
		return 'unknown';
	}
	const age = now - entry.observedAt;
	if (age < -FUTURE_SKEW_MS) return 'unknown';
	return age > entry.maxAgeMs ? 'stale' : 'ok';
}

function oldestObservation(entries: readonly SourceStatusEntry[]): number | null {
	let oldest = Infinity;
	for (const e of entries) {
		if (e.observedAt === null) return null;
		oldest = Math.min(oldest, e.observedAt);
	}
	return Number.isFinite(oldest) ? oldest : null;
}

/** Decision 2's precedence table, rule by rule. */
export function presentSection(
	entries: readonly SourceStatusEntry[],
	counts: CoverageCounts,
	now: number
): SectionPresentation {
	const evaluated = entries.map((e) => ({ ...e, state: effectiveState(e, now) }));
	const failing = evaluated.filter((e) => FAILING.has(e.state));
	const healthy = evaluated.some((e) => HEALTHY.has(e.state));
	const loading = evaluated.some((e) => e.state === 'loading');
	const as = (state: SectionState): SectionPresentation => ({
		state,
		failing,
		asOf: state === 'stale' ? oldestObservation(failing) : null,
		entries: evaluated
	});

	if (evaluated.length === 0) return as('unknown'); // 1
	if (counts.matching > 0) {
		if (failing.length === 0) return as('ok'); // 2
		if (!healthy && !loading && failing.every((e) => e.state === 'stale')) return as('stale'); // 3
		return as('partial'); // 4
	}
	if (loading) return as('loading'); // 5
	if (counts.total > 0) return as('no-match'); // 6
	if (healthy) return as('empty'); // 7
	if (failing.some((e) => e.state === 'unavailable')) return as('unavailable'); // 8
	if (failing.some((e) => e.state === 'stale')) return as('stale');
	return as('unknown');
}

function names(entries: readonly SourceStatusEntry[]): string {
	const shown = entries
		.slice(0, MAX_NAMES)
		.map((e) => e.name)
		.join(', ');
	return entries.length > MAX_NAMES ? `${shown} +${entries.length - MAX_NAMES} more` : shown;
}

const VERB: Record<string, string> = {
	stale: 'out of date',
	unavailable: 'unavailable',
	unknown: 'unverified'
};

/** One verb when every failing source shares a state; otherwise the generic "unavailable or unverified". */
function verbFor(failing: readonly SourceStatusEntry[]): string {
	const states = new Set(failing.map((e) => e.state));
	return states.size === 1 ? VERB[[...states][0]] : 'unavailable or unverified';
}

/** " · <names> <verb>" when anything is failing; coverage is independent of the match state. */
function coverage(failing: readonly SourceStatusEntry[]): string {
	return failing.length ? ` · ${names(failing)} ${verbFor(failing)}` : '';
}

/** One short, honest status line for a section header; null only when everything is fine. */
export function describePresentation(p: SectionPresentation, now: number): string | null {
	switch (p.state) {
		case 'ok':
			return null;
		case 'loading':
			return `Loading…${coverage(p.failing)}`;
		case 'empty':
			return `Nothing new${coverage(p.failing)}`;
		case 'no-match':
			return `Nothing for this town${coverage(p.failing)}`;
		case 'partial':
			return `Partial coverage${coverage(p.failing)}`;
		case 'stale':
			return `${p.asOf === null ? 'Out of date' : `As of ${formatAsOf(p.asOf, now)}`}${coverage(p.failing)}`;
		case 'unavailable':
			return `Source unavailable · ${names(p.failing)}`;
		case 'unknown':
			return `Status unknown${coverage(p.failing) || ' · no source reports'}`;
	}
}

export interface SourceWords {
	/** The state, in words: "Reporting", "Unavailable: <why>". */
	body: string;
	/** Its time with its verb, and any note; null when there is nothing honest to add. */
	meta: string | null;
	/** Shown in the status colour. */
	attention: boolean;
}

/** One source in a reader's words (rule 7): from its state, failure kind and times, never its detail. */
export function sourceWords(entry: SourceStatusEntry, now: number): SourceWords {
	const state = effectiveState(entry, now);
	const at = entry.observedAt;
	const time = (verb: string) =>
		at !== null && Number.isFinite(at) ? `${verb} ${formatAsOf(at, now)}` : null;
	const why = FAILURE_WORDS[entry.failure ?? 'unknown'];
	const said = (body: string, meta: string | null, attention: boolean): SourceWords => ({
		body,
		meta: [meta, entry.note].filter(Boolean).join(' · ') || null,
		attention
	});
	switch (state) {
		case 'ok':
			return said('Reporting', time('checked') ?? 'time not reported', false);
		case 'loading':
			return said('Checking…', null, false);
		case 'reference':
			return said('A maintained list', null, false);
		case 'stale':
			return entry.failure
				? said(`Not current: ${why}`, time('showing what it sent at'), true)
				: said('Out of date', time('last updated'), true);
		case 'unavailable':
			return said(
				`Unavailable: ${why}`,
				time('last successfully checked') ?? 'time of the last successful check not reported',
				true
			);
		case 'unknown':
			return said('Unverified', entry.failure ? why : null, true);
	}
}

/** Each failing source in reader words, for the header's disclosure. */
export function coverageDetails(p: SectionPresentation, now: number): string[] {
	return p.failing.map((e) => {
		const w = sourceWords(e, now);
		return `${e.name}: ${w.body}${w.meta ? ` · ${w.meta}` : ''}`;
	});
}
