import { beforeEach, describe, expect, it } from 'vitest';
import type { NewsSnapshotItem, NewsSnapshotView } from '$lib/news/snapshot';
import { FEEDS } from '$lib/config/feeds';
import { COUNTY_WIDE_RULE } from '$lib/config/county-scope';
import { NEWS_SOURCES } from '$lib/server/news/sources';
import { describePresentation } from './source-status';
import { fromSnapshotRead, fromSnapshotSource } from './source-adapters';
import {
	COUNTY_SCOPED_SOURCE_IDS,
	formatItemAge,
	latestReportingView,
	reportingCandidates,
	toReportingRow,
	type LatestReportingView
} from './latest-reporting';

const NOW = Date.parse('2026-10-01T15:00:00Z'); // 8:00 AM PDT
const H = 3_600_000;
const MV = { name: 'Mill Valley', slug: 'mill-valley', source: 'title-match' as const };
const SR = { name: 'San Rafael', slug: 'san-rafael', source: 'title-match' as const };
const IJ = { sourceId: 'marin-independent-journal', source: 'Marin Independent Journal' };
const NBC = { sourceId: 'nbc-bay-area-marin', source: 'NBC Bay Area – Marin' };
let seq = 0;

type StoryOver = Partial<NewsSnapshotItem> & { hoursAgo?: number | null };
function story(over: StoryOver = {}): NewsSnapshotItem {
	const { hoursAgo = 1, ...rest } = over;
	seq += 1;
	const at = hoursAgo === null ? null : new Date(NOW - hoursAgo * H).toISOString();
	const sourceId = rest.sourceId ?? 'point-reyes-light';
	const category = rest.category ?? 'local';
	return {
		id: `${sourceId}:s${seq}`,
		sourceId,
		source: 'Point Reyes Light',
		category,
		verification: 'local_media',
		title: `Distinct headline ${seq}`,
		link: `https://news.example/s${seq}`,
		canonicalUrl: `https://news.example/s${seq}`,
		summary: null,
		publishedAt: at,
		publishedAtRaw: at,
		publishedAtSource: at ? 'rss:pubDate' : null,
		publishedAtStatus: at ? 'valid' : 'missing',
		publishedAtAssumedZone: null,
		eventAt: null,
		eventAtSource: null,
		updatedAt: null,
		fetchedAt: new Date(NOW).toISOString(),
		town: null,
		point: null,
		topics: [],
		categories: [category],
		alsoReportedBy: [],
		...rest
	};
}

type SourceOver = Partial<NewsSnapshotView['sources'][number]>;
const RETAINED_PACIFIC_SUN: SourceOver = {
	id: 'pacific-sun',
	name: 'Pacific Sun',
	status: 'retained',
	lastSuccessAt: new Date(NOW - 3 * H).toISOString(),
	lastError: 'http-status: HTTP 403',
	consecutiveFailures: 12
};
function view(items: NewsSnapshotItem[], sources: SourceOver[] = [{}]): NewsSnapshotView {
	const at = new Date(NOW).toISOString();
	return {
		schemaVersion: 1,
		revision: 1,
		generatedAt: at,
		lastSuccessfulScrapeAt: at,
		sources: sources.map((s) => ({
			id: 'point-reyes-light',
			name: 'Point Reyes Light',
			category: 'local',
			verification: 'local_media',
			status: 'ok',
			lastAttemptAt: at,
			lastSuccessAt: at,
			lastError: null,
			consecutiveFailures: 0,
			itemCount: 1,
			...s
		})),
		items
	};
}
/** The controller's real entries for a view (batch 2 adapters), after a successful read. */
const entries = (v: NewsSnapshotView) => [
	fromSnapshotRead({ ok: true, at: NOW }, v),
	...v.sources.map(fromSnapshotSource)
];
const rowsOf = (out: LatestReportingView) =>
	out.coverage.kind === 'value' ? out.coverage.value : [];
const run = (v: NewsSnapshotView, town: string | null = null, sources = entries(v)) =>
	latestReportingView({ view: v, sources, town, now: NOW });
const titles = (v: NewsSnapshotView, town: string | null) =>
	rowsOf(run(v, town)).map((r) => r.title);

beforeEach(() => {
	seq = 0;
});

describe('county scope from the snapshot (Decision 1; the batch 2 → PR 9 handoff)', () => {
	it('the county-scoped ids are exactly the producer ids of COUNTY_WIDE_RULE’s feeds', () => {
		for (const url of COUNTY_WIDE_RULE.feedUrls) {
			const matches = Object.values(FEEDS)
				.flat()
				.filter((f) => f.url === url && !f.broken);
			expect(matches, url).toHaveLength(1);
		}
		const producerIds = NEWS_SOURCES.filter((s) => COUNTY_WIDE_RULE.feedUrls.includes(s.url)).map(
			(s) => s.id
		);
		expect([...COUNTY_SCOPED_SOURCE_IDS].sort()).toEqual([...producerIds].sort());
		expect([...COUNTY_SCOPED_SOURCE_IDS].sort()).toEqual([
			'marin-independent-journal',
			'nbc-bay-area-marin'
		]);
	});

	it('a story is county-wide when its own source or any merged copy is county-scoped', () => {
		const [a, b, c] = reportingCandidates(
			view([story({ ...IJ }), story({ alsoReportedBy: ['nbc-bay-area-marin'] }), story()])
		);
		expect(a.geoScope).toBe('county');
		expect(b.geoScope).toBe('county');
		expect(c.geoScope).toBeUndefined();
	});

	it('takes a reporting category from the story’s categories when its own is not one', () => {
		const [both, eventOnly] = reportingCandidates(
			view([
				story({ category: 'shows', categories: ['shows', 'local'] }),
				story({ category: 'shows' })
			])
		);
		expect(both.category).toBe('local');
		expect(eventOnly.category).toBe('shows');
	});
});

describe('selection (COUNTY_WIDE_RULE through selectLatestReporting)', () => {
	it('All of Marin: the 5 newest dated reporting items; undated, satire and >5 min future stay out', () => {
		const v = view([
			story({ hoursAgo: 1, title: 'a' }),
			story({ hoursAgo: 2, title: 'b', ...NBC }),
			story({ hoursAgo: 3, title: 'c' }),
			story({ hoursAgo: 4, title: 'd' }),
			story({ hoursAgo: 5, title: 'e' }),
			story({ hoursAgo: 6, title: 'f' }),
			story({ hoursAgo: null, title: 'undated' }),
			story({ hoursAgo: 0.5, title: 'satire', category: 'satire', verification: 'satire' }),
			story({ hoursAgo: -0.1, title: 'future' }) // 6 minutes ahead
		]);
		expect(titles(v, null)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('a town: 3 town items + 2 county-wide; unlocated never pads, even when newest', () => {
		const v = view([
			story({ hoursAgo: 0.2, title: 'unlocated newest' }),
			story({ hoursAgo: 1, title: 'mv1', town: MV }),
			story({ hoursAgo: 1.5, title: 'county1', ...IJ }),
			story({ hoursAgo: 2, title: 'mv2', town: MV }),
			story({ hoursAgo: 2.5, title: 'county2', ...NBC }),
			story({ hoursAgo: 3, title: 'mv3', town: MV }),
			story({ hoursAgo: 3.5, title: 'county3', ...IJ }),
			story({ hoursAgo: 4, title: 'mv4', town: MV })
		]);
		expect(titles(v, 'mill-valley')).toEqual(['mv1', 'county1', 'mv2', 'county2', 'mv3']);
	});

	it('county backfills unused town slots, never beyond 5; unlocated still never pads', () => {
		const v = view([
			story({ hoursAgo: 0.1, title: 'unlocated' }),
			story({ hoursAgo: 1, title: 'mv1', town: MV }),
			...[2, 3, 4, 5, 6].map((h) => story({ hoursAgo: h, title: `county${h}`, ...IJ }))
		]);
		expect(titles(v, 'mill-valley')).toEqual(['mv1', 'county2', 'county3', 'county4', 'county5']);
	});
});

describe('rows: source, age, scope and the feed’s own retention (Decision 2; Codex r3 #2)', () => {
	it('formats age from the publication time and the clock; never "just now"', () => {
		expect(formatItemAge(NOW - 20_000, NOW)).toBe('1 min ago');
		expect(formatItemAge(NOW + 120_000, NOW)).toBe('1 min ago'); // within the 5-minute skew
		expect(formatItemAge(NOW - 59 * 60_000, NOW)).toBe('59 min ago');
		expect(formatItemAge(NOW - 60 * 60_000, NOW)).toBe('1 h ago');
		expect(formatItemAge(NOW - 23.9 * H, NOW)).toBe('23 h ago');
		expect(formatItemAge(NOW - 72 * H, NOW)).toBe('Sep 28');
		// The date is Pacific: 06:30Z on Oct 1 is 11:30 PM on Sep 30 in Marin.
		expect(
			formatItemAge(Date.parse('2026-10-01T06:30:00Z'), Date.parse('2026-10-02T07:00:00Z'))
		).toBe('Sep 30');
	});

	it('labels scope: the town, "County-wide", or "No town named" (unlocated ≠ county-wide)', () => {
		const v = view([
			story({ hoursAgo: 1, town: MV }),
			story({ hoursAgo: 2, ...NBC }),
			story({ hoursAgo: 3 })
		]);
		expect(rowsOf(run(v)).map((r) => [r.source, r.age, r.scope, r.retained])).toEqual([
			['Point Reyes Light', '1 h ago', 'Mill Valley', null],
			['NBC Bay Area – Marin', '2 h ago', 'County-wide', null],
			['Point Reyes Light', '3 h ago', 'No town named', null]
		]);
	});

	it('a story from a feed the fresh snapshot only retained says so, with that feed’s own time', () => {
		const v = view(
			[
				story({ hoursAgo: 1, title: 'fresh' }),
				story({ hoursAgo: 4, title: 'kept', sourceId: 'pacific-sun' })
			],
			[{}, RETAINED_PACIFIC_SUN]
		);
		const out = run(v);
		expect(rowsOf(out).map((r) => [r.title, r.retained])).toEqual([
			['fresh', null],
			['kept', 'Feed not updated since 5:00 AM']
		]);
		expect(out.coverage).toMatchObject({
			kind: 'value',
			retainedAfter: '1 of 2 reporting feeds not updated'
		});
		expect(out.empty).toBeNull();
	});

	it('a keyword-"alert" boilerplate item is an ordinary row: the row has no alert field (Decision 10)', () => {
		const [candidate] = reportingCandidates(
			view([
				story({
					title:
						'To report a parking violation (red zone, fire lane, blocked driveway), call the police',
					category: 'civic',
					categories: ['civic'],
					town: SR
				})
			])
		);
		const row = toReportingRow(
			{ item: candidate, publishedAt: candidate.timestamp, scope: 'town', alsoReportedBy: [] },
			NOW
		);
		expect(Object.keys(row).sort()).toEqual(
			['age', 'id', 'link', 'publishedAt', 'retained', 'scope', 'source', 'title'].sort()
		);
		expect(row.scope).toBe('San Rafael');
	});

	it('shownIds are exactly the rows in the coverage (a later section excludes them)', () => {
		const out = run(view([1, 2, 3, 4, 5, 6].map((h) => story({ hoursAgo: h }))));
		expect([...out.shownIds]).toEqual(rowsOf(out).map((r) => r.id));
	});
});

describe('coverage: the snapshot read gates, the reporting feeds decide (Codex r3 #2, #3)', () => {
	it('before the first snapshot: loading coverage, no rows, never "No news"', () => {
		const out = latestReportingView({
			view: null,
			sources: [fromSnapshotRead(undefined, null)],
			town: null,
			now: NOW
		});
		expect(out.coverage.kind).toBe('loading');
		expect(out.presentation.state).toBe('loading');
		expect(out.empty).toBeNull();
	});

	it('a failed first read is unavailable coverage, never an empty list', () => {
		const out = latestReportingView({
			view: null,
			sources: [
				fromSnapshotRead(
					{ ok: false, error: 'news-snapshot: unknown (read-failed)', at: NOW },
					null
				)
			],
			town: null,
			now: NOW
		});
		expect(out.coverage).toEqual({
			kind: 'unavailable',
			source: 'News snapshot',
			reason: 'news-snapshot: unknown (read-failed)'
		});
		expect(out.presentation.state).toBe('unavailable');
		expect(out.shownIds.size).toBe(0);
	});

	it('all reporting feeds failed in a fresh snapshot: unavailable, never "Nothing new" (Codex r3 #3)', () => {
		const v = view(
			[],
			[
				{
					status: 'failed',
					lastSuccessAt: null,
					lastError: 'http-status: HTTP 403',
					itemCount: 0,
					consecutiveFailures: 9
				}
			]
		);
		const out = run(v);
		expect(out.coverage).toMatchObject({
			kind: 'unavailable',
			reason: 'every reporting feed failed'
		});
		expect(out.empty).toBeNull();
		expect(out.presentation.state).toBe('unavailable');
		expect(describePresentation(out.presentation, NOW)).not.toMatch(/Nothing new/);
	});

	it('an empty view kept after a failed refresh is retained-empty: no "nothing" wording (Codex r3 #3)', () => {
		const v = view([]);
		const out = run(v, null, [
			fromSnapshotRead({ ok: false, error: 'timed out', at: NOW }, v),
			...v.sources.map(fromSnapshotSource)
		]);
		expect(out.coverage).toMatchObject({ kind: 'value', value: [], retainedAfter: 'timed out' });
		expect(out.empty).toBeNull();
		expect(out.presentation.state).toBe('stale');
		expect(describePresentation(out.presentation, NOW)).not.toMatch(/Nothing new/);
	});

	it('a view whose scrape is older than 45 min is retained "out of date", even though the read succeeded', () => {
		const v = { ...view([]), lastSuccessfulScrapeAt: new Date(NOW - 2 * H).toISOString() };
		expect(run(v).coverage).toMatchObject({ kind: 'value', retainedAfter: 'out of date' });
		expect(run(v).empty).toBeNull();
	});

	it('only a fresh read with every reporting feed fresh and nothing eligible says so', () => {
		const out = run(view([story({ hoursAgo: null })]));
		expect(out.coverage).toMatchObject({ kind: 'value', value: [], retainedAfter: null });
		expect(out.empty).toBe('No dated reporting right now');
		expect(out.presentation.state).toBe('empty');
	});

	it('rows on screen never read "loading", even while another reporting feed is still loading', () => {
		const v = view([story({ hoursAgo: 1 })]);
		const loadingFeed = {
			id: 'news:pacific-sun',
			name: 'Pacific Sun',
			state: 'loading' as const,
			observedAt: null,
			maxAgeMs: null,
			detail: null
		};
		const out = run(v, null, [...entries(v), loadingFeed]);
		expect(rowsOf(out)).toHaveLength(1);
		expect(out.presentation.state).not.toBe('loading');
	});

	it('a town with only unlocated items reads no-match, not empty', () => {
		expect(run(view([story({ hoursAgo: 1 })]), 'mill-valley').presentation.state).toBe('no-match');
	});

	it('a retained reporting feed makes it partial and is named; a retained events feed does not count', () => {
		const v = view(
			[story({ hoursAgo: 4 })],
			[
				{},
				RETAINED_PACIFIC_SUN,
				{ ...RETAINED_PACIFIC_SUN, id: 'bay-area-shows', name: 'Bay Area Shows', category: 'shows' }
			]
		);
		const out = run(v);
		expect(out.presentation.state).toBe('partial');
		expect(out.presentation.failing.map((e) => e.name)).toEqual(['Pacific Sun']);
	});
});
