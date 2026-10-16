/** v2's Getting Around roads: /api/traffic/corridors, checked. */
import { outboundOf } from '$lib/config/traffic-corridors';
import { onTrip } from '$lib/traffic/corridors';
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

const CORRIDORS: Record<NonNullable<CorridorEvent['corridor']>, true> = {
	'to-sfo': true,
	'to-oak': true
};
const LANES: Record<NonNullable<CorridorEvent['lanes']>, true> = {
	'some lanes closed': true,
	'one lane alternating': true
};
const SEVERITIES: Record<NonNullable<CorridorEvent['severity']>, true> = {
	Major: true,
	Moderate: true,
	Minor: true
};
const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
/** A count of records: a negative or fractional one would read as "nothing unreadable". */
const isCount = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const corridor = (v: unknown) =>
	v === null || (typeof v === 'string' && Object.hasOwn(CORRIDORS, v));
const isTagged = (e: Record<string, unknown>) =>
	typeof e.marin === 'boolean' &&
	corridor(e.corridor) &&
	corridor(e.trip) &&
	(e.trip === null || e.trip === e.corridor) &&
	(e.marin || e.corridor !== null) &&
	typeof e.closed === 'boolean' &&
	(e.lanes === null || (typeof e.lanes === 'string' && Object.hasOwn(LANES, e.lanes)));

/** 511's direction words leading `where` ("Eastbound and Westbound east of …"); null when none. */
const DIRECTION = /^(?:North|South|East|West)bound(?: and (?:North|South|East|West)bound)?\b/;

/**
 * The pre-v2 shape (one `group`), as a CDN copy can still serve it for a few minutes after a deploy:
 * read as tags. Its direction is the start of `where` (Codex GA-v2 #1); none matches (call 1). A
 * trip needs a confirmed place, as on the server (Codex GA-v2 #2).
 */
function fromGroup(e: Record<string, unknown>): Record<string, unknown> | null {
	const { group, ...rest } = e;
	if (group !== 'marin' && !(typeof group === 'string' && Object.hasOwn(CORRIDORS, group)))
		return null;
	const corridor = group === 'marin' ? null : (group as NonNullable<CorridorEvent['corridor']>);
	const outbound = corridor && typeof e.road === 'string' ? outboundOf(corridor, e.road) : null;
	const direction = typeof e.where === 'string' ? (DIRECTION.exec(e.where)?.[0] ?? null) : null;
	const trip = outbound && e.certain === true && onTrip(direction, outbound) ? corridor : null;
	return { ...rest, marin: group === 'marin', corridor, trip, closed: false, lanes: null };
}

function readEvent(e: unknown): CorridorEvent | null {
	if (
		!isRecord(e) ||
		typeof e.id !== 'string' ||
		typeof e.kind !== 'string' ||
		typeof e.road !== 'string' ||
		typeof e.where !== 'string' ||
		typeof e.certain !== 'boolean' ||
		!(
			e.severity === null ||
			(typeof e.severity === 'string' && Object.hasOwn(SEVERITIES, e.severity))
		) ||
		!(e.reportedAt === null || typeof e.reportedAt === 'string')
	)
		return null;
	const tagged = 'group' in e && !('marin' in e) ? fromGroup(e) : e;
	return tagged && isTagged(tagged) ? (tagged as unknown as CorridorEvent) : null;
}

export async function fetchTrafficCorridorsOrThrow({
	signal
}: OwnerOptions = {}): Promise<TrafficCorridorsData> {
	// The server's own deadline is 8 s for every 511 page; 12 s leaves room for the response.
	const body = await fetchJson<unknown>('/api/traffic/corridors', { signal }, 12_000);
	const events = isRecord(body) && Array.isArray(body.events) ? body.events.map(readEvent) : null;
	if (
		!isRecord(body) ||
		typeof body.checkedAt !== 'string' ||
		!isCount(body.upstreamCount) ||
		!isCount(body.unreadable) ||
		events === null ||
		!events.every((e) => e !== null)
	) {
		throw new Error('traffic corridors: unexpected response');
	}
	return { ...(body as unknown as TrafficCorridorsData), events: events as CorridorEvent[] };
}
