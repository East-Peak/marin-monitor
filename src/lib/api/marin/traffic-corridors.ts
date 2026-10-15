/** v2's Getting Around roads: /api/traffic/corridors, checked. */
import type { CorridorGroup } from '$lib/config/traffic-corridors';
import type { CorridorEvent } from '$lib/traffic/corridors';
import { fetchJson, type OwnerOptions } from './fetch-helpers';

export interface TrafficCorridorsData {
	/** When our server read 511's complete list (ISO). */
	checkedAt: string;
	upstreamCount: number;
	/** 511 records the server couldn't read or place: when > 0, coverage is not complete. */
	unreadable: number;
	events: CorridorEvent[];
}

const GROUPS: Record<CorridorGroup, true> = { 'to-sfo': true, 'to-oak': true, marin: true };
const SEVERITIES: Record<NonNullable<CorridorEvent['severity']>, true> = {
	Major: true,
	Moderate: true,
	Minor: true
};
const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
/** A count of records: a negative or fractional one would read as "nothing unreadable". */
const isCount = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const isEvent = (e: unknown) =>
	isRecord(e) &&
	typeof e.id === 'string' &&
	typeof e.kind === 'string' &&
	typeof e.road === 'string' &&
	typeof e.where === 'string' &&
	typeof e.certain === 'boolean' &&
	typeof e.group === 'string' &&
	Object.hasOwn(GROUPS, e.group) &&
	(e.severity === null ||
		(typeof e.severity === 'string' && Object.hasOwn(SEVERITIES, e.severity))) &&
	(e.reportedAt === null || typeof e.reportedAt === 'string');

export async function fetchTrafficCorridorsOrThrow({
	signal
}: OwnerOptions = {}): Promise<TrafficCorridorsData> {
	// The server's own deadline is 8 s for every 511 page; 12 s leaves room for the response.
	const body = await fetchJson<unknown>('/api/traffic/corridors', { signal }, 12_000);
	if (
		!isRecord(body) ||
		typeof body.checkedAt !== 'string' ||
		!isCount(body.upstreamCount) ||
		!isCount(body.unreadable) ||
		!Array.isArray(body.events) ||
		!body.events.every(isEvent)
	) {
		throw new Error('traffic corridors: unexpected response');
	}
	return body as unknown as TrafficCorridorsData;
}
