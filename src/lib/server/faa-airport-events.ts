import type { AirportOperationalStatus, DelayInfo } from '$lib/types/airport';

/**
 * One entry of nasstatus.faa.gov/api/airport-events, keyed by `airportId`.
 * Field names follow the live feed and the FAA's own NAS Status web app:
 * ground programs give `impactingCondition` with numeric minutes, while
 * arrival/departure delays give `reason` and `averageDelay`.
 */
interface FaaAirportEvent {
	airportId: string;
	groundStop?: { impactingCondition?: string; endTime?: string } | null;
	groundDelay?: {
		impactingCondition?: string;
		avgDelay?: number;
		maxDelay?: number;
		endTime?: string;
	} | null;
	arrivalDelay?: FaaTrendDelay | null;
	departureDelay?: FaaTrendDelay | null;
	airportClosure?: FaaNotam | null;
	freeForm?: FaaNotam | null;
	deicing?: { eventTime?: string } | null;
	airportConfig?: {
		arrivalRunwayConfig?: string;
		departureRunwayConfig?: string;
		arrivalRate?: number;
	} | null;
}

interface FaaTrendDelay {
	reason?: string;
	averageDelay?: number | string;
	trend?: string;
}

interface FaaNotam {
	text?: string;
	simpleText?: string;
	startTime?: string;
	endTime?: string;
}

export interface FaaAirportStatus {
	status: AirportOperationalStatus;
	delays: DelayInfo[];
	runwayConfig?: string;
	arrivalRate?: number;
}

type FieldKind = 'string' | 'number' | 'minutes' | 'time';

/** The fields read from each event, and the type each must have when present. */
const EVENT_FIELDS: Record<string, Record<string, FieldKind>> = {
	groundStop: { impactingCondition: 'string', endTime: 'time' },
	groundDelay: {
		impactingCondition: 'string',
		avgDelay: 'number',
		maxDelay: 'number',
		endTime: 'time'
	},
	arrivalDelay: { reason: 'string', averageDelay: 'minutes', trend: 'string' },
	departureDelay: { reason: 'string', averageDelay: 'minutes', trend: 'string' },
	airportClosure: { text: 'string', simpleText: 'string', startTime: 'time', endTime: 'time' },
	freeForm: { text: 'string', simpleText: 'string', endTime: 'time' },
	deicing: { eventTime: 'time' }
};

const CONFIG_FIELDS: Record<string, FieldKind> = {
	arrivalRunwayConfig: 'string',
	departureRunwayConfig: 'string',
	arrivalRate: 'number'
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A whole number in a string ("16"), not a prefix of one ("30garbage"). */
function numericString(value: unknown): number | undefined {
	return typeof value === 'string' && value.trim() !== '' ? Number(value) : undefined;
}

function hasKind(value: unknown, kind: FieldKind): boolean {
	switch (kind) {
		case 'string':
			return typeof value === 'string';
		case 'number':
			return typeof value === 'number' && Number.isFinite(value);
		case 'minutes':
			return hasKind(value, 'number') || Number.isFinite(numericString(value));
		case 'time':
			return isIsoTime(value);
	}
}

const ISO_TIME =
	/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** A zoned ISO 8601 time on a real calendar day: `Date.parse` alone rolls Feb 30 into March. */
function isIsoTime(value: unknown): boolean {
	const match = typeof value === 'string' ? ISO_TIME.exec(value) : null;
	if (!match || !Number.isFinite(Date.parse(match[0]))) return false;
	const [year, month, day] = match.slice(1, 4).map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isPresent(value: unknown): boolean {
	return value !== undefined && value !== null;
}

/**
 * Absent or null, or an object whose read fields all have their expected types.
 * An event must also carry at least one of them: `{ error: '…' }` is not an event.
 */
function isPayload(value: unknown, fields: Record<string, FieldKind>, isEvent: boolean): boolean {
	if (!isPresent(value)) return true;
	if (!isRecord(value)) return false;
	const read = Object.entries(fields).filter(([field]) => isPresent(value[field]));
	return (
		read.every(([field, kind]) => hasKind(value[field], kind)) && (!isEvent || read.length > 0)
	);
}

/**
 * A closure is in effect only inside its interval, so one without a real interval
 * (a missing bound, or an end at or before its start) cannot be placed in time.
 * Bounds have already passed the 'time' check, so both parse.
 */
function hasInterval(closure: Record<string, unknown>): boolean {
	const { startTime, endTime } = closure;
	return (
		typeof startTime === 'string' &&
		typeof endTime === 'string' &&
		Date.parse(startTime) < Date.parse(endTime)
	);
}

/** An FAA location identifier, exactly as it is looked up ("SFO", "KSFO"): no padding. */
const AIRPORT_ID = /^[A-Z0-9]{3,4}$/i;

function isEvent(entry: unknown): entry is FaaAirportEvent {
	if (
		!isRecord(entry) ||
		typeof entry.airportId !== 'string' ||
		!AIRPORT_ID.test(entry.airportId)
	) {
		return false;
	}
	const events = Object.entries(EVENT_FIELDS);
	return (
		events.every(([key, fields]) => isPayload(entry[key], fields, true)) &&
		(!isRecord(entry.airportClosure) || hasInterval(entry.airportClosure)) &&
		events.some(([key]) => isRecord(entry[key])) &&
		isPayload(entry.airportConfig, CONFIG_FIELDS, false)
	);
}

/**
 * The feed's event list, or null when the body is not one: an outage page, error
 * JSON, or any entry that lacks an airport, carries no event, has an event of the
 * wrong shape, or repeats an airport (only one entry per airport would be read).
 * A partly readable feed is not trusted for the rest, since an airport missing
 * from it would read as on time. An empty list is a real absence.
 */
export function parseFaaFeed(body: unknown): FaaAirportEvent[] | null {
	if (!Array.isArray(body) || !body.every(isEvent)) return null;
	const airports = new Set(body.map((e) => e.airportId.toUpperCase()));
	return airports.size === body.length ? body : null;
}

function minutes(value: number | string | undefined): number | undefined {
	const n = typeof value === 'string' ? numericString(value) : value;
	return Number.isFinite(n) ? Math.round(n as number) : undefined;
}

/** Drop undefined fields so a delay carries only what the FAA reported. */
function compact(delay: DelayInfo): DelayInfo {
	return Object.fromEntries(
		Object.entries(delay).filter(([, v]) => v !== undefined && v !== '')
	) as DelayInfo;
}

/** Where `now` falls in a closure's [start, end) interval; parseFaaFeed guarantees both. */
function closurePhase(closure: FaaNotam, now: Date): 'upcoming' | 'active' | 'ended' {
	if (now.getTime() < Date.parse(closure.startTime!)) return 'upcoming';
	if (now.getTime() >= Date.parse(closure.endTime!)) return 'ended';
	return 'active';
}

const STATUS_BY_SEVERITY: [DelayInfo['type'], AirportOperationalStatus][] = [
	['closure', 'closed'],
	['ground-stop', 'ground-stop'],
	['ground-delay', 'ground-delay'],
	['arrival-delay', 'delays'],
	['departure-delay', 'delays']
];

/**
 * An airport's FAA status. A failed or unparseable read (`events === null`) is
 * 'unknown' — absence from a feed we never received is not evidence of on-time.
 */
export function faaStatusFor(
	events: FaaAirportEvent[] | null,
	airportId: string,
	now: Date = new Date()
): FaaAirportStatus {
	if (!events) return { status: 'unknown', delays: [] };

	const entry = events.find((e) => e.airportId.toUpperCase() === airportId);
	if (!entry) return { status: 'on-time', delays: [] };

	const {
		airportClosure,
		groundStop,
		groundDelay,
		arrivalDelay,
		departureDelay,
		freeForm,
		deicing
	} = entry;
	const delays: DelayInfo[] = [];

	const closurePhaseNow = airportClosure && closurePhase(airportClosure, now);
	if (airportClosure && closurePhaseNow === 'active') {
		delays.push({
			type: 'closure',
			reason: airportClosure.text || airportClosure.simpleText,
			endTime: airportClosure.endTime
		});
	}
	if (airportClosure && closurePhaseNow === 'upcoming') {
		delays.push({
			type: 'scheduled-closure',
			reason: airportClosure.text || airportClosure.simpleText,
			startTime: airportClosure.startTime,
			endTime: airportClosure.endTime
		});
	}
	if (groundStop) {
		delays.push({
			type: 'ground-stop',
			reason: groundStop.impactingCondition,
			endTime: groundStop.endTime
		});
	}
	if (groundDelay) {
		delays.push({
			type: 'ground-delay',
			reason: groundDelay.impactingCondition,
			avgMinutes: minutes(groundDelay.avgDelay),
			maxMinutes: minutes(groundDelay.maxDelay),
			endTime: groundDelay.endTime
		});
	}
	for (const [type, delay] of [
		['arrival-delay', arrivalDelay],
		['departure-delay', departureDelay]
	] as const) {
		if (delay) {
			delays.push({
				type,
				reason: delay.reason,
				avgMinutes: minutes(delay.averageDelay),
				trend: delay.trend
			});
		}
	}
	if (freeForm) {
		delays.push({
			type: 'notice',
			reason: freeForm.text || freeForm.simpleText,
			endTime: freeForm.endTime
		});
	}
	if (deicing) {
		delays.push({ type: 'deicing', startTime: deicing.eventTime });
	}

	const status =
		STATUS_BY_SEVERITY.find(([type]) => delays.some((d) => d.type === type))?.[1] ?? 'on-time';
	const config = entry.airportConfig;
	const runwayConfig =
		[config?.arrivalRunwayConfig, config?.departureRunwayConfig].filter(Boolean).join(' / ') ||
		undefined;

	return {
		status,
		delays: delays.map(compact),
		...(runwayConfig && { runwayConfig }),
		...(config?.arrivalRate !== undefined && { arrivalRate: config.arrivalRate })
	};
}
