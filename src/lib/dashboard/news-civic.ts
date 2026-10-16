/**
 * News & Civic (desktop Goal 4): the wire after Latest reporting, Fix It Marin (311) and
 * police & parks. Pure. The wire continues Latest reporting's own order and never repeats
 * its rows; each card keeps its own read, so a failed one is unavailable, never 0 or "none".
 */
import { PARK_NAMES, type NpsAlert } from '$lib/api/marin/nps';
import { orderedReporting } from '$lib/news/reporting';
import type { NewsSnapshotView } from '$lib/news/snapshot';
import type { NewsItem } from '$lib/types';
import {
	REPORTING_FEEDS,
	feedCoverage,
	formatItemAge,
	reportingCandidates,
	reportingFeeds,
	toReportingRow,
	type ReportingRow
} from './latest-reporting';
import { mapMeasured, measuredFromEntry, type Measured } from './measured';
import { PACIFIC, nextDate, pacificDate } from './pacific-time';
import { datasetEntry, fromSnapshotSource, type DatasetFetch } from './source-adapters';
import {
	effectiveState,
	presentSection,
	type SectionPresentation,
	type SourceStatusEntry
} from './source-status';

/** News & Civic's own detail reads (loaded when the section opens). */
export const CIVIC_DATASETS = {
	police: { id: 'police', name: 'Police logs' },
	nps: { id: 'nps-alerts', name: 'NPS alerts' }
} as const;

export const WIRE_MAX = 12;
const TYPES_SHOWN = 6;
const RECENT_311 = 3;
const POLICE_SHOWN = 3;
const PARKS_SHOWN = 2;
const TITLE_MAX = 90;

export interface FixItDay {
	/** Pacific calendar date, YYYY-MM-DD. */
	key: string;
	label: string;
	count: number;
}

export interface FixItSummary {
	count: number;
	/** Oldest to newest Pacific day, through today; a day with no reports is 0. */
	days: FixItDay[];
	types: { type: string; count: number }[];
	recent: { id: string; type: string; place: string; age: string; link: string }[];
}

export interface CivicRow {
	id: string;
	title: string;
	meta: string;
	link: string;
}

export interface NewsCivicView {
	/** The snapshot's feeds that read OK now, for the header; null before a snapshot. */
	feeds: { ok: number; total: number } | null;
	wire: Measured<readonly ReportingRow[]>;
	fixIt: Measured<FixItSummary>;
	police: Measured<readonly CivicRow[]>;
	parks: Measured<readonly CivicRow[]>;
	status: SectionPresentation;
}

const DAY_LABEL = new Intl.DateTimeFormat('en-US', {
	timeZone: PACIFIC,
	month: 'short',
	day: 'numeric'
});

/** Noon UTC on a date reads as that same date in Pacific time, for its label. */
const labelOf = (key: string) => DAY_LABEL.format(Date.parse(`${key}T12:00:00Z`));

/** "Illegal Dumping · 35 Main St" → type and place (SeeClickFix's title). */
function splitIssue(title: string): { type: string; place: string } {
	const at = title.indexOf(' · ');
	return at < 0
		? { type: title, place: '' }
		: { type: title.slice(0, at), place: title.slice(at + 3) };
}

export function fixItSummary(items: readonly NewsItem[], now: number): FixItSummary {
	const dated = items.filter((i) => Number.isFinite(i.timestamp));
	const byDay = new Map<string, number>();
	const byType = new Map<string, number>();
	for (const item of dated) {
		const key = pacificDate(item.timestamp);
		byDay.set(key, (byDay.get(key) ?? 0) + 1);
		const { type } = splitIssue(item.title);
		byType.set(type, (byType.get(type) ?? 0) + 1);
	}
	const keys = [...byDay.keys()].sort();
	const days: FixItDay[] = [];
	if (keys.length) {
		const today = pacificDate(now);
		const last = keys.at(-1)! > today ? keys.at(-1)! : today;
		for (let key = keys[0]; key <= last; key = nextDate(key))
			days.push({ key, label: labelOf(key), count: byDay.get(key) ?? 0 });
	}
	return {
		count: dated.length,
		days,
		types: [...byType.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, TYPES_SHOWN)
			.map(([type, count]) => ({ type, count })),
		recent: [...dated]
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, RECENT_311)
			.map((i) => ({
				id: i.id,
				...splitIssue(i.title),
				age: formatItemAge(i.timestamp, now),
				link: i.link
			}))
	};
}

const clip = (s: string) => (s.length > TITLE_MAX ? `${s.slice(0, TITLE_MAX - 2)}…` : s);

function policeRows(items: readonly NewsItem[], now: number): CivicRow[] {
	return items
		.filter((i) => Number.isFinite(i.timestamp))
		.sort((a, b) => b.timestamp - a.timestamp)
		.slice(0, POLICE_SHOWN)
		.map((i) => ({
			id: i.id,
			title: clip(i.title),
			meta: `${i.source} · ${formatItemAge(i.timestamp, now)}`,
			link: i.link
		}));
}

function parkRows(alerts: readonly NpsAlert[]): CivicRow[] {
	return alerts.slice(0, PARKS_SHOWN).map((a) => ({
		id: `nps-${a.id}`,
		title: clip(a.title),
		meta: `NPS · ${PARK_NAMES[a.parkCode] ?? a.parkCode.toUpperCase()} · ${a.category}`,
		link: a.url || `https://www.nps.gov/${a.parkCode}/planyourvisit/conditions.htm`
	}));
}

export function newsCivicView(input: {
	view: NewsSnapshotView | null;
	sources: readonly SourceStatusEntry[];
	/** Latest reporting's rows: the wire never repeats them. */
	shownIds: ReadonlySet<string>;
	fixIt: readonly NewsItem[] | null;
	police: readonly NewsItem[] | null;
	nps: readonly NpsAlert[] | null;
	outcomes: Readonly<Record<string, DatasetFetch>>;
	now: number;
}): NewsCivicView {
	const { view, sources, shownIds, now } = input;
	const read = sources.find((e) => e.id === 'part:snapshot');
	const viewM = measuredFromEntry(read, view, read?.name ?? 'News snapshot', now);
	const usable = viewM.kind === 'value' ? viewM.value : null;

	const rows = usable
		? orderedReporting(reportingCandidates(usable), now)
				.filter((e) => !shownIds.has(e.item.id))
				.slice(0, WIRE_MAX)
				.map((e) => toReportingRow(e, now))
		: [];
	const feeds = reportingFeeds(usable, sources);
	const wire = feedCoverage(viewM, feeds, rows as readonly ReportingRow[], now, REPORTING_FEEDS);

	const fixItEntry = sources.find((e) => e.id === 'part:seeclickfix');
	const fixIt = mapMeasured(
		measuredFromEntry(fixItEntry, input.fixIt, 'Fix It Marin (SeeClickFix)', now),
		(items) => fixItSummary(items, now)
	);
	const D = CIVIC_DATASETS;
	const policeEntry = datasetEntry(D.police.id, D.police.name, input.outcomes[D.police.id], null);
	const npsEntry = datasetEntry(D.nps.id, D.nps.name, input.outcomes[D.nps.id], null);
	const police = mapMeasured(
		measuredFromEntry(policeEntry, input.police, 'Police logs', now),
		(items) => policeRows(items, now)
	);
	const parks = mapMeasured(measuredFromEntry(npsEntry, input.nps, 'NPS alerts', now), parkRows);

	const snapshotFeeds = (usable?.sources ?? []).map(fromSnapshotSource);
	const readEntry = read && effectiveState(read, now) !== 'ok' ? [read] : [];
	const all = [...readEntry, ...feeds, ...(fixItEntry ? [fixItEntry] : []), policeEntry, npsEntry];
	const valued = [wire, fixIt, police, parks].filter((m) => m.kind === 'value').length;
	return {
		feeds: usable
			? {
					ok: snapshotFeeds.filter((e) => effectiveState(e, now) === 'ok').length,
					total: snapshotFeeds.length
				}
			: null,
		wire,
		fixIt,
		police,
		parks,
		status: presentSection(all, { total: valued, matching: valued }, now)
	};
}
