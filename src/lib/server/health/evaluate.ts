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

/**
 * A time-boxed decision that one known failure does not page anyone. It never
 * changes what a source *is*: the status stays factual, and only the exact
 * accepted condition is covered. Expired or malformed exceptions fail closed.
 */
export interface AcceptedException {
	/** Source or subsource name. */
	readonly name: string;
	/** The one status being accepted (e.g. `stale`); any other failure still counts. */
	readonly condition: Exclude<SourceStatus, 'ok' | 'reference'>;
	readonly reason: string;
	readonly approvedBy: string;
	readonly approvedAt: string;
	/** Exact UTC instant (strict ISO) after which the failure counts again. */
	readonly expiresAt: string;
}

export interface Acceptance {
	reason: string;
	expiresAt: string;
}

export interface HealthInventory {
	readonly sources: readonly SourcePolicy[];
	readonly subsourceFailures: readonly SubsourceFailure[];
	readonly exceptions?: readonly AcceptedException[];
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
	/** Present only while an active exception covers this exact status. */
	accepted?: Acceptance;
}

export interface SubsourceResult extends SubsourceFailure {
	status: 'unavailable';
	accepted?: Acceptance;
}

export interface HealthReport {
	/** Factual: `healthy` only when every source is ok/reference and no subsource fails. */
	status: 'healthy' | 'degraded';
	/** `healthy`, or degraded only by failures covered by active exceptions. Drives HTTP 200/503. */
	acceptable: boolean;
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

/** The acceptance covering `name` in `condition` at `now`, if one is active. */
function activeAcceptance(
	exceptions: readonly AcceptedException[],
	name: string,
	condition: SourceStatus,
	now: Date
): Acceptance | undefined {
	for (const exception of exceptions) {
		if (exception.name !== name || exception.condition !== condition) continue;
		if (!exception.reason.trim() || !exception.approvedBy.trim()) continue;
		const approvedMs = parseTimestamp(exception.approvedAt);
		const expiresMs = parseTimestamp(exception.expiresAt);
		if (approvedMs === null || approvedMs > now.getTime()) continue;
		if (expiresMs === null || expiresMs <= now.getTime()) continue;
		return { reason: exception.reason, expiresAt: exception.expiresAt };
	}
	return undefined;
}

export function evaluate(
	inventory: HealthInventory,
	observations: Readonly<Record<string, Observation>>,
	now: Date
): HealthReport {
	if (Number.isNaN(now.getTime())) throw new Error('evaluate: invalid clock');
	const exceptions = inventory.exceptions ?? [];
	const sources = inventory.sources.map((policy) => {
		const result = evaluateSource(policy, observations[policy.name], now);
		if (ACCEPTABLE.has(result.status)) return result;
		const accepted = activeAcceptance(exceptions, result.name, result.status, now);
		return accepted ? { ...result, accepted } : result;
	});
	const subsources: SubsourceResult[] = inventory.subsourceFailures.map((failure) => {
		const accepted = activeAcceptance(exceptions, failure.name, 'unavailable', now);
		return accepted
			? { ...failure, status: 'unavailable', accepted }
			: { ...failure, status: 'unavailable' };
	});

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
	const acceptable =
		sources.length > 0 &&
		sources.every((s) => ACCEPTABLE.has(s.status) || s.accepted) &&
		subsources.every((s) => s.accepted);
	return { status: healthy ? 'healthy' : 'degraded', acceptable, summary, sources, subsources };
}
