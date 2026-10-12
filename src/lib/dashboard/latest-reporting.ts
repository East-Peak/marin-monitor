/**
 * "Latest reporting" for the v2 dashboard (spec §2.4, §4, §13.8). Pure: no DOM, no clock reads.
 *
 * Candidates are the snapshot's deduplicated stories, not the news store (it keeps one copy
 * per category, drops alsoReportedBy and re-stamps keyword alerts). Selection is batch 1's
 * selectLatestReporting. Coverage: the snapshot read gates the view; the reporting feeds
 * decide what the list can vouch for (transport success is not coverage). Rows live only
 * inside a value coverage, carry their feed's own retention, and have no alert field.
 */
import { FEEDS } from '$lib/config/feeds';
import { isCountyScopedFeed } from '$lib/config/county-scope';
import { TOWN_BY_SLUG } from '$lib/config/towns';
import { snapshotItemToNewsItem } from '$lib/api/marin/news-snapshot';
import { newsSourceId } from '$lib/news/source-id';
import {
	REPORTING_CATEGORIES,
	isEligibleReporting,
	selectLatestReporting,
	type ReportingEntry
} from '$lib/news/reporting';
import type { NewsSnapshotItem, NewsSnapshotView } from '$lib/news/snapshot';
import type { NewsCategory, NewsItem } from '$lib/types';
import {
	effectiveState,
	presentSection,
	type SectionPresentation,
	type SourceStatusEntry
} from './source-status';
import { SNAPSHOT_OBSERVATION_MAX_AGE_MS } from './source-adapters';
import { formatAsOf } from './pacific-time';
import {
	emptyWording,
	mapMeasured,
	measuredFromEntry,
	measuredUnavailable,
	measuredUnknown,
	measuredValue,
	type Measured
} from './measured';

/** Producer ids (newsSourceId(feed.name)) of COUNTY_WIDE_RULE's feeds; a test pins them. */
export const COUNTY_SCOPED_SOURCE_IDS: ReadonlySet<string> = new Set(
	Object.values(FEEDS)
		.flat()
		.filter((feed) => !feed.broken && isCountyScopedFeed(feed.url))
		.map((feed) => newsSourceId(feed.name))
);

function reportingCategory(story: NewsSnapshotItem): NewsCategory {
	if (REPORTING_CATEGORIES.has(story.category)) return story.category;
	return story.categories.find((c) => REPORTING_CATEGORIES.has(c)) ?? story.category;
}

/** Snapshot stories as NewsItems, with explicit county scope when any copy is county-scoped. */
export function reportingCandidates(view: NewsSnapshotView): NewsItem[] {
	return view.items.map((story) => {
		const county = [story.sourceId, ...story.alsoReportedBy].some((id) =>
			COUNTY_SCOPED_SOURCE_IDS.has(id)
		);
		return {
			...snapshotItemToNewsItem(story),
			category: reportingCategory(story),
			...(county ? { geoScope: 'county' as const } : {})
		};
	});
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const PACIFIC_DAY = new Intl.DateTimeFormat('en-US', {
	timeZone: 'America/Los_Angeles',
	month: 'short',
	day: 'numeric'
});

/** "N min ago" (at least 1), "N h ago" under a day, else the Pacific date. Never "just now". */
export function formatItemAge(publishedAt: number, now: number): string {
	const age = now - publishedAt;
	if (age < HOUR) return `${Math.max(1, Math.floor(age / MINUTE))} min ago`;
	if (age < 24 * HOUR) return `${Math.floor(age / HOUR)} h ago`;
	return PACIFIC_DAY.format(publishedAt);
}

export interface ReportingRow {
	id: string;
	title: string;
	link: string;
	source: string;
	age: string;
	scope: string;
	publishedAt: number;
	/** Set when this story's feed failed and the snapshot kept its last good copy. */
	retained: string | null;
}

function scopeLabel(entry: ReportingEntry): string {
	switch (entry.scope) {
		case 'town': {
			const slug = entry.item.townSlug ?? '';
			return entry.item.town ?? TOWN_BY_SLUG[slug]?.name ?? slug;
		}
		case 'county':
			return 'County-wide';
		case 'unlocated':
			return 'No town named';
	}
}

export function toReportingRow(
	entry: ReportingEntry,
	now: number,
	retained: string | null = null
): ReportingRow {
	return {
		id: entry.item.id,
		title: entry.item.title,
		link: entry.item.link,
		source: entry.item.source,
		age: formatItemAge(entry.publishedAt, now),
		scope: scopeLabel(entry),
		publishedAt: entry.publishedAt,
		retained
	};
}

export interface LatestReportingView {
	/** The rows exist only inside a value: loading/unknown/unavailable coverage shows none. */
	coverage: Measured<readonly ReportingRow[]>;
	/** "Nothing" wording, only for a fresh, successful, empty read of every reporting feed. */
	empty: string | null;
	presentation: SectionPresentation;
	/** The rows' ids: a later News & Civic section never repeats them. */
	shownIds: ReadonlySet<string>;
}

const REPORTING_FEEDS = { label: 'Reporting feeds', noun: 'reporting feed' };

/** The status entries of the snapshot's reporting feeds (never the read itself). */
function reportingFeeds(
	view: NewsSnapshotView | null,
	sources: readonly SourceStatusEntry[]
): SourceStatusEntry[] {
	const ids = new Set(
		(view?.sources ?? [])
			.filter((s) => REPORTING_CATEGORIES.has(s.category))
			.map((s) => `news:${s.id}`)
	);
	return sources.filter((e) => ids.has(e.id));
}

function feedNote(entry: SourceStatusEntry | undefined, now: number): string | null {
	if (!entry || effectiveState(entry, now) !== 'stale') return null;
	return entry.observedAt === null
		? 'Feed not updated recently'
		: `Feed not updated since ${formatAsOf(entry.observedAt, now)}`;
}

/**
 * Coverage of a list drawn from the snapshot, decided by its feeds, never by the read
 * (transport success is not coverage). Generic so the map's news layer uses the same rule
 * (Task 4 exports it; Codex r4 #1).
 */
function feedCoverage<T extends readonly unknown[]>(
	viewM: Measured<NewsSnapshotView>,
	feeds: readonly SourceStatusEntry[],
	shown: T,
	now: number,
	{ label, noun }: { label: string; noun: string }
): Measured<T> {
	if (viewM.kind !== 'value') return mapMeasured(viewM, () => shown);
	if (feeds.length === 0) return measuredUnknown(label, `no ${noun}s in the snapshot`);
	const fresh = feeds.filter((e) => effectiveState(e, now) === 'ok');
	if (fresh.length === 0 && shown.length === 0)
		return measuredUnavailable(label, `every ${noun} failed`);
	const behind = feeds.length - fresh.length;
	const retainedAfter =
		viewM.retainedAfter ??
		(behind > 0 ? `${behind} of ${feeds.length} ${noun}s not updated` : null);
	// A fresh "ok" entry always has a finite observedAt (effectiveState fails closed otherwise).
	const observedAt = fresh.length ? Math.min(...fresh.map((e) => e.observedAt as number)) : null;
	return measuredValue<T>(shown, label, observedAt, retainedAfter);
}

export function latestReportingView(input: {
	view: NewsSnapshotView | null;
	sources: readonly SourceStatusEntry[];
	town: string | null;
	now: number;
}): LatestReportingView {
	const { view, sources, town, now } = input;
	const read = sources.find((e) => e.id === 'part:snapshot');
	const viewM = measuredFromEntry(read, view, read?.name ?? 'News snapshot', now);
	const feeds = reportingFeeds(view, sources);
	const usable = viewM.kind === 'value' ? viewM.value : null;
	const candidates = usable ? reportingCandidates(usable) : [];
	const sourceOf = new Map((usable?.items ?? []).map((s) => [s.id, s.sourceId]));
	const feedById = new Map(feeds.map((e) => [e.id, e]));
	const rows = selectLatestReporting(candidates, { town, now }).map((e) =>
		toReportingRow(e, now, feedNote(feedById.get(`news:${sourceOf.get(e.item.id)}`), now))
	);
	const coverage = feedCoverage(
		viewM,
		feeds,
		rows as readonly ReportingRow[],
		now,
		REPORTING_FEEDS
	);
	const shown = coverage.kind === 'value' ? coverage.value : [];
	// The read counts only while it is loading or failing: a healthy read is not a healthy feed.
	const readEntry = read && effectiveState(read, now) !== 'ok' ? [read] : [];
	const empty = emptyWording(
		coverage,
		town ? 'No reporting for this town or county-wide right now' : 'No dated reporting right now',
		{ now, maxAgeMs: SNAPSHOT_OBSERVATION_MAX_AGE_MS }
	);
	const presentation = presentSection(
		[...readEntry, ...feeds],
		{
			total: candidates.filter((item) => isEligibleReporting(item, now)).length,
			matching: shown.length
		},
		now
	);
	return {
		coverage,
		empty,
		// "Nothing new"/"Nothing for this town" (empty, no-match) only where emptyWording allows
		// it; a retained or expired empty read is "as of" its own time, an unestablished one
		// unavailable (Codex r3 #3, 9a #1).
		presentation:
			(presentation.state === 'empty' || presentation.state === 'no-match') && empty === null
				? {
						...presentation,
						state: coverage.kind === 'value' ? 'stale' : 'unavailable',
						asOf: coverage.kind === 'value' ? coverage.observedAt : null
					}
				: presentation,
		shownIds: new Set(shown.map((r) => r.id))
	};
}
