import type { AirportOperationalStatus, DelayInfo } from '$lib/types/airport';

/**
 * One entry of nasstatus.faa.gov/api/airport-events, keyed by `airportId`.
 * Field names follow the live feed and the FAA's own NAS Status web app:
 * ground programs give `impactingCondition` with numeric minutes, while
 * arrival/departure delays give `reason` and `averageDelay`.
 */
interface FaaAirportEvent {
	airportId?: string;
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
	endTime?: string;
}

export interface FaaAirportStatus {
	status: AirportOperationalStatus;
	delays: DelayInfo[];
	runwayConfig?: string;
	arrivalRate?: number;
}

/** The feed's event list, or null when the body is not one (outage page, error JSON). */
export function parseFaaFeed(body: unknown): FaaAirportEvent[] | null {
	if (!Array.isArray(body)) return null;
	return body.filter((e): e is FaaAirportEvent => typeof e === 'object' && e !== null);
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
	airportId: string
): FaaAirportStatus {
	if (!events) return { status: 'unknown', delays: [] };

	const entry = events.find((e) => e.airportId?.toUpperCase() === airportId);
	if (!entry) return { status: 'on-time', delays: [] };

	const { airportClosure, groundStop, groundDelay, arrivalDelay, departureDelay, freeForm } = entry;
	const delays: DelayInfo[] = [];

	if (airportClosure) {
		delays.push({
			type: 'closure',
			reason: airportClosure.text || airportClosure.simpleText,
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
