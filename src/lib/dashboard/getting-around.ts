/**
 * Getting Around (spec §2.5, §13.10; v2 design 2026-10-16; cameras live in the Cams strip, decision 5a).
 * Pure: what the section says about Marin roads and the airport routes, transit, and SFO/OAK, and
 * its header status. Nothing is classified by keywords: an alert or incident is whatever 511 (or
 * goldengate.org, GGALERT1) lists; the only names matched are the promotions in PROMO_HEADLINES. An all-clear ("No airport-wide
 * delays", "No alerts on 511", "511 reports no incidents…") is said only for an ok read: complete,
 * timed, fresh, not retained, nothing unreadable.
 */
import {
	MARIN_AGENCIES,
	timingAt,
	type TransitAgencyRead,
	type TransitAlertRow
} from '$lib/api/marin/transit';
import type { TrafficCorridorsData } from '$lib/api/marin/traffic-corridors';
import { GG_ALERTS_PAGE, type GgAlertsBlob } from '$lib/gg-alerts';
import { ROAD_SCOPE, TRIP_LABEL } from '$lib/config/traffic-corridors';
import type {
	AirportOperationalStatus,
	AirportStatus,
	AirportStatusData,
	DelayInfo
} from '$lib/types/airport';
import { failureKindOf } from './failure-kind';
import { formatItemAge } from './latest-reporting';
import { formatAsOf } from './pacific-time';
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
/** sync-gg-alerts runs every 15 min: an hour is 4 missed runs (/api/health's own limit). */
export const GG_ALERTS_MAX_AGE_MS = 60 * 60_000;
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
	/** Pages listed inline after the text (the agencies 511 lists nothing for). */
	links: { label: string; url: string }[];
}
interface Row {
	id: string;
	/** Chips before the title, independent (design §1): "Marin", "to SFO" / "toward Marin" (roads only). */
	tags: string[];
	title: string;
	/** The item's own page, or null (never a guessed one). */
	url: string | null;
	meta: string;
	/** Adds a colored dot to the severity the meta already says in words (roads only). */
	tone: 'closed' | 'major' | 'unknown' | 'moderate' | 'minor' | null;
}
export interface Part {
	lines: Line[];
	rows: Row[];
	/** Listed items beyond the preview. */
	more: number;
	/** One line instead of content: loading, unavailable, or an honest empty. */
	note: string | null;
	/** Each source and its own time, e.g. "511 · checked 1 min ago". */
	meta: string | null;
	/** "See more" when it isn't the part's default page (transit's hidden rows all Golden Gate's). */
	link: { url: string; label: string } | null;
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
	/** goldengate.org's list as sync-gg-alerts last wrote it; its read is outcomes['gg-alerts']. */
	ggAlerts: GgAlertsBlob | null;
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
	link: null,
	scope: null,
	state: null,
	...over
});
const preview = (rows: Row[]) => ({
	rows: rows.slice(0, PREVIEW),
	more: Math.max(0, rows.length - PREVIEW)
});
/** At most `max` characters, cut at a word, whitespace collapsed. */
function clip(text: string, max: number): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= max) return flat;
	const cut = flat.slice(0, max - 1);
	const space = cut.lastIndexOf(' ');
	return `${space > max / 2 ? cut.slice(0, space) : cut}…`;
}
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

/** The airports part on its own (the map's pins, MAPX2c): the same read, the same words. */
export const airportsPart = (
	fetch: DatasetFetch | undefined,
	data: AirportStatusData | null,
	now: number
): Part => airports(fetch, data, now).part;

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
				detail: a ? 'FAA feed unreadable' : 'not in the response',
				// The server folds its own HTTP and timeout failures into "unknown": no kind is known (Codex 1a #3).
				failure: 'unknown'
			});
			return {
				id: code,
				label: code,
				text: 'FAA status unavailable',
				state: 'unavailable',
				url: null,
				links: []
			};
		}
		return { id: code, label: code, text: caveated(a, words, state), state, url: null, links: [] };
	});
	const answered = lines.filter((l) => l.state !== 'unavailable').length;
	// Both plainly clear on an ok read: one line (design §3); anything else keeps both.
	const clear = lines.every((l) => l.state === 'ok' && l.text === STATUS_WORDS['on-time']);
	// A 200 with no FAA status for either airport is not healthy coverage (Codex r2 #2): the
	// transport entry counts only when an airport line was actually answered.
	return {
		part: part({
			lines: clear ? [] : lines,
			note: clear ? 'No airport-wide delays at SFO or OAK' : null,
			meta: timed('FAA', 'checked', entry.observedAt, now, false),
			state: answered ? state : 'unavailable'
		}),
		entries: answered ? entries : entries.slice(1),
		answered
	};
}

// ── Roads ─────────────────────────────────────────────────────────────────

const TONE = { Major: 'major', Moderate: 'moderate', Minor: 'minor' } as const;
/** 511's direction words as the road signs say them ("Southbound" → "SB"): the title fits a phone line. */
const short = (where: string) =>
	where.replace(/\b(North|South|East|West)bound\b/g, (_, d: string) => `${d[0]}B`);

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
		return {
			id: e.id,
			// An unplaced event names no corridor beyond "location unconfirmed" (Codex GA-v2 #2).
			tags: [
				e.marin ? 'Marin' : null,
				e.trip ? TRIP_LABEL[e.trip] : e.corridor && e.certain ? 'toward Marin' : null
			].filter((t): t is string => t !== null),
			title: [e.road, short(e.where)].filter(Boolean).join(' '),
			url: null,
			meta: [
				e.kind,
				e.lanes,
				e.closed ? 'road closed' : null,
				e.severity ?? 'severity unknown',
				e.certain ? null : 'location unconfirmed',
				age
			]
				.filter(Boolean)
				.join(' · '),
			tone: e.closed ? 'closed' : e.severity === null ? 'unknown' : TONE[e.severity]
		};
	});
	const empty =
		state === 'ok'
			? "511 reports no incidents on these roads · congestion isn't measured"
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
 * goldengate.org listed active alerts; 2026-10-16: 0 of 107 regional alerts were theirs). So an ok,
 * empty read is said only as 511's ("No alerts on 511; check the agencies"), with each agency's page
 * one tap away. Marin Transit's too: a populated feed is not proof of complete coverage (Codex r4 #1).
 */
const MARIN_TRANSIT_PAGE = 'https://marintransit.gov/service-alerts';
const AGENCY_PAGES: Readonly<Record<string, { label: string; url: string }>> = {
	GG: { label: 'goldengate.org', url: 'https://www.goldengate.org/service-alerts/' },
	GF: { label: 'goldengate.org', url: 'https://www.goldengate.org/service-alerts/' },
	MA: { label: 'marintransit.gov', url: MARIN_TRANSIT_PAGE },
	SA: { label: 'sonomamarintrain.org', url: 'https://www.sonomamarintrain.org/' },
	AF: { label: 'angelislandferry.com', url: 'https://angelislandferry.com/' }
};
const NO_511 = 'No alerts on 511; check the agencies';
/** 511 listed alerts, but only promotions or ones not in effect. */
const NOTHING_NOW = 'No disruptions listed on 511 now';

/** Promotions dropped by name, exact after trim (design §2: never by "no routes/stops"). */
export const PROMO_HEADLINES: readonly string[] = ['Save Money with Clipper!'];
/** Names shown in a group row before "…". */
const GROUP_NAMES = 3;

/** A row, how many alerts it stands for ("N more" counts alerts, call 4), and whose list it is. */
interface Summary {
	row: Row;
	alerts: number;
	source: 'goldengate.org' | '511';
}

const prefixOf = (a: TransitAlertRow) =>
	a.headline.includes(' - ') ? a.headline.split(' - ')[0].trim() : null;
/** The stop named after " - ", a leading NB/SB/EB/WB moved to the end ("SB Terra Linda" → "Terra Linda SB"). */
function stopName(a: TransitAlertRow): string {
	const name = a.headline.slice(a.headline.indexOf(' - ') + 3).trim();
	const m = /^(NB|SB|EB|WB)\s+(.+)$/.exec(name);
	return m ? `${m[2]} ${m[1]}` : name;
}
const unverified = (alerts: TransitAlertRow[], now: number) =>
	alerts.some((a) => timingAt(a.periods, now) === 'unverified') ? 'timing unverified' : null;
const row = (id: string, title: string, url: string | null, meta: (string | null)[]): Row => ({
	id,
	tags: [],
	title,
	url,
	meta: meta.filter(Boolean).join(' · '),
	tone: null
});

/** One group row (calls 2–3): "Night Closure · 7 stops: Terra Linda SB, Lucky Dr, …", one member's words as the example. */
function groupRow(
	agencyName: string,
	prefix: string,
	members: TransitAlertRow[],
	now: number
): Row {
	const stops = new Set(members.flatMap((a) => a.stopIds)).size || members.length;
	const names = members.map(stopName).filter(Boolean);
	const listed = names.length > GROUP_NAMES ? [...names.slice(0, GROUP_NAMES), '…'] : names;
	const example = members.find((a) => a.description !== null);
	const exampleName = example && stopName(example);
	return row(
		members[0].id,
		`${prefix} · ${stops} stops${listed.length ? `: ${listed.join(', ')}` : ''}`,
		members.find((a) => a.url !== null)?.url ?? null,
		// The qualification before the alert's words: the clamp may hide their end (Codex GA-v2 #5).
		[
			'511',
			agencyName,
			unverified(members, now),
			example ? `e.g. ${exampleName ? `${exampleName}: ` : ''}${example.description}` : null
		]
	);
}

function summaries(agencyName: string, alerts: TransitAlertRow[], now: number): Summary[] {
	const kept = alerts.filter(
		(a) => timingAt(a.periods, now) !== 'not-now' && !PROMO_HEADLINES.includes(a.headline.trim())
	);
	const groups = new Map<string, TransitAlertRow[]>();
	for (const a of kept) {
		const prefix = prefixOf(a);
		if (prefix !== null) groups.set(prefix, [...(groups.get(prefix) ?? []), a]);
	}
	const out: Summary[] = [];
	for (const a of kept) {
		const prefix = prefixOf(a);
		const members = prefix === null ? [] : groups.get(prefix)!;
		if (members.length >= 2) {
			// The group stands at its first member's place in the feed.
			if (members[0] === a)
				out.push({
					row: groupRow(agencyName, prefix!, members, now),
					alerts: members.length,
					source: '511'
				});
			continue;
		}
		out.push({
			row: row(a.id, a.headline.trim(), a.url, [
				'511',
				agencyName,
				unverified([a], now),
				a.description && clip(a.description, 140)
			]),
			alerts: 1,
			source: '511'
		});
	}
	return out;
}

/** One agency's alerts as rows at `now`: promos and not-now dropped, same-prefix alerts grouped. */
export function transitRows(agencyName: string, alerts: TransitAlertRow[], now: number): Row[] {
	return summaries(agencyName, alerts, now).map((s) => s.row);
}

/** The alerts the section shows for one agency: in effect now, promotions dropped. */
function shownAlerts(agencyName: string, alerts: TransitAlertRow[], now: number): number {
	return summaries(agencyName, alerts, now).reduce((n, s) => n + s.alerts, 0);
}

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
			: {
					...base,
					state: 'unavailable',
					observedAt: null,
					detail: t.error,
					failure: failureKindOf(t.error)
				};
	}
	if (!read) return { ...base, state: 'unknown', observedAt: null, detail: 'not checked' };
	if (read.alerts === null)
		return {
			...base,
			state: 'unavailable',
			observedAt: null,
			detail: read.error,
			failure: failureKindOf(read.error)
		};
	// The latest read failed after this one: kept, as of its own feed time (Codex r1 #2).
	if (t.error !== null)
		return {
			...base,
			state: 'stale',
			observedAt: read.observedAt,
			detail: t.error,
			failure: failureKindOf(t.error)
		};
	// ok only with the feed's own time, judged by the clock (effectiveState); untimed reads are unknown.
	return { ...base, state: 'ok', observedAt: read.observedAt, detail: null };
}

// ── Golden Gate's own list (GGALERT1) ──

/** The agencies goldengate.org speaks for when its read is ok. */
const GOLDEN_GATE = new Set(['GG', 'GF']);
const GG_SOURCE = 'goldengate.org';
const GG_ALL = { url: GG_ALERTS_PAGE, label: 'All Golden Gate alerts (goldengate.org)' };
const GG_SITE_WORDS: Partial<Record<SourceEntryState, string>> = {
	stale: 'Out of date',
	unavailable: 'Alerts unavailable',
	unknown: 'Not verified'
};
/** Headlines match only exactly, case and whitespace folded. */
const folded = (headline: string) => headline.replace(/\s+/g, ' ').trim().toLowerCase();

interface Site {
	entry: SourceStatusEntry;
	/** ok: the source for GG and GF. */
	trusted: boolean;
	rows: Summary[];
	line: Line | null;
	meta: string | null;
}

/**
 * The page gives no publish times: each row is dated by our check alone. A failed latest read is
 * unavailable, its last good list kept under that list's own check time; never "no alerts".
 */
function ggSite(fetch: DatasetFetch | undefined, blob: GgAlertsBlob | null, now: number): Site {
	const read = datasetEntry('gg-alerts', `${GG_SOURCE} alerts`, fetch, GG_ALERTS_MAX_AGE_MS);
	const entry: SourceStatusEntry =
		blob?.lastFailure && read.state !== 'loading'
			? {
					...read,
					state: 'unavailable',
					detail: blob.lastFailure.error,
					failure: failureKindOf(blob.lastFailure.error)
				}
			: read;
	const state = effectiveState(entry, now);
	const at = parseObservedAt(blob?.lastSuccessfulScrapeAt);
	const meta =
		at === null || at - now > FUTURE_SKEW_MS
			? null
			: `${GG_SOURCE} · checked ${formatAsOf(at, now)}${now - at > GG_ALERTS_MAX_AGE_MS ? OUT_OF_DATE : ''}`;
	const rows = (meta && blob?.alerts ? blob.alerts : []).map(
		(a): Summary => ({
			row: {
				...row(`gg-${a.id}`, a.headline, `${GG_ALERTS_PAGE}#${a.id}`, [meta]),
				tags: a.routes
			},
			alerts: 1,
			source: GG_SOURCE
		})
	);
	const trusted = state === 'ok';
	const line = (label: string, text: string): Line => ({
		id: 'gg-site',
		label,
		text,
		state,
		url: GG_ALERTS_PAGE,
		links: []
	});
	return {
		entry,
		trusted,
		rows,
		meta,
		line:
			state === 'loading' || (trusted && rows.length)
				? null
				: trusted
					? line(
							'Golden Gate Transit, Golden Gate Ferry',
							'No Golden Gate alerts listed on goldengate.org'
						)
					: line(
							GG_SOURCE,
							state === 'unavailable' && rows.length
								? 'Latest read failed'
								: (GG_SITE_WORDS[state] ?? 'Not verified')
						)
	};
}

function transit(t: TransitState, gg: Site, now: number): Built {
	const entries: SourceStatusEntry[] = [];
	const lines: Line[] = [];
	const shown: Summary[] = [];
	const quiet: (typeof MARIN_AGENCIES)[number][] = [];
	const claims: TransitAgencyRead[] = [];
	const onSite = new Set(gg.rows.map((s) => folded(s.row.title)));
	for (const agency of MARIN_AGENCIES) {
		const read = t.reads?.find((r) => r.id === agency.id);
		const entry = agencyEntry(agency, t, read);
		const state = effectiveState(entry, now);
		entries.push(entry);
		if (read?.alerts) claims.push(read);
		// The site's ok read speaks for Golden Gate: 511's GG/GF alerts show unless the site lists the
		// same headline (by 511's own headline, before grouping). A site read we can't trust hides nothing.
		const speaks = GOLDEN_GATE.has(agency.id) && gg.trusted;
		const alerts = read?.alerts?.filter((a) => !speaks || !onSite.has(folded(a.headline)));
		const own = alerts ? summaries(agency.name, alerts, now) : [];
		shown.push(...own);
		if (speaks) continue;
		// ok implies a read with a list (agencyEntry); everything else keeps its own words.
		if (state === 'ok' && read!.alerts!.length === 0) {
			quiet.push(agency);
			continue;
		}
		if (state === 'ok' && own.length) continue;
		lines.push({
			id: agency.id,
			label: agency.name,
			text: state === 'ok' ? NOTHING_NOW : agencyText(state, read?.alerts?.length ?? null),
			state,
			url: AGENCY_PAGES[agency.id].url,
			links: []
		});
	}
	if (quiet.length)
		lines.unshift({
			id: 'no-511',
			label: quiet.map((a) => a.name).join(', '),
			text: NO_511,
			state: 'reference',
			url: null,
			links: quiet
				.map((a) => AGENCY_PAGES[a.id])
				.filter((p, i, all) => all.findIndex((q) => q.url === p.url) === i)
		});
	if (gg.line) lines.push(gg.line);
	// Every claiming feed's own time must be usable before taking the oldest (Codex r2 #6, r3 #2).
	const usable = (at: number | null) =>
		at !== null && Number.isFinite(at) && at - now <= FUTURE_SKEW_MS;
	const meta511 =
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
	// Golden Gate's own rows first, in page order; then 511's, in feed order.
	const all = [...gg.rows, ...shown];
	const hidden = all.slice(PREVIEW);
	return {
		part: part({
			lines,
			rows: all.slice(0, PREVIEW).map((s) => s.row),
			more: hidden.reduce((n, s) => n + s.alerts, 0),
			meta: [gg.meta, meta511].filter(Boolean).join('; ') || null,
			link: hidden.length && hidden.every((s) => s.source === GG_SOURCE) ? GG_ALL : null
		}),
		entries: [...entries, gg.entry],
		answered: claims.length + (gg.meta ? 1 : 0)
	};
}

// ── The section ───────────────────────────────────────────────────────────

export function gettingAroundView(input: GettingAroundInput): GettingAroundView {
	const t = transit(
		input.transit,
		ggSite(input.outcomes['gg-alerts'], input.ggAlerts, input.now),
		input.now
	);
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

// ── The brief's status card (MAPX1) ──────────────────────────────────────

export interface CardItem {
	text: string;
	state: SourceEntryState;
}

const MARIN_TRANSIT = 'Marin Transit';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One line per part for the brief's card, from the section's own view. An all-clear is said
 * only where the part says it from a fresh ok read; anything else keeps the part's own words.
 * A part the page hasn't read (the phone's closed section: airports, roads) says nothing.
 */
export function gettingAroundCard(
	view: GettingAroundView,
	input: Pick<GettingAroundInput, 'transit' | 'traffic' | 'now'>
): CardItem[] {
	const { airports: a, roads: r, transit: t } = view;
	return [...airportItems(a), ...roadItems(r, input.traffic), transitItem(t, input)];
}

/** Lowers a leading capitalised word ("Delays" → "delays"); an acronym ("FAA") stays. */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * Each airport's card words, keyed by code (the map's pins, MAPX2c); empty when the part has
 * none per airport (unread, loading, out of date or failed): the card then says one line.
 */
export function airportWords(a: Part): (CardItem & { code: string })[] {
	if (a.state === 'ok' && a.note)
		return SUMMARY_AIRPORTS.map((code) => ({ code, text: `${code} no delays`, state: 'ok' }));
	if (a.state === 'ok' || (a.lines.length && a.state !== 'stale'))
		return a.lines.map((l) => ({
			code: l.label,
			text: `${l.label} ${lowerFirst(l.text)}`,
			state: l.state
		}));
	return [];
}

/** The card's airport items: each airport's words, or one line saying why there are none. */
export function airportItems(a: Part): CardItem[] {
	if (a.state === null) return [];
	const words = airportWords(a);
	if (words.length) return words.map(({ text, state }) => ({ text, state }));
	return [
		{
			text:
				a.state === 'stale'
					? 'Airport status out of date'
					: (a.note ?? 'Airport status unavailable'),
			state: a.state
		}
	];
}

function roadItems(r: Part, traffic: TrafficCorridorsData | null): CardItem[] {
	if (r.state === null) return [];
	if (r.state !== 'ok')
		return [
			{
				text: r.state === 'stale' ? 'Traffic out of date' : (r.note ?? 'Traffic not verified'),
				state: r.state
			}
		];
	const events = traffic?.events ?? [];
	const marin = events.filter((e) => e.marin).length;
	const routes = events.length - marin;
	return [
		{
			text: `${marin ? `${plural(marin, 'incident')} on Marin roads` : '511 lists no incidents on Marin roads'}${routes ? ` · ${routes} on airport routes` : ''}`,
			state: 'ok'
		}
	];
}

function transitItem(t: Part, input: Pick<GettingAroundInput, 'transit' | 'now'>): CardItem {
	const own = t.lines.find((l) => l.label === MARIN_TRANSIT);
	const quiet = t.lines.find((l) => l.id === 'no-511' && l.label.includes(MARIN_TRANSIT));
	if (quiet) return { text: `${MARIN_TRANSIT}: 511 lists no alerts`, state: quiet.state };
	if (own) return { text: `${MARIN_TRANSIT}: ${own.text.toLowerCase()}`, state: own.state };
	const alerts = input.transit.reads?.find((x) => x.name === MARIN_TRANSIT)?.alerts ?? [];
	const count = shownAlerts(MARIN_TRANSIT, alerts, input.now);
	return { text: `${MARIN_TRANSIT}: ${plural(count, 'alert')} on 511`, state: 'ok' };
}
