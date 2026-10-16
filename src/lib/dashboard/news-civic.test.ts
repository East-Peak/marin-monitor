import { beforeEach, describe, expect, it } from 'vitest';
import type { NewsItem } from '$lib/types';
import type { NpsAlert } from '$lib/api/marin/nps';
import { fromLoaderPart, fromSnapshotSource } from './source-adapters';
import { latestReportingView } from './latest-reporting';
import { CIVIC_DATASETS, WIRE_MAX, newsCivicView } from './news-civic';
import { resetStories, snapshotEntries, snapshotView, story } from './__fixtures__/snapshot-view';

const NOW = Date.parse('2026-10-15T18:00:00Z'); // 11:00 AM PDT
const H = 3_600_000;
const D = 24 * H;

function issue(type: string, at: number, i: number): NewsItem {
	return {
		id: `seeclickfix-${i}`,
		title: `${type} · ${i} Main St`,
		link: `https://seeclickfix.com/issues/${i}`,
		timestamp: at,
		source: 'Fix It Marin',
		category: '311',
		verification: 'official'
	};
}
const ok311 = fromLoaderPart('seeclickfix', { ok: true, at: NOW, observedAt: NOW - H }, true);
const police: NewsItem[] = [
	{
		id: 'nixle-1',
		title: 'ROAD CLOSURE: Grant Ave',
		link: 'https://nixle.us/1',
		timestamp: NOW - 2 * H,
		source: 'Novato PD',
		category: 'safety',
		verification: 'official'
	}
];
const nps: NpsAlert[] = [
	{
		id: 'a1',
		title: 'Trail closed',
		description: '',
		parkCode: 'muwo',
		category: 'Park Closure',
		url: 'https://nps.gov/muwo',
		lastIndexedDate: '2026-10-14 10:00:00.0'
	}
];
const live = { kind: 'live' as const, observedAt: null };
const outcomes = { [CIVIC_DATASETS.police.id]: live, [CIVIC_DATASETS.nps.id]: live };

function input(over: Partial<Parameters<typeof newsCivicView>[0]> = {}) {
	const v = snapshotView(
		NOW,
		Array.from({ length: 20 }, (_, i) => story(NOW, { hoursAgo: i + 1 })),
		[{}, { id: 'kqed-news', name: 'KQED News', status: 'failed', lastError: 'HTTP 500' }]
	);
	const sources = [...snapshotEntries(v, NOW), ok311];
	const latest = latestReportingView({ view: v, sources, town: null, now: NOW });
	return {
		view: v,
		sources,
		shownIds: latest.shownIds,
		fixIt: [issue('Illegal Dumping', NOW - H, 1)],
		police,
		nps,
		outcomes,
		now: NOW,
		...over
	};
}

beforeEach(resetStories);

describe('News & Civic (Goal 4)', () => {
	it('wire list excludes the five Latest-reporting ids', () => {
		const inp = input();
		expect(inp.shownIds.size).toBe(5);
		const out = newsCivicView(inp);
		expect(out.wire.kind).toBe('value');
		const rows = out.wire.kind === 'value' ? out.wire.value : [];
		expect(rows).toHaveLength(WIRE_MAX);
		for (const r of rows) expect(inp.shownIds.has(r.id)).toBe(false);
		expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
		// Items 6–17: the wire picks up where Latest reporting stops, newest first.
		expect(rows[0].title).toBe('Distinct headline 6');
		expect(rows.at(-1)!.title).toBe('Distinct headline 17');
	});

	it('the wire never carries satire', () => {
		const inp = input();
		const v = {
			...inp.view!,
			items: [
				story(NOW, {
					sourceId: 'marin-lately',
					source: 'Marin Lately',
					category: 'satire',
					categories: ['satire'],
					verification: 'satire',
					hoursAgo: 0.5
				}),
				...inp.view!.items
			]
		};
		const out = newsCivicView({ ...inp, view: v });
		const rows = out.wire.kind === 'value' ? out.wire.value : [];
		expect(rows.some((r) => r.source === 'Marin Lately')).toBe(false);
	});

	it('the header counts the snapshot feeds that are OK', () => {
		expect(newsCivicView(input()).feeds).toEqual({ ok: 1, total: 2 });
		expect(newsCivicView(input({ view: null, sources: [] })).feeds).toBeNull();
	});

	it('311 by-day counts sum to issue count; failed 311 read → unavailable, not 0', () => {
		const issues = [
			issue('Illegal Dumping', NOW - H, 1),
			issue('Illegal Dumping', NOW - 2 * H, 2),
			issue('Trees', NOW - 1 * D, 3),
			issue('Illegal Dumping', NOW - 3 * D, 4),
			issue('Sidewalks', NOW - 3 * D - H, 5)
		];
		const out = newsCivicView(input({ fixIt: issues }));
		expect(out.fixIt.kind).toBe('value');
		if (out.fixIt.kind !== 'value') return;
		const s = out.fixIt.value;
		expect(s.count).toBe(5);
		expect(s.days.reduce((a, d) => a + d.count, 0)).toBe(5);
		// Oldest to newest Pacific day, the gap day included as 0.
		expect(s.days.map((d) => d.count)).toEqual([2, 0, 1, 2]);
		expect(s.types[0]).toEqual({ type: 'Illegal Dumping', count: 3 });
		expect(s.types.length).toBeLessThanOrEqual(6);

		const failed = fromLoaderPart('seeclickfix', { ok: false, error: 'HTTP 503', at: NOW }, false);
		const inp = input({ fixIt: null });
		const down = newsCivicView({
			...inp,
			sources: [...inp.sources.filter((e) => e.id !== 'part:seeclickfix'), failed]
		});
		expect(down.fixIt.kind).toBe('unavailable');
	});

	it('top six issue types, most reported first', () => {
		const issues = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].flatMap((t, k) =>
			Array.from({ length: 7 - k }, (_, j) => issue(t, NOW - j * H, k * 10 + j))
		);
		const out = newsCivicView(input({ fixIt: issues }));
		if (out.fixIt.kind !== 'value') throw new Error('expected a value');
		expect(out.fixIt.value.types.map((t) => t.type)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
	});

	it('police and parks keep their own reads: a failed police read is unavailable, never "none"', () => {
		const out = newsCivicView(input());
		expect(out.police.kind).toBe('value');
		expect(out.parks.kind).toBe('value');
		if (out.parks.kind === 'value')
			expect(out.parks.value[0].meta).toBe('NPS · Muir Woods · Park Closure');
		const down = newsCivicView(
			input({
				police: null,
				outcomes: {
					...outcomes,
					[CIVIC_DATASETS.police.id]: {
						kind: 'failed',
						error: 'HTTP 503',
						retained: false,
						observedAt: null
					}
				}
			})
		);
		expect(down.police.kind).toBe('unavailable');
	});

	it('"nothing beyond the five" only for fresh, complete coverage (Codex desk4 #5)', () => {
		const five = snapshotView(
			NOW,
			Array.from({ length: 5 }, (_, i) => story(NOW, { hoursAgo: i + 1 })),
			[{}]
		);
		const sources = [...snapshotEntries(five, NOW), ok311];
		const shownIds = latestReportingView({ view: five, sources, town: null, now: NOW }).shownIds;
		expect(newsCivicView(input({ view: five, sources, shownIds })).wireEmpty).toBe(
			'Nothing beyond the five above'
		);
		const partial = snapshotView(NOW, five.items, [
			{},
			{ id: 'kqed-news', name: 'KQED News', status: 'failed', lastError: 'HTTP 500' }
		]);
		const pSources = [...snapshotEntries(partial, NOW), ok311];
		const out = newsCivicView(
			input({
				view: partial,
				sources: pSources,
				shownIds: latestReportingView({ view: partial, sources: pSources, town: null, now: NOW })
					.shownIds
			})
		);
		expect(out.wireEmpty).toBeNull();
	});

	it("311 days stop at the payload's own day: a stale read never invents empty days (Codex desk4 #6)", () => {
		const stale311 = fromLoaderPart(
			'seeclickfix',
			{ ok: false, error: 'HTTP 503', at: NOW },
			true,
			NOW - 3 * D
		);
		const inp = input({ fixIt: [issue('Trees', NOW - 4 * D, 1), issue('Trees', NOW - 3 * D, 2)] });
		const out = newsCivicView({
			...inp,
			sources: [...inp.sources.filter((e) => e.id !== 'part:seeclickfix'), stale311]
		});
		if (out.fixIt.kind !== 'value') throw new Error('expected the retained value');
		expect(out.fixIt.value.days.map((d) => d.count)).toEqual([1, 1]);
	});

	it('an unread snapshot leaves the wire loading, not empty', () => {
		const out = newsCivicView(input({ view: null, sources: [ok311] }));
		expect(out.wire.kind).toBe('loading');
	});

	it('the source entries feed the section status', () => {
		const out = newsCivicView(input());
		expect(out.status.failing.map((e) => e.id)).toContain(
			fromSnapshotSource({
				id: 'kqed-news',
				name: 'KQED News',
				category: 'local',
				verification: 'local_media',
				status: 'failed',
				lastAttemptAt: new Date(NOW).toISOString(),
				lastSuccessAt: null,
				lastError: 'HTTP 500',
				consecutiveFailures: 1,
				itemCount: 0
			}).id
		);
	});
});
