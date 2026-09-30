/**
 * The NWS advisory contract behind the v2 advisory row (spec §2.2, §13.1).
 *
 * Zones come from the corrected config (Marin forecast zones CAZ502, CAZ505,
 * CAZ506 and county CAC041; measured 2026-09-29). Only `Actual` messages; a
 * Cancel, and anything another message references, never shows. Expiry is
 * evaluated against the clock. An alert is excluded only when its own fields
 * prove it doesn't apply; any other defect makes it unreadable, and the row
 * says coverage is degraded. Never a silent "no advisories".
 */
import { NWS_ALERT_ZONES } from '$lib/config/map';
import { parseFeedDate } from '$lib/news/feed-date';

export const MARIN_ALERT_ZONES: readonly string[] = NWS_ALERT_ZONES;
/** Three 5-minute refreshes; older coverage is reported, not trusted. */
export const ADVISORY_MAX_AGE_MS = 15 * 60_000;
const SKEW_MS = 5 * 60_000;
const isCountyZone = (zone: string) => zone.startsWith('CAC');
const FORECAST_ZONES = MARIN_ALERT_ZONES.filter((z) => !isCountyZone(z));

const ZONE_LABELS: Record<string, string> = {
	CAZ502: 'Marin Coastal Range',
	CAZ505: 'North Bay coast',
	CAZ506: 'North Bay interior valleys'
};

export type AdvisorySeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
const SEVERITY_RANK: Record<AdvisorySeverity, number> = {
	Extreme: 0,
	Severe: 1,
	Moderate: 2,
	Minor: 3,
	Unknown: 4
};
const MESSAGE_TYPES = new Set(['Alert', 'Update', 'Cancel']);

export interface Advisory {
	id: string;
	event: string;
	headline: string | null;
	severity: AdvisorySeverity;
	messageType: 'Alert' | 'Update' | 'Cancel';
	sentAt: number;
	effectiveAt: number;
	/** When this message stops being valid (NWS `expires`). */
	expiresAt: number;
	/** When the hazard is expected to end (NWS `ends`), if stated. */
	endsAt: number | null;
	/** Ids of earlier messages this one updates or cancels. */
	references: string[];
	/** The Marin zones this alert names. */
	zones: string[];
}

export interface ParsedAlerts {
	advisories: Advisory[];
	/** Alerts that may apply to Marin but could not be read. */
	unreadable: number;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const instant = (v: unknown): number | null => (typeof v === 'string' ? parseFeedDate(v) : null);
/** NWS UGC code: state, C (county) or Z (zone), three digits, e.g. CAZ506, CAC041. */
const UGC_CODE = /^[A-Z]{2}[CZ]\d{3}$/;
const isUgcCode = (z: unknown): z is string => typeof z === 'string' && UGC_CODE.test(z);
const EXCLUDED = 'excluded' as const;
const UNREADABLE = 'unreadable' as const;

function classify(feature: unknown): Advisory | typeof EXCLUDED | typeof UNREADABLE {
	if (!isRec(feature) || !isRec(feature.properties)) return UNREADABLE;
	const p = feature.properties;
	// Excluded only on proof from the alert's own fields.
	if (typeof p.status !== 'string') return UNREADABLE;
	if (p.status !== 'Actual') return EXCLUDED;
	const ugc = isRec(p.geocode) ? p.geocode.UGC : undefined;
	// Non-intersection proves irrelevance only for a syntactically valid list (Codex r2 #5).
	if (!Array.isArray(ugc) || ugc.length === 0 || !ugc.every(isUgcCode)) return UNREADABLE;
	const zones = MARIN_ALERT_ZONES.filter((z) => ugc.includes(z));
	if (zones.length === 0) return EXCLUDED;
	// It applies to Marin: from here any defect is unreadable, never dropped.
	if (!MESSAGE_TYPES.has(p.messageType as string)) return UNREADABLE;
	if (typeof p.id !== 'string' || !p.id || typeof p.event !== 'string' || !p.event)
		return UNREADABLE;
	const sentAt = instant(p.sent);
	const effectiveAt = instant(p.effective);
	const expiresAt = instant(p.expires);
	if (sentAt === null || effectiveAt === null || expiresAt === null || expiresAt <= effectiveAt)
		return UNREADABLE;
	const hasEnd = p.ends !== null && p.ends !== undefined;
	const endsAt = hasEnd ? instant(p.ends) : null;
	if (hasEnd && endsAt === null) return UNREADABLE;
	// Malformed lifecycle references could hide an update or cancellation: unreadable, never dropped.
	if (p.references !== undefined && p.references !== null && !Array.isArray(p.references))
		return UNREADABLE;
	const rawRefs: unknown[] = Array.isArray(p.references) ? p.references : [];
	if (
		!rawRefs.every((r) => isRec(r) && typeof r.identifier === 'string' && r.identifier.length > 0)
	)
		return UNREADABLE;
	const references = rawRefs.map((r) => (r as Rec).identifier as string);
	// hasOwn, not `in`: a severity of "toString" must read Unknown, not a prototype member.
	const severity = Object.hasOwn(SEVERITY_RANK, p.severity as string)
		? (p.severity as AdvisorySeverity)
		: 'Unknown';
	return {
		id: p.id,
		event: p.event,
		headline: typeof p.headline === 'string' ? p.headline : null,
		severity,
		messageType: p.messageType as Advisory['messageType'],
		sentAt,
		effectiveAt,
		expiresAt,
		endsAt,
		references,
		zones
	};
}

export function parseNwsAlerts(json: unknown): ParsedAlerts | null {
	if (!isRec(json) || !Array.isArray(json.features)) return null;
	const advisories: Advisory[] = [];
	let unreadable = 0;
	for (const feature of json.features) {
		const result = classify(feature);
		if (result === UNREADABLE) unreadable += 1;
		else if (result !== EXCLUDED) advisories.push(result);
	}
	return { advisories, unreadable };
}

export function currentAdvisories(list: readonly Advisory[], now: number): Advisory[] {
	const superseded = new Set(list.flatMap((a) => a.references));
	return list
		.filter(
			(a) =>
				a.messageType !== 'Cancel' &&
				!superseded.has(a.id) &&
				a.effectiveAt <= now + SKEW_MS &&
				now < a.expiresAt
		)
		.sort(
			(a, b) =>
				SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
				b.sentAt - a.sentAt ||
				a.id.localeCompare(b.id)
		);
}

export function advisoryScope(zones: readonly string[]): string {
	if (zones.some(isCountyZone) || FORECAST_ZONES.every((z) => zones.includes(z)))
		return 'County-wide';
	return zones.map((z) => ZONE_LABELS[z] ?? z).join(' · ');
}

export interface AdvisoryFeedState {
	advisories: Advisory[];
	/** Unreadable Marin alerts in the last successful read. */
	unreadable: number;
	lastAttemptAt: number | null;
	lastSuccessAt: number | null;
	lastError: string | null;
}

export type AdvisoryRow =
	| { kind: 'hidden' }
	| { kind: 'alerts'; advisories: Advisory[]; notUpdatedSince: number | null; unreadable: number }
	| { kind: 'unavailable'; lastSuccessAt: number | null; unreadable: number };

export function advisoryRow(feed: AdvisoryFeedState, now: number): AdvisoryRow {
	if (feed.lastAttemptAt === null) return { kind: 'hidden' };
	const active = currentAdvisories(feed.advisories, now);
	const fresh =
		feed.lastError === null &&
		feed.lastSuccessAt !== null &&
		now - feed.lastSuccessAt <= ADVISORY_MAX_AGE_MS;
	const { unreadable } = feed;
	if (fresh && unreadable === 0 && active.length === 0) return { kind: 'hidden' };
	if (active.length)
		return {
			kind: 'alerts',
			advisories: active,
			notUpdatedSince: fresh ? null : feed.lastSuccessAt,
			unreadable
		};
	return { kind: 'unavailable', lastSuccessAt: feed.lastSuccessAt, unreadable };
}
