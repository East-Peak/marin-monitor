/**
 * Maps every provenance the v2 dashboard actually has onto the state model
 * (spec §13.2; Decision 4's minimum G1a subset). Provenance travels with the
 * value: a time enters only from the payload that carried the value, a
 * transport success says nothing about data age, and a retained value keeps
 * the time it arrived with. A source that cannot report failure is unknown.
 */
import type { NewsSnapshotView } from '$lib/news/snapshot';
import type { PartOutcome, TvNewsPart } from '$lib/components/tv/tv-news';
import { parseObservedAt, type SourceState, type SourceStatusEntry } from './source-status';

export const SNAPSHOT_OBSERVATION_MAX_AGE_MS = 45 * 60_000;
const DAY_MS = 86_400_000;
const SWALLOWS = 'failures not reported by this source';
const NO_AGE = 'fetched; data age not reported';

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

export function fromLoaderPart(
	part: Exclude<TvNewsPart, 'snapshot'>,
	outcome: PartOutcome | undefined,
	hadSuccess: boolean
): SourceStatusEntry {
	const base = { id: `part:${part}`, name: PART_NAMES[part], observedAt: null, maxAgeMs: null };
	if (!outcome) return { ...base, state: 'loading', detail: null };
	if (outcome.ok) {
		return { ...base, state: 'unknown', detail: STATUS_AWARE_PARTS.has(part) ? NO_AGE : SWALLOWS };
	}
	return { ...base, state: hadSuccess ? 'stale' : 'unavailable', detail: outcome.error };
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
