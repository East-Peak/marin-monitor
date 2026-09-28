/**
 * The one health evaluator. Pure and clock-injected: given the source
 * inventory, what was observed in blob storage, and "now", it classifies every
 * source. `/api/health` and `/api/cron/check-freshness` both call this, so they
 * cannot disagree.
 *
 * A source is acceptable only when it is `ok` (observed inside its max age) or
 * declared `reference` data. Anything we cannot vouch for — a missing, malformed
 * or future timestamp, an unreadable blob — is `unknown`, never `ok`.
 */

export type Cadence = 'daily' | 'weekly' | 'monthly';
export type SourceStatus = 'ok' | 'stale' | 'unavailable' | 'reference' | 'unknown';

export interface SourcePolicy {
	readonly name: string;
	readonly blobKey: string;
	readonly cadence: Cadence;
	/** Maximum age of the observation, in days, before the source is stale. */
	readonly maxAgeDays: number;
	/**
	 * Which timestamp counts as an observation. `content` = the scrape
	 * metadata inside the blob (`lastSuccessfulScrapeAt`): a fallback write
	 * does not advance it. `upload` = blob upload time, for snapshot datasets
	 * whose every write is a real observation.
	 */
	readonly observedAt: 'content' | 'upload';
	/** Deliberately static data: acceptable at any age, but must exist. */
	readonly reference?: true;
	readonly note?: string;
}

export interface SubsourceFailure {
	readonly name: string;
	readonly parent: string;
	readonly problem: string;
	readonly disposition: string;
}

export interface HealthInventory {
	readonly sources: readonly SourcePolicy[];
	readonly subsourceFailures: readonly SubsourceFailure[];
}

export type Observation =
	| { kind: 'found'; uploadedAt: string | null; contentTimestamp: unknown }
	| { kind: 'missing' }
	| { kind: 'error' };

export interface SourceResult {
	name: string;
	status: SourceStatus;
	reason: string | null;
	cadence: Cadence;
	maxAgeDays: number;
	observedAt: string | null;
	ageDays: number | null;
}

export interface SubsourceResult extends SubsourceFailure {
	status: 'unavailable';
}

export interface HealthReport {
	status: 'healthy' | 'degraded';
	summary: Record<SourceStatus, number> & { total: number };
	sources: SourceResult[];
	subsources: SubsourceResult[];
}

const DAY_MS = 86_400_000;
/** Timestamps up to this far ahead of `now` are clock skew, not corruption. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const ACCEPTABLE: ReadonlySet<SourceStatus> = new Set(['ok', 'reference']);

/** Full ISO-8601 date-time with an explicit zone, e.g. 2026-09-28T12:00:00.000Z. */
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Parse a strict ISO timestamp; `Date.parse` alone rolls 2026-02-30 over to March 2. */
function parseTimestamp(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const match = ISO_DATE_TIME.exec(value);
	if (!match) return null;
	const [year, month, day] = match.slice(1, 4).map(Number);
	const calendar = new Date(Date.UTC(year, month - 1, day));
	if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

function evaluateSource(
	policy: SourcePolicy,
	observation: Observation | undefined,
	now: Date
): SourceResult {
	const result = (
		status: SourceStatus,
		reason: string | null,
		observedAt: string | null = null,
		ageDays: number | null = null
	): SourceResult => ({
		name: policy.name,
		status,
		reason,
		cadence: policy.cadence,
		maxAgeDays: policy.maxAgeDays,
		observedAt,
		ageDays
	});

	if (!observation) return result('unknown', 'not observed');
	if (observation.kind === 'missing') return result('unavailable', 'blob missing');
	if (observation.kind === 'error') return result('unknown', 'blob unreadable');

	const raw =
		policy.observedAt === 'content' ? observation.contentTimestamp : observation.uploadedAt;
	if (raw === null || raw === undefined) {
		return policy.reference
			? result('reference', null)
			: result('unknown', 'no observation timestamp');
	}

	const observedMs = parseTimestamp(raw);
	if (observedMs === null) return result('unknown', 'malformed observation timestamp');

	const ageMs = now.getTime() - observedMs;
	if (ageMs < -FUTURE_TOLERANCE_MS)
		return result('unknown', 'observation timestamp is in the future');

	const observedAt = new Date(observedMs).toISOString();
	const ageDays = Math.round((Math.max(ageMs, 0) / DAY_MS) * 10) / 10;
	if (policy.reference) return result('reference', null, observedAt, ageDays);
	if (ageMs > policy.maxAgeDays * DAY_MS) {
		return result('stale', `older than ${policy.maxAgeDays}d`, observedAt, ageDays);
	}
	return result('ok', null, observedAt, ageDays);
}

export function evaluate(
	inventory: HealthInventory,
	observations: Readonly<Record<string, Observation>>,
	now: Date
): HealthReport {
	if (Number.isNaN(now.getTime())) throw new Error('evaluate: invalid clock');
	const sources = inventory.sources.map((policy) =>
		evaluateSource(policy, observations[policy.name], now)
	);
	const subsources: SubsourceResult[] = inventory.subsourceFailures.map((failure) => ({
		...failure,
		status: 'unavailable'
	}));

	const summary: HealthReport['summary'] = {
		total: sources.length,
		ok: 0,
		stale: 0,
		unavailable: 0,
		reference: 0,
		unknown: 0
	};
	for (const source of sources) summary[source.status] += 1;

	const healthy =
		sources.length > 0 && subsources.length === 0 && sources.every((s) => ACCEPTABLE.has(s.status));
	return { status: healthy ? 'healthy' : 'degraded', summary, sources, subsources };
}
