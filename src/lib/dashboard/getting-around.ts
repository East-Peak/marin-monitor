/**
 * Getting Around (spec §2.5, §13.10; cameras live in the Cams strip, decision 5a).
 * Pure: what the section says about SFO/OAK, Marin roads and the airport routes, and transit, and
 * its header status. Nothing is classified by keywords: an alert or incident is whatever 511 lists.
 * An all-clear ("No delays reported", "511 lists no alerts", "No incidents listed…") is said only for
 * an ok read: complete, timed, fresh, not retained, nothing unreadable.
 */
import { MARIN_AGENCIES, type TransitAgencyRead } from '$lib/api/marin/transit';
import type { TrafficCorridorsData } from '$lib/api/marin/traffic-corridors';
import { ROAD_SCOPE, TRIP_LABEL } from '$lib/config/traffic-corridors';
import type {
	AirportOperationalStatus,
	AirportStatus,
	AirportStatusData,
	DelayInfo
} from '$lib/types/airport';
import { formatItemAge } from './latest-reporting';
import { datasetEntry, type DatasetFetch } from './source-adapters';
import {
	effectiveState,
	parseObservedAt,
	presentSection,
	type SectionPresentation,
	type SourceEntryState,
	type SourceStatusEntry
} from './source-status';

/** Freshness limits: FAA via /api/airport-status (5-min caches), 511 traffic (2-min CDN), GTFS-RT feeds. */
export const AIRPORT_MAX_AGE_MS = 30 * 60_000;
export const TRAFFIC_MAX_AGE_MS = 15 * 60_000;
const TRANSIT_MAX_AGE_MS = 30 * 60_000;
const PREVIEW = 3;
const SUMMARY_AIRPORTS = ['SFO', 'OAK'] as const;
const OUT_OF_DATE = ' · out of date';
const NOT_VERIFIED = ' · not verified';

/** v2's one transit read: each agency's last complete read, and the error if the latest read failed. */
export interface TransitState {
	reads: readonly TransitAgencyRead[] | null;
	error: string | null;
}

/** Each part's bounded "see more": the source's own page. */
export const LINKS = {
	traffic: 'https://511.org/alerts/traffic',
	transit: 'https://511.org/alerts/transit',
	faa: 'https://nasstatus.faa.gov/'
} as const;

export interface Line {
	id: string;
	label: string;
	text: string;
	state: SourceEntryState;
	/** The agency's own page, when its line links there (Decision 6). */
	url: string | null;
}
interface Row {
	id: string;
	title: string;
	/** The item's own page, or null (never a guessed one). */
	url: string | null;
	meta: string;
}
export interface Part {
	lines: Line[];
	rows: Row[];
	/** Listed items beyond the preview. */
	more: number;
	/** One line instead of content: loading, unavailable, or an honest empty. */
	note: string | null;
	/** The source and its time, e.g. "511 · checked 1 min ago". */
	meta: string | null;
	/** What the part covers, said on screen (roads only). */
	scope: string | null;
	/** The part's evaluated state (airports, roads), rendered as data-part-state; null for transit (its lines carry theirs). */
	state: SourceEntryState | null;
}
export interface GettingAroundView {
	airports: Part;
	roads: Part;
	transit: Part;
	status: SectionPresentation;
}
export interface GettingAroundInput {
	transit: TransitState;
	airport: AirportStatusData | null;
	traffic: TrafficCorridorsData | null;
	outcomes: Readonly<Record<string, DatasetFetch>>;
	/** Airports and roads load only while the section is open; closed, they are not in its status. */
	open: boolean;
	now: number;
}

interface Built {
	part: Part;
	entries: SourceStatusEntry[];
	/** Things this part actually answered (the header's counts). */
	answered: number;
}
const part = (over: Partial<Part> = {}): Part => ({
	lines: [],
	rows: [],
	more: 0,
	note: null,
	meta: null,
	scope: null,
	state: null,
	...over
});
const preview = (rows: Row[]) => ({
	rows: rows.slice(0, PREVIEW),
	more: Math.max(0, rows.length - PREVIEW)
});
const FUTURE_SKEW_MS = 5 * 60_000;
/** "511 · checked 1 min ago"; a missing, invalid or future time is "time unknown", never "1 min ago". */
const timed = (source: string, verb: string, at: number | null, now: number, stale: boolean) =>
	at === null || !Number.isFinite(at) || at - now > FUTURE_SKEW_MS
		? `${source} · time unknown`
		: `${source} · ${verb} ${formatItemAge(at, now)}${stale ? OUT_OF_DATE : ''}`;

// ── Airports ──────────────────────────────────────────────────────────────

const STATUS_WORDS: Record<Exclude<AirportOperationalStatus, 'unknown'>, string> = {
	'on-time': 'No delays reported',
	delays: 'Delays',
	'ground-delay': 'Ground delay',
	'ground-stop': 'Ground stop',
	closed: 'Closed'
};
const DELAY_WORDS: Record<DelayInfo['type'], string> = {
	'ground-stop': 'Ground stop',
	'ground-delay': 'Ground delay',
	'arrival-delay': 'Arrival delays',
	'departure-delay': 'Departure delays',
	closure: 'Closed',
	'scheduled-closure': 'Closure scheduled',
	deicing: 'Deicing',
	notice: 'FAA notice'
};

function delayText(d: DelayInfo): string {
	const figures = [
		d.avgMinutes === undefined ? null : `avg ${d.avgMinutes} min`,
		d.maxMinutes === undefined ? null : `up to ${d.maxMinutes} min`
	].filter(Boolean);
	return [DELAY_WORDS[d.type], ...figures].join(', ');
}

/** The FAA's words for one airport; null when its FAA read failed: never "no delays". */
export function faaText(a: AirportStatus): string | null {
	if (a.status === 'unknown') return null;
	const delays = a.delays.map(delayText);
	if (a.status === 'on-time') return [STATUS_WORDS['on-time'], ...delays].join(' · ');
	return delays.length ? delays.join(' · ') : STATUS_WORDS[a.status];
}

/** The line for a read we can't call current: delays keep their words with a caveat; an all-clear is withheld. */
function caveated(a: AirportStatus, words: string, state: SourceEntryState): string {
	if (state === 'ok') return words;
	const stale = state === 'stale';
	if (a.status === 'on-time') return stale ? 'FAA status out of date' : 'FAA status not verified';
	return words + (stale ? OUT_OF_DATE : NOT_VERIFIED);
}

function airports(
	fetch: DatasetFetch | undefined,
	data: AirportStatusData | null,
	now: number
): Built {
	const entry = datasetEntry('airport', 'FAA airport status', fetch, AIRPORT_MAX_AGE_MS);
	const state = effectiveState(entry, now);
	if (data === null || state === 'loading' || state === 'unavailable') {
		const note = state === 'loading' ? 'Loading airport status…' : 'Airport status unavailable';
		return { part: part({ note, state }), entries: [entry], answered: 0 };
	}
	const entries = [entry];
	// Travel time joins each airport's line here later (plan Decision 8).
	const lines = SUMMARY_AIRPORTS.map((code): Line => {
		const a = data.airports.find((x) => x.code === code);
		const words = a ? faaText(a) : null;
		if (a === undefined || words === null) {
			entries.push({
				id: `faa:${code}`,
				name: `FAA status for ${code}`,
				state: 'unavailable',
				observedAt: null,
				maxAgeMs: null,
				detail: a ? 'FAA feed unreadable' : 'not in the response'
			});
			return {
				id: code,
				label: code,
				text: 'FAA status unavailable',
				state: 'unavailable',
				url: null
			};
		}
		return { id: code, label: code, text: caveated(a, words, state), state, url: null };
	});
	const answered = lines.filter((l) => l.state !== 'unavailable').length;
	// A 200 with no FAA status for either airport is not healthy coverage (Codex r2 #2): the
	// transport entry counts only when an airport line was actually answered.
	return {
		part: part({
			lines,
			meta: timed('FAA', 'checked', entry.observedAt, now, false),
			state: answered ? state : 'unavailable'
		}),
		entries: answered ? entries : entries.slice(1),
		answered
	};
}

// ── Roads ─────────────────────────────────────────────────────────────────

function roads(
	fetch: DatasetFetch | undefined,
	data: TrafficCorridorsData | null,
	now: number
): Built {
	const read = datasetEntry('traffic', '511 traffic', fetch, TRAFFIC_MAX_AGE_MS);
	// Records the server couldn't read or place: the list isn't complete, so it can't be "ok" (Codex r1 #3).
	const entry: SourceStatusEntry =
		data && data.unreadable > 0 && read.state === 'ok'
			? { ...read, state: 'unknown', detail: `${data.unreadable} 511 events unreadable` }
			: read;
	const state = effectiveState(entry, now);
	if (data === null || state === 'loading' || state === 'unavailable') {
		const note = state === 'loading' ? 'Loading traffic…' : 'Traffic incidents unavailable';
		return { part: part({ note, scope: ROAD_SCOPE, state }), entries: [entry], answered: 0 };
	}
	const rows = data.events.map((e): Row => {
		const at = parseObservedAt(e.reportedAt);
		// A future report time is not "1 min ago" (Codex r4 #4): it is left out.
		const age =
			at !== null && at - now <= FUTURE_SKEW_MS ? `reported ${formatItemAge(at, now)}` : null;
		const tag = e.trip ? TRIP_LABEL[e.trip] : e.marin ? 'Marin' : 'toward Marin';
		const where = e.certain ? tag : `${tag} (location unconfirmed)`;
		return {
			id: e.id,
			title: [`${e.kind} · ${e.road}`, e.where].filter(Boolean).join(' '),
			url: null,
			meta: [where, e.severity, age].filter(Boolean).join(' · ')
		};
	});
	const empty =
		state === 'ok'
			? 'No incidents listed by 511 on these roads'
			: state === 'stale'
				? 'Traffic out of date'
				: 'Traffic not verified';
	return {
		part: part({
			...preview(rows),
			note: rows.length ? null : empty,
			meta: timed('511', 'checked', entry.observedAt, now, state === 'stale'),
			scope: ROAD_SCOPE,
			state
		}),
		entries: [entry],
		answered: 1
	};
}

// ── Transit ───────────────────────────────────────────────────────────────

const listed = (n: number) => `${n} alert${n === 1 ? '' : 's'} listed`;

/**
 * Where 511's empty list is not trusted (2026-10-14: 511's GG, GF and SA feeds were empty while
 * goldengate.org listed active alerts; SMART and Angel Island have no page we could check against).
 * For these, an empty or failed read makes no claim: the line links to the agency's own page. Alerts
 * 511 does list are still shown. Marin Transit's emptiness is said only as 511's ("511 lists no alerts"),
 * with the agency's page one tap away: a populated feed is not proof of complete coverage (Codex r4 #1).
 */
const MARIN_TRANSIT_PAGE = 'https://marintransit.gov/service-alerts';
const AGENCY_PAGES: Readonly<Record<string, { label: string; url: string }>> = {
	GG: { label: 'goldengate.org', url: 'https://www.goldengate.org/service-alerts/' },
	GF: { label: 'goldengate.org', url: 'https://www.goldengate.org/service-alerts/' },
	SA: { label: 'sonomamarintrain.org', url: 'https://www.sonomamarintrain.org/' },
	AF: { label: 'angelislandferry.com', url: 'https://angelislandferry.com/' }
};

function agencyText(state: SourceEntryState, count: number | null): string {
	switch (state) {
		case 'loading':
			return 'Loading…';
		case 'unavailable':
			return 'Alerts unavailable';
		case 'ok':
			return count ? listed(count) : '511 lists no alerts';
		case 'stale':
			return count ? listed(count) + OUT_OF_DATE : 'Out of date';
		default:
			return count ? `${listed(count)} · age unknown` : 'Not verified';
	}
}

function agencyEntry(
	agency: { id: string; name: string },
	t: TransitState,
	read: TransitAgencyRead | undefined
): SourceStatusEntry {
	const base = { id: `transit:${agency.id}`, name: agency.name, maxAgeMs: TRANSIT_MAX_AGE_MS };
	if (t.reads === null) {
		// No read has completed: loading, or the failed read's error (never loading forever).
		return t.error === null
			? { ...base, state: 'loading', observedAt: null, detail: null }
			: { ...base, state: 'unavailable', observedAt: null, detail: t.error };
	}
	if (!read) return { ...base, state: 'unknown', observedAt: null, detail: 'not checked' };
	if (read.alerts === null)
		return { ...base, state: 'unavailable', observedAt: null, detail: read.error };
	// The latest read failed after this one: kept, as of its own feed time (Codex r1 #2).
	if (t.error !== null)
		return { ...base, state: 'stale', observedAt: read.observedAt, detail: t.error };
	// ok only with the feed's own time, judged by the clock (effectiveState); untimed reads are unknown.
	return { ...base, state: 'ok', observedAt: read.observedAt, detail: null };
}

function transit(t: TransitState, now: number): Built {
	const entries: SourceStatusEntry[] = [];
	const lines: Line[] = [];
	const rows: Row[] = [];
	let answered = 0;
	const claims: TransitAgencyRead[] = [];
	for (const agency of MARIN_AGENCIES) {
		const read = t.reads?.find((r) => r.id === agency.id);
		const page = AGENCY_PAGES[agency.id] ?? null;
		for (const a of read?.alerts ?? [])
			rows.push({ id: a.id, title: a.title, url: a.url, meta: agency.name });
		if (page && !read?.alerts?.length) {
			// No claim from 511 here (empty, failed or not read): the agency's own page answers.
			lines.push({
				id: agency.id,
				label: agency.name,
				text: `See ${page.label}`,
				state: 'reference',
				url: page.url
			});
			continue;
		}
		const entry = agencyEntry(agency, t, read);
		const state = effectiveState(entry, now);
		entries.push(entry);
		if (read?.alerts) {
			answered += 1;
			claims.push(read);
		}
		lines.push({
			id: agency.id,
			label: agency.name,
			text: agencyText(state, read?.alerts?.length ?? null),
			state,
			url: page?.url ?? MARIN_TRANSIT_PAGE
		});
	}
	// Every claiming feed's own time must be usable before taking the oldest (Codex r2 #6, r3 #2).
	const usable = (at: number | null) =>
		at !== null && Number.isFinite(at) && at - now <= FUTURE_SKEW_MS;
	const meta =
		claims.length === 0
			? null
			: claims.every((c) => usable(c.observedAt))
				? timed(
						'511',
						'updated',
						Math.min(...claims.map((c) => c.observedAt as number)),
						now,
						false
					)
				: '511 · time unknown';
	return { part: part({ lines, ...preview(rows), meta }), entries, answered };
}

// ── The section ───────────────────────────────────────────────────────────

export function gettingAroundView(input: GettingAroundInput): GettingAroundView {
	const t = transit(input.transit, input.now);
	const a = input.open ? airports(input.outcomes.airport, input.airport, input.now) : null;
	const r = input.open ? roads(input.outcomes.traffic, input.traffic, input.now) : null;
	const built = [a, r, t].filter((b): b is Built => b !== null);
	const answered = built.reduce((n, b) => n + b.answered, 0);
	return {
		airports: a?.part ?? part(),
		roads: r?.part ?? part(),
		transit: t.part,
		status: presentSection(
			built.flatMap((b) => b.entries),
			{ total: answered, matching: answered },
			input.now
		)
	};
}
