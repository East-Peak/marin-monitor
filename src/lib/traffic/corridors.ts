/**
 * Which 511 traffic events Getting Around shows: active, in effect now (incidents always), on Marin
 * roads or the routes to SFO and OAK (config/traffic-corridors.ts); long-term construction only when
 * it closes a road. Marin and the corridor are independent tags (101 in Corte Madera is both); the
 * trip tag needs 511's direction to be the way out of Marin (design calls 1, 5, 6, 7).
 * Pure; the server applies it to 511's complete list. Nothing is classified by keywords: the kind
 * and the severity are 511's own. An event that can't be placed is kept and marked uncertain;
 * a record that can't be read is counted, so the caller never mistakes it for "nothing listed".
 */
import {
	AIRPORT_ROUTES,
	MARIN_AREA,
	type Bbox,
	type Corridor
} from '$lib/config/traffic-corridors';
import { parseFeedDate } from '$lib/news/feed-date';

export interface CorridorEvent {
	id: string;
	/** 511's `areas` include Marin. */
	marin: boolean;
	/** On a route segment, either direction. */
	corridor: Corridor | null;
	/** = corridor when 511's direction is the way out of Marin, names both ways, or is empty. */
	trip: Corridor | null;
	/** A road of the event is fully closed (511 `state: CLOSED`). */
	closed: boolean;
	lanes: (typeof LANES)[keyof typeof LANES] | null;
	/** false when 511 gave no usable point for a route-road event: it may be off the route. */
	certain: boolean;
	/** 511's words: the first subtype ("Traffic Collision"), else the event type ("Incident"). */
	kind: string;
	/** The matched road without its direction suffix ("I-580"); "Marin" when 511 names none. */
	road: string;
	/** "Westbound east of Central Ave"; empty when 511 gives no location words. */
	where: string;
	severity: 'Major' | 'Moderate' | 'Minor' | null;
	/** When 511 created the event (ISO); null when unreadable. */
	reportedAt: string | null;
}

export interface CorridorRead {
	events: CorridorEvent[];
	/** Records that could not be read or placed in or out of Marin: coverage is not complete. */
	unreadable: number;
}

const LONG_TERM = 'Long-term construction';
const SEVERITIES = ['Major', 'Moderate', 'Minor'] as const;
/** Ranks: a closure first; unknown severity (511's "Unknown") is not treated as minor (call 5). */
const RANK = { closed: 0, Major: 1, unknown: 2, Moderate: 3, Minor: 4 } as const;
/** 511's lane states, as consequence words. */
const LANES = {
	SOME_LANES_CLOSED: 'some lanes closed',
	SINGLE_LANE_ALTERNATING: 'one lane alternating'
} as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
function texts(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.flatMap((s) => {
		const t = text(s);
		return t === null ? [] : [t];
	});
}
const baseRoad = (name: string) => name.replace(/\s+[NSEW]$/, '');

function pointOf(geography: unknown): [number, number] | null {
	if (!isRecord(geography) || geography.type !== 'Point' || !Array.isArray(geography.coordinates))
		return null;
	const [lng, lat] = geography.coordinates as unknown[];
	const ok =
		typeof lng === 'number' &&
		typeof lat === 'number' &&
		Math.abs(lng) <= 180 &&
		Math.abs(lat) <= 90;
	return ok ? [lng, lat] : null;
}

const inBox = ([lng, lat]: [number, number], [west, south, east, north]: Bbox) =>
	lng >= west && lng <= east && lat >= south && lat <= north;

/**
 * Three-valued (Codex r1 #5): true when any interval contains `now`; false only when every
 * interval reads ("start/end", end optional, end after start) and none does; otherwise null.
 * Bounds go through the strict feed-date parser (Codex r6 #1): an impossible calendar date or a
 * zone-less time reads as unknown, never as a confident "not now".
 */
function inEffect(schedule: unknown, now: number): boolean | null {
	const intervals =
		isRecord(schedule) && Array.isArray(schedule.intervals) ? schedule.intervals : [];
	if (intervals.length === 0) return null;
	let allRead = true;
	for (const interval of intervals) {
		const parts = typeof interval === 'string' ? interval.split('/') : [];
		const start = parts.length === 2 ? parseFeedDate(parts[0]) : null;
		const end = parts.length !== 2 ? null : parts[1] === '' ? Infinity : parseFeedDate(parts[1]);
		if (start === null || end === null || end <= start) {
			allRead = false;
			continue;
		}
		if (start <= now && now < end) return true;
	}
	return allRead ? false : null;
}

interface Placed {
	corridor: Corridor;
	/** The segment's direction of travel from Marin. */
	outbound: string;
	certain: boolean;
	road: string;
}

/** The route a road list is on (any road, Codex r1 #4): in a segment's box, else unplaced on its road. */
function corridorOf(roads: readonly string[], at: [number, number] | null): Placed | null {
	let uncertain: Placed | null = null;
	for (const route of AIRPORT_ROUTES) {
		for (const s of route.segments) {
			if (!roads.includes(s.road)) continue;
			const found = { corridor: route.corridor, outbound: s.outbound, road: s.road };
			if (at === null) uncertain ??= { ...found, certain: false };
			else if (inBox(at, s.bbox)) return { ...found, certain: true };
		}
	}
	return uncertain;
}

/** On the trip when 511's direction is the outbound one, names both ways ("… and …"), or is empty. */
export const onTrip = (direction: string | null, outbound: string) =>
	direction === null || direction.includes(outbound) || direction.includes(' and ');

function whereOf(road: Record<string, unknown> | undefined): string {
	if (!road) return '';
	const from = text(road.from);
	const to = text(road.to);
	const place =
		from && to
			? `between ${from} and ${to}`
			: [text(road['+article']), from].filter(Boolean).join(' ');
	return [text(road.direction), place].filter(Boolean).join(' ');
}

const kindOf = (type: string) => type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');

export function corridorEvents(events: readonly unknown[], now: number): CorridorRead {
	const kept: { event: CorridorEvent; rank: number; created: number }[] = [];
	let unreadable = 0;
	// 511 pages a changing list: the same event can arrive twice (Codex r4 #2). Identical copies are
	// one event; a copy that disagrees can't be resolved, so it counts as unreadable.
	const seen = new Map<string, string>();
	for (const e of events) {
		const key = isRecord(e) ? text(e.id) : null;
		if (key !== null) {
			const copy = JSON.stringify(e);
			const first = seen.get(key);
			if (first !== undefined) {
				if (first !== copy) unreadable += 1;
				continue;
			}
			seen.set(key, copy);
		}
		const id = isRecord(e) ? text(e.id) : null;
		const type = isRecord(e) ? text(e.event_type) : null;
		const status = isRecord(e) ? text(e.status) : null;
		// Open511 statuses are ACTIVE and ARCHIVED; anything else can't be ruled out (Codex r2 #1).
		if (
			!isRecord(e) ||
			id === null ||
			type === null ||
			(status !== 'ACTIVE' && status !== 'ARCHIVED')
		) {
			unreadable += 1;
			continue;
		}
		if (status === 'ARCHIVED') continue;
		const subtypes = texts(e.event_subtypes);
		const roadRecords = Array.isArray(e.roads) ? e.roads.filter(isRecord) : [];
		const longTerm = subtypes.includes(LONG_TERM);
		// Long-term work returns only when it closes a road (call 6); which road is checked below.
		if (longTerm && !roadRecords.some((r) => r.state === 'CLOSED')) continue;
		if (type !== 'INCIDENT' && inEffect(e.schedule, now) === false) continue;
		const roads = roadRecords.flatMap((r) => {
			const name = text(r.name);
			return name === null ? [] : [baseRoad(name)];
		});
		const areas = Array.isArray(e.areas)
			? e.areas.flatMap((a) => {
					const name = isRecord(a) ? text(a.name) : null;
					return name === null ? [] : [name];
				})
			: [];
		// A member we couldn't read might be the route road or the county (Codex r3 #1).
		const malformed =
			(Array.isArray(e.roads) ? e.roads.length : 0) !== roads.length ||
			(Array.isArray(e.areas) ? e.areas.length : 0) !== areas.length;
		const marin = areas.includes(MARIN_AREA);
		const placed = corridorOf(roads, pointOf(e.geography));
		if (!marin && placed === null) {
			// Without a county we can't say it is outside Marin; without a road, that it is off the routes.
			if (areas.length === 0 || roads.length === 0 || malformed) unreadable += 1;
			continue;
		}
		const road = placed?.road ?? roads[0] ?? MARIN_AREA;
		const shown =
			roadRecords.find((r) => {
				const name = text(r.name);
				return name !== null && baseRoad(name) === road;
			}) ?? roadRecords[0];
		// The consequence is the shown road's own (Codex GA-v2 #3): another road's closure isn't it.
		const closed = shown?.state === 'CLOSED';
		if (longTerm && !closed) continue;
		// A trip claim needs a confirmed place on the route (Codex GA-v2 #2).
		const trip =
			placed?.certain && onTrip(text(shown?.direction), placed.outbound) ? placed.corridor : null;
		const severity = SEVERITIES.find((s) => s === e.severity) ?? null;
		const created = typeof e.created === 'string' ? (parseFeedDate(e.created) ?? NaN) : NaN;
		kept.push({
			event: {
				id,
				marin,
				corridor: placed?.corridor ?? null,
				trip,
				closed,
				lanes: LANES[shown?.state as keyof typeof LANES] ?? null,
				certain: placed?.certain ?? true,
				kind: subtypes[0] ?? kindOf(type),
				road,
				where: whereOf(shown),
				severity,
				reportedAt: Number.isFinite(created) ? new Date(created).toISOString() : null
			},
			rank: closed ? RANK.closed : RANK[severity ?? 'unknown'],
			created: Number.isFinite(created) ? created : 0
		});
	}
	return {
		events: kept
			.sort(
				(a, b) =>
					a.rank - b.rank ||
					Number(b.event.trip !== null) - Number(a.event.trip !== null) ||
					b.created - a.created
			)
			.map((k) => k.event),
		unreadable
	};
}
