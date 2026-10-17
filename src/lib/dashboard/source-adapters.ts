/**
 * Maps every provenance the v2 dashboard actually has onto the state model
 * (spec §13.2; Decision 4's minimum G1a subset). Provenance travels with the
 * value: a time enters only from the payload that carried the value, a
 * transport success says nothing about data age, and a retained value keeps
 * the time it arrived with. A source that cannot report failure is unknown.
 * USGS (`metadata.generated`) and 311 (`lastUpdated`) report their payload's
 * time; a read of either without one is unknown, never ok.
 */
import type { NewsSnapshotView } from '$lib/news/snapshot';
import type { PartOutcome, TvNewsPart } from '$lib/components/tv/tv-news';
import { parseObservedAt, type SourceState, type SourceStatusEntry } from './source-status';

export const SNAPSHOT_OBSERVATION_MAX_AGE_MS = 45 * 60_000;
const DAY_MS = 86_400_000;
const SWALLOWS = 'failures not reported by this source';
const NO_AGE = 'fetched; data age not reported';

/**
 * How old a status-aware part's payload may be and still read ok. 311 is G0a's
 * own policy (SOURCE_INVENTORY: 1 day; the cron runs every 4 h). USGS: a healthy
 * page's `generated` is never more than ~11 min old (5-min refresh and client
 * TTL, 60 s CDN), so 30 min is 4–6 missed cycles.
 */
export const PART_OBSERVATION_MAX_AGE_MS = {
	earthquakes: 30 * 60_000,
	seeclickfix: DAY_MS
} as const satisfies Record<'earthquakes' | 'seeclickfix', number>;

export const STATUS_AWARE_PARTS: ReadonlySet<TvNewsPart> = new Set([
	'snapshot',
	'earthquakes',
	'seeclickfix'
]);

export const PART_NAMES: Record<TvNewsPart, string> = {
	snapshot: 'News snapshot',
	nps: 'NPS alerts',
	earthquakes: 'USGS earthquakes',
	transit: 'Transit alerts',
	'sheriff-blotter': 'Sheriff blotter',
	'police-logs': 'Police logs',
	'supplemental-activity': 'Community activity',
	seeclickfix: 'Fix It Marin (311)'
};

export function fromSnapshotSource(source: NewsSnapshotView['sources'][number]): SourceStatusEntry {
	const base = {
		id: `news:${source.id}`,
		name: source.name,
		observedAt: parseObservedAt(source.lastSuccessAt),
		maxAgeMs: SNAPSHOT_OBSERVATION_MAX_AGE_MS
	};
	switch (source.status) {
		case 'ok':
		case 'empty':
			return { ...base, state: 'ok', detail: null };
		case 'retained':
			return { ...base, state: 'stale', detail: source.lastError };
		case 'failed':
			return { ...base, state: 'unavailable', detail: source.lastError };
		default:
			return { ...base, state: 'unknown', detail: 'unrecognized status' };
	}
}

export function fromSnapshotRead(
	outcome: PartOutcome | undefined,
	view: NewsSnapshotView | null
): SourceStatusEntry {
	const base = {
		id: 'part:snapshot',
		name: PART_NAMES.snapshot,
		observedAt: view ? parseObservedAt(view.lastSuccessfulScrapeAt) : null,
		maxAgeMs: SNAPSHOT_OBSERVATION_MAX_AGE_MS
	};
	if (!outcome) return { ...base, state: 'loading', detail: null };
	if (outcome.ok) return { ...base, state: 'ok', detail: null };
	return { ...base, state: view ? 'stale' : 'unavailable', detail: outcome.error };
}

/**
 * The snapshot a page arrived with (DASH-FLIP1's SSR read): an ok read dated by the
 * snapshot's own generatedAt, never the request time.
 */
export function seededSnapshotOutcome(view: NewsSnapshotView): PartOutcome {
	return { ok: true, at: Date.parse(view.generatedAt), observedAt: null };
}

/** The snapshot entries SSR and the seeded controller both derive (so hydration matches). */
export function seededSnapshotEntries(view: NewsSnapshotView): SourceStatusEntry[] {
	return [
		fromSnapshotRead(seededSnapshotOutcome(view), view),
		...view.sources.map(fromSnapshotSource)
	];
}

/**
 * A loader part's entry. An ok read is ok only with its payload's own time,
 * judged by its part's max age; a failure after a success is stale with the
 * last good read's time (`lastGoodObservedAt`, null when that read had none).
 */
export function fromLoaderPart(
	part: Exclude<TvNewsPart, 'snapshot'>,
	outcome: PartOutcome | undefined,
	hadSuccess: boolean,
	lastGoodObservedAt: number | null = null
): SourceStatusEntry {
	const base = { id: `part:${part}`, name: PART_NAMES[part], observedAt: null, maxAgeMs: null };
	if (!outcome) return { ...base, state: 'loading', detail: null };
	if (outcome.ok) {
		if (outcome.observedAt !== null && (part === 'earthquakes' || part === 'seeclickfix')) {
			const maxAgeMs = PART_OBSERVATION_MAX_AGE_MS[part];
			return { ...base, state: 'ok', observedAt: outcome.observedAt, maxAgeMs, detail: null };
		}
		return { ...base, state: 'unknown', detail: STATUS_AWARE_PARTS.has(part) ? NO_AGE : SWALLOWS };
	}
	if (!hadSuccess) return { ...base, state: 'unavailable', detail: outcome.error };
	return { ...base, state: 'stale', observedAt: lastGoodObservedAt, detail: outcome.error };
}

// ── Datasets (/api/data/*): provenance is the payload's own scrape time ──────

export type DatasetFetch =
	| { kind: 'live'; observedAt: number | null }
	| { kind: 'fallback'; dataSource: string; observedAt: number | null }
	| { kind: 'failed'; error: string; retained: boolean; observedAt: number | null };

export function datasetEntry(
	id: string,
	name: string,
	fetch: DatasetFetch | undefined,
	maxAgeMs: number | null
): SourceStatusEntry {
	const base = { id: `dataset:${id}`, name, observedAt: fetch?.observedAt ?? null, maxAgeMs };
	if (!fetch) return { ...base, state: 'loading', detail: null };
	switch (fetch.kind) {
		case 'live':
			return { ...base, state: 'ok', detail: null };
		case 'fallback':
			return { ...base, state: 'stale', detail: `served from ${fetch.dataSource}` };
		case 'failed':
			return { ...base, state: fetch.retained ? 'stale' : 'unavailable', detail: fetch.error };
	}
}

// ── G0a (/api/health public JSON), for the health indicator ────────────────

export interface HealthSourceJson {
	name: string;
	status: SourceState;
	reason: string | null;
	maxAgeDays: number;
	observedAt: string | null;
	accepted?: { reason: string; expiresAt: string };
}

export interface HealthSubsourceJson {
	name: string;
	parent: string;
	status: 'unavailable';
	acceptedUntil?: string;
}

const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
	timeZone: 'UTC',
	month: 'short',
	day: 'numeric'
});
const monthDay = (iso: string) => {
	const ms = parseObservedAt(iso);
	return ms === null ? 'an unknown date' : MONTH_DAY.format(ms);
};

export function fromHealthSource(s: HealthSourceJson): SourceStatusEntry {
	return {
		id: `health:${s.name}`,
		name: s.name,
		state: s.status,
		observedAt: parseObservedAt(s.observedAt),
		maxAgeMs: s.status === 'reference' ? null : s.maxAgeDays * DAY_MS,
		detail: s.accepted
			? `Known issue until ${monthDay(s.accepted.expiresAt)}: ${s.accepted.reason}`
			: s.reason
	};
}

export function fromHealthSubsource(s: HealthSubsourceJson): SourceStatusEntry {
	return {
		id: `health:${s.parent}/${s.name}`,
		name: s.name,
		state: 'unavailable',
		observedAt: null,
		maxAgeMs: null,
		detail: s.acceptedUntil
			? `Part of ${s.parent}; known issue until ${monthDay(s.acceptedUntil)}`
			: `Part of ${s.parent}`
	};
}
