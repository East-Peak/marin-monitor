/**
 * The public G0a report (GET /api/health) for the v2 source-health indicator.
 * 200 = no unaccepted failure; 503 = degraded. Both carry the same JSON and
 * are reads. The body is validated strictly: anything malformed or an empty
 * inventory is a failure, never "all OK".
 */
import type { HealthSourceJson, HealthSubsourceJson } from '$lib/dashboard/source-adapters';
import { parseObservedAt } from '$lib/dashboard/source-status';
import type { FetchResult } from './data-fetcher';
import { fetchAndRead, type OwnerOptions } from './fetch-helpers';

export interface HealthReportJson {
	status: 'healthy' | 'degraded';
	sources: HealthSourceJson[];
	subsources: HealthSubsourceJson[];
}

const STATES = new Set(['ok', 'stale', 'unavailable', 'reference', 'unknown']);
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const time = (v: unknown) => typeof v === 'string' && parseObservedAt(v) !== null;

function isSource(v: unknown): v is HealthSourceJson {
	return (
		isRec(v) &&
		text(v.name) &&
		STATES.has(v.status as string) &&
		(v.reason === null || typeof v.reason === 'string') &&
		typeof v.maxAgeDays === 'number' &&
		Number.isFinite(v.maxAgeDays) &&
		v.maxAgeDays > 0 &&
		(v.observedAt === null || time(v.observedAt)) &&
		(v.accepted === undefined ||
			(isRec(v.accepted) && text(v.accepted.reason) && time(v.accepted.expiresAt)))
	);
}

function isSubsource(v: unknown): v is HealthSubsourceJson {
	return (
		isRec(v) &&
		text(v.name) &&
		text(v.parent) &&
		v.status === 'unavailable' &&
		(v.acceptedUntil === undefined || time(v.acceptedUntil))
	);
}

export function parseHealthReport(json: unknown): HealthReportJson | null {
	if (!isRec(json) || (json.status !== 'healthy' && json.status !== 'degraded')) return null;
	const { sources, subsources } = json;
	if (!Array.isArray(sources) || sources.length === 0 || !sources.every(isSource)) return null;
	if (!Array.isArray(subsources) || !subsources.every(isSubsource)) return null;
	return { status: json.status, sources, subsources };
}

const EMPTY: HealthReportJson = { status: 'degraded', sources: [], subsources: [] };

export async function fetchHealthReport({ signal }: OwnerOptions = {}): Promise<
	FetchResult<HealthReportJson>
> {
	try {
		// Body-inclusive: the owner and the deadline stay attached until the JSON is read.
		return await fetchAndRead(
			'/api/health',
			{ headers: { Accept: 'application/json' }, signal },
			async (res): Promise<FetchResult<HealthReportJson>> => {
				if (res.status !== 200 && res.status !== 503)
					return { ok: false, error: `HTTP ${res.status}`, fallback: EMPTY };
				const report = parseHealthReport(await res.json());
				if (!report) return { ok: false, error: 'not a valid health report', fallback: EMPTY };
				return { ok: true, data: report, dataSource: 'live' };
			}
		);
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err), fallback: EMPTY };
	}
}
