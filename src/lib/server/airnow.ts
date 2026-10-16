/**
 * AirNow current observations (/aq/observation/current/ziplatlong/; the latLong
 * endpoint it replaces retired 2026-09-30). One reading per pollutant, each with its
 * NowCast AQI and the local hour it was observed. A missing AQI is -1, never clean air.
 */
import type { AirQualityData } from '$lib/types';

/** Hours from UTC for the zones AirNow names (its sites report local standard or daylight time). */
const ZONE_OFFSET_H: Readonly<Record<string, number>> = {
	EST: -5,
	EDT: -4,
	CST: -6,
	CDT: -5,
	MST: -7,
	MDT: -6,
	PST: -8,
	PDT: -7,
	AKST: -9,
	AKDT: -8,
	HST: -10
};

const CATEGORY_COLOR: Readonly<Record<string, string>> = {
	Good: '#00e400',
	Moderate: '#ffff00',
	'Unhealthy for Sensitive Groups': '#ff7e00',
	Unhealthy: '#ff0000',
	'Very Unhealthy': '#8f3f97',
	Hazardous: '#7e0023'
};

interface CurrentObservation {
	dateObserved?: unknown;
	hourObserved?: unknown;
	localTimeZone?: unknown;
	reportingAreaName?: unknown;
	parameterName?: unknown;
	nowcastAQI?: unknown;
	aqiCategoryName?: unknown;
}

/** The instant of a local "YYYY-MM-DD" + "HH:00" in a named zone, or null when any part is unreadable. */
export function observationTime(date: unknown, hour: unknown, zone: unknown): number | null {
	const d = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
	const h = typeof hour === 'string' ? /^(\d{1,2}):00$/.exec(hour) : null;
	const offset = typeof zone === 'string' ? ZONE_OFFSET_H[zone] : undefined;
	if (!d || !h || offset === undefined || +h[1] > 23) return null;
	const [y, m, day] = [+d[1], +d[2] - 1, +d[3]];
	const midnight = new Date(Date.UTC(y, m, day));
	// A date Date.UTC would roll over (Feb 30, month 13) is malformed, not another day.
	if (midnight.getUTCMonth() !== m || midnight.getUTCDate() !== day) return null;
	return midnight.getTime() + (+h[1] - offset) * 3_600_000;
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * The worst pollutant's reading, or null when no observation carries an AQI.
 * Anything but a list (e.g. a WebServiceError object) is a failed read and throws.
 */
export function airQualityFromObservations(body: unknown, now: number): AirQualityData | null {
	if (!Array.isArray(body)) {
		const message = (body as { WebServiceError?: { Message?: string }[] } | null)
			?.WebServiceError?.[0]?.Message;
		throw new Error(`AirNow returned no observations${message ? `: ${message}` : ''}`);
	}
	const valid = (body as CurrentObservation[]).filter(
		(o): o is CurrentObservation & { nowcastAQI: number } =>
			typeof o?.nowcastAQI === 'number' && Number.isFinite(o.nowcastAQI) && o.nowcastAQI >= 0
	);
	if (!valid.length) return null;
	const worst = valid.reduce((a, b) => (b.nowcastAQI > a.nowcastAQI ? b : a));
	const category = text(worst.aqiCategoryName) ?? 'Unknown';
	return {
		aqi: worst.nowcastAQI,
		category,
		color: CATEGORY_COLOR[category] ?? '#999999',
		pollutant: text(worst.parameterName) ?? 'Unknown',
		area: text(worst.reportingAreaName),
		observedAt: observationTime(worst.dateObserved, worst.hourObserved, worst.localTimeZone),
		timestamp: now
	};
}
