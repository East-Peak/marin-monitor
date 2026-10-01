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

type FieldKind = 'string' | 'number' | 'minutes';

/** The fields read from each event, and the type each must have when present. */
const EVENT_FIELDS: Record<string, Record<string, FieldKind>> = {
	groundStop: { impactingCondition: 'string', endTime: 'string' },
	groundDelay: {
		impactingCondition: 'string',
		avgDelay: 'number',
		maxDelay: 'number',
		endTime: 'string'
	},
	arrivalDelay: { reason: 'string', averageDelay: 'minutes', trend: 'string' },
	departureDelay: { reason: 'string', averageDelay: 'minutes', trend: 'string' },
	airportClosure: { text: 'string', simpleText: 'string', startTime: 'string', endTime: 'string' },
	freeForm: { text: 'string', simpleText: 'string', endTime: 'string' },
	deicing: { eventTime: 'string' }
};

const CONFIG_FIELDS: Record<string, FieldKind> = {
	arrivalRunwayConfig: 'string',
	departureRunwayConfig: 'string',
	arrivalRate: 'number'
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasKind(value: unknown, kind: FieldKind): boolean {
	if (kind === 'string') return typeof value === 'string';
	if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
	return (
		hasKind(value, 'number') || (typeof value === 'string' && Number.isFinite(parseFloat(value)))
	);
}

/** Absent or null, or an object whose read fields all have their expected types. */
function isPayload(value: unknown, fields: Record<string, FieldKind>): boolean {
	if (value === undefined || value === null) return true;
	if (!isRecord(value)) return false;
	return Object.entries(fields).every(
		([field, kind]) =>
			value[field] === undefined || value[field] === null || hasKind(value[field], kind)
	);
}

function isEvent(entry: unknown): entry is FaaAirportEvent {
	if (!isRecord(entry) || typeof entry.airportId !== 'string' || !entry.airportId.trim()) {
		return false;
	}
	const events = Object.entries(EVENT_FIELDS);
	return (
		events.every(([key, fields]) => isPayload(entry[key], fields)) &&
		events.some(([key]) => isRecord(entry[key])) &&
		isPayload(entry.airportConfig, CONFIG_FIELDS)
	);
}

/**
 * The feed's event list, or null when the body is not one: an outage page, error
 * JSON, or any entry that lacks an airport, carries no event, or has an event of
 * the wrong shape. A partly readable feed is not trusted for the rest, since an
 * airport missing from it would read as on time. An empty list is a real absence.
 */
export function parseFaaFeed(body: unknown): FaaAirportEvent[] | null {
	if (!Array.isArray(body)) return null;
	return body.every(isEvent) ? body : null;
}

function minutes(value: number | string | undefined): number | undefined {
	const n = typeof value === 'string' ? parseFloat(value) : value;
	return Number.isFinite(n) ? Math.round(n as number) : undefined;
}

/** Drop undefined fields so a delay carries only what the FAA reported. */
function compact(delay: DelayInfo): DelayInfo {
	return Object.fromEntries(
		Object.entries(delay).filter(([, v]) => v !== undefined && v !== '')
	) as DelayInfo;
}

function timeOf(iso: string | undefined): number | undefined {
	const t = iso ? Date.parse(iso) : NaN;
	return Number.isFinite(t) ? t : undefined;
}

/** Where `now` falls against a closure's effective interval; an open end is unbounded. */
function closurePhase(closure: FaaNotam, now: Date): 'upcoming' | 'active' | 'ended' {
	const start = timeOf(closure.startTime);
	const end = timeOf(closure.endTime);
	if (start !== undefined && now.getTime() < start) return 'upcoming';
	if (end !== undefined && now.getTime() >= end) return 'ended';
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
