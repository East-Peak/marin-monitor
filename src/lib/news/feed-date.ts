/**
 * Feed dates: strict parsing and publication-time classification.
 *
 * Accepted: RFC 822/2822 (RSS pubDate) and ISO 8601 date-times with an
 * explicit zone. A zone-less date-time is accepted ONLY for a source whose
 * config declares `assumedTimeZone` (NBC sends "Fri, Sep 25 2026 11:48:58 AM"),
 * and the assumption is recorded as provenance. Rejected (→ unknown, never
 * "now"): date-only values, zone-less values without a declared zone,
 * impossible calendar dates, pre-1995 placeholders, and anything more than
 * FUTURE_SKEW_MS ahead of the injected clock.
 */
import type { DateCandidate, PublishedAtSource } from './feed-xml';

export const FUTURE_SKEW_MS = 5 * 60_000;
/** RSS postdates this; earlier values are placeholders (epoch 0). */
const EARLIEST_MS = Date.UTC(1995, 0, 1);

const MONTHS: ReadonlyMap<string, number> = new Map(
	['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].map(
		(m, i) => [m, i]
	)
);
const ZONES: ReadonlyMap<string, number> = new Map([
	['gmt', 0],
	['ut', 0],
	['utc', 0],
	['z', 0],
	['est', -300],
	['edt', -240],
	['cst', -360],
	['cdt', -300],
	['mst', -420],
	['mdt', -360],
	['pst', -480],
	['pdt', -420]
]);

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;
const RFC822 =
	/^(?:[a-z]{3},?\s+)?(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s+([a-z]{1,3}|[+-]\d{4})$/i;
// Zone-less forms, honoured only with a declared source zone:
const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const RFC822_LOCAL =
	/^(?:[a-z]{3},?\s+)?(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/i;
const US_LOCAL =
	/^(?:[a-z]{3},?\s+)?([a-z]{3})\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]m))?$/i;

interface Fields {
	y: number;
	mo: number;
	d: number;
	h: number;
	mi: number;
	s: number;
	ms: number;
}

function offsetMinutes(zone: string): number | null {
	const named = ZONES.get(zone.toLowerCase());
	if (named !== undefined) return named;
	const m = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
	if (!m) return null;
	const hours = Number(m[2]);
	const minutes = Number(m[3]);
	if (hours > 14 || minutes > 59) return null;
	return (m[1] === '-' ? -1 : 1) * (hours * 60 + minutes);
}

/** Calendar-checked UTC instant for wall-clock fields at a fixed offset. */
function instant(f: Fields, offset: number): number | null {
	if (f.mo < 0 || f.mo > 11 || f.h > 23 || f.mi > 59 || f.s > 59) return null;
	const day = new Date(Date.UTC(f.y, f.mo, f.d));
	if (day.getUTCFullYear() !== f.y || day.getUTCMonth() !== f.mo || day.getUTCDate() !== f.d) {
		return null;
	}
	const value = Date.UTC(f.y, f.mo, f.d, f.h, f.mi, f.s, f.ms) - offset * 60_000;
	return value < EARLIEST_MS ? null : value;
}

/** Wall-clock fields of the instant `at` as seen in `timeZone`. */
function wallClock(at: number, timeZone: string): Fields {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric'
	}).formatToParts(new Date(at));
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	return {
		y: get('year'),
		mo: get('month') - 1,
		d: get('day'),
		h: get('hour'),
		mi: get('minute'),
		s: get('second'),
		ms: 0
	};
}

/** Offset of `timeZone` from UTC, in minutes, at the instant `at`. */
function offsetAt(at: number, timeZone: string): number {
	const w = wallClock(at, timeZone);
	return Math.round(
		(Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s) - Math.floor(at / 1000) * 1000) / 60_000
	);
}

const sameWall = (a: Fields, b: Fields) =>
	a.y === b.y && a.mo === b.mo && a.d === b.d && a.h === b.h && a.mi === b.mi && a.s === b.s;

/**
 * Wall-clock fields in an IANA zone → instant. Every candidate is
 * round-tripped through the zone:
 * - no candidate reproduces the wall time → it does not exist (spring-forward
 *   gap, e.g. 02:30 on 8 Mar 2026 in Los Angeles) → null (invalid);
 * - two do (fall-back repeated hour) → the EARLIER instant, the daylight-time
 *   reading. Policy: an ambiguous time must never become later than the truth,
 *   so it can never be pushed into "future".
 */
function inZone(f: Fields, timeZone: string): number | null {
	const asUtc = instant(f, 0);
	if (asUtc === null) return null;
	// The zone's offsets 12h either side cover both readings around a transition.
	const offsets = new Set(
		[asUtc - 12 * 3_600_000, asUtc + 12 * 3_600_000].map((at) => offsetAt(at, timeZone))
	);
	const candidates = [...offsets]
		.map((offset) => instant(f, offset))
		.filter(
			(at): at is number => at !== null && sameWall(wallClock(at, timeZone), { ...f, ms: 0 })
		);
	return candidates.length === 0 ? null : Math.min(...candidates);
}

function hour24(hour: number, meridiem: string | undefined): number {
	if (!meridiem) return hour;
	if (hour < 1 || hour > 12) return 99; // rejected by instant()
	return (hour % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
}

function zoned(value: string): number | null {
	const iso = ISO.exec(value);
	if (iso) {
		const offset = offsetMinutes(iso[8]);
		const ms = iso[7] ? Math.floor(Number(iso[7]) * 1000) : 0;
		const f = {
			y: +iso[1],
			mo: +iso[2] - 1,
			d: +iso[3],
			h: +iso[4],
			mi: +iso[5],
			s: +(iso[6] ?? 0),
			ms
		};
		return offset === null ? null : instant(f, offset);
	}
	const rfc = RFC822.exec(value);
	if (rfc) {
		const mo = MONTHS.get(rfc[2].toLowerCase());
		const offset = offsetMinutes(rfc[7]);
		if (mo === undefined || offset === null) return null;
		return instant(
			{ y: +rfc[3], mo, d: +rfc[1], h: +rfc[4], mi: +rfc[5], s: +(rfc[6] ?? 0), ms: 0 },
			offset
		);
	}
	return null;
}

function local(value: string): Fields | null {
	const iso = ISO_LOCAL.exec(value);
	if (iso)
		return {
			y: +iso[1],
			mo: +iso[2] - 1,
			d: +iso[3],
			h: +iso[4],
			mi: +iso[5],
			s: +(iso[6] ?? 0),
			ms: 0
		};
	const rfc = RFC822_LOCAL.exec(value);
	const rfcMonth = rfc ? MONTHS.get(rfc[2].toLowerCase()) : undefined;
	if (rfc && rfcMonth !== undefined) {
		return {
			y: +rfc[3],
			mo: rfcMonth,
			d: +rfc[1],
			h: +rfc[4],
			mi: +rfc[5],
			s: +(rfc[6] ?? 0),
			ms: 0
		};
	}
	const us = US_LOCAL.exec(value);
	const usMonth = us ? MONTHS.get(us[1].toLowerCase()) : undefined;
	if (us && usMonth !== undefined) {
		return {
			y: +us[3],
			mo: usMonth,
			d: +us[2],
			h: hour24(+us[4], us[7]),
			mi: +us[5],
			s: +(us[6] ?? 0),
			ms: 0
		};
	}
	return null;
}

function parse(
	raw: string,
	assumedTimeZone?: string
): { ms: number; assumedZone: string | null } | null {
	const value = raw.trim().replace(/\s+/g, ' ');
	const explicit = zoned(value);
	if (explicit !== null) return { ms: explicit, assumedZone: null };
	const fields = assumedTimeZone ? local(value) : null;
	const ms = fields && assumedTimeZone ? inZone(fields, assumedTimeZone) : null;
	return ms === null ? null : { ms, assumedZone: assumedTimeZone as string };
}

/**
 * Epoch ms for a zoned RFC 822 or ISO 8601 date-time. Zone-less forms parse
 * only with the source's declared `assumedTimeZone`.
 */
export function parseFeedDate(raw: string, assumedTimeZone?: string): number | null {
	return parse(raw, assumedTimeZone)?.ms ?? null;
}

export type PublishedAtStatus = 'valid' | 'missing' | 'invalid' | 'future';

export interface PublishedAt {
	/** ISO instant, present only when status is 'valid'. */
	publishedAt: string | null;
	/** The raw value exactly as the feed sent it (valid or rejected). */
	publishedAtRaw: string | null;
	/** Which feed field the raw value came from. */
	publishedAtSource: PublishedAtSource | null;
	publishedAtStatus: PublishedAtStatus;
	/** The declared source zone, when a zone-less value was read in it. */
	publishedAtAssumedZone: string | null;
}

/**
 * First valid candidate wins. With none valid, the first rejected candidate
 * explains why; with no candidates the time is 'missing'. Never Date.now().
 */
export function resolvePublishedAt(
	candidates: readonly DateCandidate[],
	nowMs: number,
	assumedTimeZone?: string
): PublishedAt {
	let rejected: PublishedAt | null = null;
	for (const candidate of candidates) {
		const parsed = parse(candidate.raw, assumedTimeZone);
		const base = {
			publishedAtRaw: candidate.raw,
			publishedAtSource: candidate.source,
			publishedAtAssumedZone: parsed?.assumedZone ?? null
		};
		if (parsed && parsed.ms <= nowMs + FUTURE_SKEW_MS) {
			return {
				...base,
				publishedAt: new Date(parsed.ms).toISOString(),
				publishedAtStatus: 'valid'
			};
		}
		rejected ??= { ...base, publishedAt: null, publishedAtStatus: parsed ? 'future' : 'invalid' };
	}
	return (
		rejected ?? {
			publishedAt: null,
			publishedAtRaw: null,
			publishedAtSource: null,
			publishedAtStatus: 'missing',
			publishedAtAssumedZone: null
		}
	);
}

export interface EventAt {
	/** When the thing happens (e.g. a meeting's start), as an ISO instant. */
	eventAt: string | null;
	eventAtSource: PublishedAtSource | null;
}

/**
 * For sources whose date field means "when it happens" (pubDateMeaning
 * 'event-start'): the first parseable candidate is the event time. Future
 * values are expected, so no skew rule applies. Never a publication time.
 */
export function resolveEventAt(
	candidates: readonly DateCandidate[],
	assumedTimeZone?: string
): EventAt {
	for (const candidate of candidates) {
		const ms = parseFeedDate(candidate.raw, assumedTimeZone);
		if (ms !== null)
			return { eventAt: new Date(ms).toISOString(), eventAtSource: candidate.source };
	}
	return { eventAt: null, eventAtSource: null };
}
