/**
 * Which 511 traffic events Getting Around shows: active, not long-term construction, in effect now
 * (incidents always), on Marin roads or the routes to SFO and OAK (config/traffic-corridors.ts).
 * Pure; the server applies it to 511's complete list. Nothing is classified by keywords: the kind
 * and the severity are 511's own. An event that can't be placed is kept and marked uncertain;
 * a record that can't be read is counted, so the caller never mistakes it for "nothing listed".
 */
import {
	AIRPORT_ROUTES,
	MARIN_AREA,
	type Bbox,
	type CorridorGroup
} from '$lib/config/traffic-corridors';
import { parseFeedDate } from '$lib/news/feed-date';

export interface CorridorEvent {
	id: string;
	group: CorridorGroup;
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

/** The route a road list belongs to (any road, Codex r1 #4), else Marin by county; null = outside. */
function placeOf(
	roads: readonly string[],
	areas: readonly string[],
	at: [number, number] | null
): { group: CorridorGroup; certain: boolean; road: string } | null {
	let uncertain: { group: CorridorGroup; certain: boolean; road: string } | null = null;
	for (const route of AIRPORT_ROUTES) {
		for (const s of route.segments) {
			if (!roads.includes(s.road)) continue;
			if (at === null) uncertain ??= { group: route.group, certain: false, road: s.road };
			else if (inBox(at, s.bbox)) return { group: route.group, certain: true, road: s.road };
		}
	}
	if (areas.includes(MARIN_AREA))
		return { group: 'marin', certain: true, road: roads[0] ?? MARIN_AREA };
	return uncertain;
}

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
		if (subtypes.includes(LONG_TERM)) continue;
		if (type !== 'INCIDENT' && inEffect(e.schedule, now) === false) continue;
		const roadRecords = Array.isArray(e.roads) ? e.roads.filter(isRecord) : [];
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
		const place = placeOf(roads, areas, pointOf(e.geography));
		if (place === null) {
			// Without a county we can't say it is outside Marin; without a road, that it is off the routes.
			if (areas.length === 0 || roads.length === 0 || malformed) unreadable += 1;
			continue;
		}
		const matched = roadRecords.find((r) => {
			const name = text(r.name);
			return name !== null && baseRoad(name) === place.road;
		});
		const severity = SEVERITIES.find((s) => s === e.severity) ?? null;
		const created = typeof e.created === 'string' ? (parseFeedDate(e.created) ?? NaN) : NaN;
		kept.push({
			event: {
				id,
				group: place.group,
				certain: place.certain,
				kind: subtypes[0] ?? kindOf(type),
				road: place.road,
				where: whereOf(matched ?? roadRecords[0]),
				severity,
				reportedAt: Number.isFinite(created) ? new Date(created).toISOString() : null
			},
			rank: severity === null ? SEVERITIES.length : SEVERITIES.indexOf(severity),
			created: Number.isFinite(created) ? created : 0
		});
	}
	return {
		events: kept.sort((a, b) => a.rank - b.rank || b.created - a.created).map((k) => k.event),
		unreadable
	};
}
