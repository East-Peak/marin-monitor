/**
 * Client-side adapter for airport status data (SFO & OAK)
 */

import { logger } from '$lib/config/api';
import { fetchJson, type OwnerOptions } from './fetch-helpers';
import type { AirportOperationalStatus, AirportStatusData, DelayInfo } from '$lib/types/airport';

export async function fetchAirportStatus(): Promise<AirportStatusData | null> {
	try {
		logger.log('Airport', 'Loading airport status from /api/airport-status');
		return await fetchJson<AirportStatusData>('/api/airport-status');
	} catch (error) {
		logger.warn('Airport', `Airport status fetch failed: ${(error as Error).message}`);
		return null;
	}
}

// Exhaustive over the landed unions: a new FAA status or delay type fails svelte-check here.
const STATUSES: Record<AirportOperationalStatus, true> = {
	'on-time': true,
	delays: true,
	'ground-delay': true,
	'ground-stop': true,
	closed: true,
	unknown: true
};
const DELAY_TYPES: Record<DelayInfo['type'], true> = {
	'ground-stop': true,
	'ground-delay': true,
	'arrival-delay': true,
	'departure-delay': true,
	closure: true,
	'scheduled-closure': true,
	deicing: true,
	notice: true
};
const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const optionalMinutes = (v: unknown) =>
	v === undefined || (typeof v === 'number' && Number.isFinite(v));
const isDelay = (d: unknown) =>
	isRecord(d) &&
	typeof d.type === 'string' &&
	Object.hasOwn(DELAY_TYPES, d.type) &&
	optionalMinutes(d.avgMinutes) &&
	optionalMinutes(d.maxMinutes);
const isAirport = (a: unknown) =>
	isRecord(a) &&
	typeof a.code === 'string' &&
	typeof a.name === 'string' &&
	typeof a.status === 'string' &&
	Object.hasOwn(STATUSES, a.status) &&
	Array.isArray(a.delays) &&
	a.delays.every(isDelay);

/** v2: /api/airport-status, checked; anything else throws (the owner shows it as unavailable). */
export async function fetchAirportStatusOrThrow({
	signal
}: OwnerOptions = {}): Promise<AirportStatusData> {
	const body = await fetchJson<unknown>('/api/airport-status', { signal });
	if (
		!isRecord(body) ||
		typeof body.lastUpdated !== 'string' ||
		!Array.isArray(body.airports) ||
		!body.airports.every(isAirport)
	) {
		throw new Error('airport status: unexpected response');
	}
	return body as unknown as AirportStatusData;
}
