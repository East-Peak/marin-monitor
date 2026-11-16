/**
 * The header's source-health indicator (spec §2.1, G0a): what is degraded,
 * re-evaluated against the clock. Fails closed: "all OK" only when G0a says
 * healthy AND nothing is degraded now, and none of this browser's own live reads
 * failed or fell back: the server's report can't see what the page's reads see.
 */
import type { HealthReportJson } from '$lib/api/marin/health-report';
import { HEALTH_LABELS } from './health-labels';
import {
	datasetEntry,
	fromHealthSource,
	fromHealthSubsource,
	type DatasetFetch
} from './source-adapters';
import { effectiveState, type SourceStatusEntry } from './source-status';

export interface HealthSummary {
	state: 'checking' | 'unknown' | 'ok' | 'degraded';
	label: string;
	degraded: SourceStatusEntry[];
	/** Every monitored source, evaluated against the clock: the health dialog's list (rule 6). */
	all: SourceStatusEntry[];
}

/**
 * The page's own dataset reads that failed or were served from a fallback, as source entries.
 * `health` is the report's own read and says so in its own label.
 */
export function failingReads(
	outcomes: Readonly<Record<string, DatasetFetch>>,
	names: Readonly<Record<string, string>>
): SourceStatusEntry[] {
	return Object.entries(outcomes)
		.filter(([id, fetch]) => id !== 'health' && fetch.kind !== 'live')
		.map(([id, fetch]) => datasetEntry(id, `${names[id] ?? id} (read by this page)`, fetch, null));
}

export function summarizeHealth(
	report: HealthReportJson | null,
	fetch: DatasetFetch | undefined,
	now: number,
	reads: readonly SourceStatusEntry[] = []
): HealthSummary {
	// Without the report there is nothing to say about the server, but the page's own failing
	// reads are known and still listed.
	const own = reads.map((e) => ({ ...e, state: effectiveState(e, now) }));
	if (!fetch && !report)
		return { state: 'checking', label: HEALTH_LABELS.checking, degraded: own, all: own };
	if (!report) return { state: 'unknown', label: HEALTH_LABELS.unknown, degraded: own, all: own };
	const all = [
		...report.sources.map(fromHealthSource),
		...report.subsources.map(fromHealthSubsource),
		...reads
	].map((e) => ({ ...e, state: effectiveState(e, now) }));
	const degraded = all.filter((e) => e.state !== 'ok' && e.state !== 'reference');
	const said = { degraded, all };
	if (fetch?.kind === 'failed')
		return { state: 'unknown', label: HEALTH_LABELS.staleReport, ...said };
	if (degraded.length)
		return { state: 'degraded', label: HEALTH_LABELS.degraded(degraded.length), ...said };
	if (report.status !== 'healthy')
		return { state: 'degraded', label: HEALTH_LABELS.degradedUnlisted, ...said };
	return { state: 'ok', label: HEALTH_LABELS.allOk, ...said };
}
