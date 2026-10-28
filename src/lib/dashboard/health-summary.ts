/**
 * The header's source-health indicator (spec §2.1, G0a): what is degraded,
 * re-evaluated against the clock. Fails closed: "all OK" only when G0a says
 * healthy AND nothing is degraded now.
 */
import type { HealthReportJson } from '$lib/api/marin/health-report';
import { HEALTH_LABELS } from './health-labels';
import { fromHealthSource, fromHealthSubsource, type DatasetFetch } from './source-adapters';
import { effectiveState, type SourceStatusEntry } from './source-status';

export interface HealthSummary {
	state: 'checking' | 'unknown' | 'ok' | 'degraded';
	label: string;
	degraded: SourceStatusEntry[];
	/** Every monitored source, evaluated against the clock: the health dialog's list (rule 6). */
	all: SourceStatusEntry[];
}

export function summarizeHealth(
	report: HealthReportJson | null,
	fetch: DatasetFetch | undefined,
	now: number
): HealthSummary {
	if (!fetch && !report)
		return { state: 'checking', label: HEALTH_LABELS.checking, degraded: [], all: [] };
	if (!report) return { state: 'unknown', label: HEALTH_LABELS.unknown, degraded: [], all: [] };
	const all = [
		...report.sources.map(fromHealthSource),
		...report.subsources.map(fromHealthSubsource)
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
