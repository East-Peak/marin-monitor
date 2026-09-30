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
}

export function summarizeHealth(
	report: HealthReportJson | null,
	fetch: DatasetFetch | undefined,
	now: number
): HealthSummary {
	if (!fetch && !report) return { state: 'checking', label: HEALTH_LABELS.checking, degraded: [] };
	if (!report) return { state: 'unknown', label: HEALTH_LABELS.unknown, degraded: [] };
	const degraded = [
		...report.sources.map(fromHealthSource),
		...report.subsources.map(fromHealthSubsource)
	]
		.map((e) => ({ ...e, state: effectiveState(e, now) }))
		.filter((e) => e.state !== 'ok' && e.state !== 'reference');
	if (fetch?.kind === 'failed')
		return { state: 'unknown', label: HEALTH_LABELS.staleReport, degraded };
	if (degraded.length)
		return { state: 'degraded', label: HEALTH_LABELS.degraded(degraded.length), degraded };
	if (report.status !== 'healthy')
		return { state: 'degraded', label: HEALTH_LABELS.degradedUnlisted, degraded };
	return { state: 'ok', label: HEALTH_LABELS.allOk, degraded };
}
