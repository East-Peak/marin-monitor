import { beforeEach, describe, expect, it } from 'vitest';
import type { NewsItem } from '$lib/types';
import { COUNTY_WIDE_RULE } from '$lib/config/county-scope';
import { classifyReportingScope, isEligibleReporting, selectLatestReporting } from './reporting';

const NOW = Date.parse('2026-09-28T20:00:00Z');
const H = 3_600_000;
let seq = 0;

function report(overrides: Partial<NewsItem> & { hoursAgo?: number } = {}): NewsItem {
	const { hoursAgo = 1, ...rest } = overrides;
	seq += 1;
	return {
		id: `news.example:r${seq}`,
		title: `Distinct headline number ${seq}`,
		link: `https://news.example/2026/09/story-${seq}`,
		timestamp: NOW - hoursAgo * H,
		publishedAtStatus: 'valid',
		publishedAtSource: 'rss:pubDate',
		source: 'Marin Independent Journal',
		category: 'local',
		verification: 'local_media',
		...rest
	};
}
const ids = (entries: { item: NewsItem }[]) => entries.map((e) => e.item.id);

beforeEach(() => {
	seq = 0;
});

describe('eligibility', () => {
	it('requires an asserted, known publication time (undated and non-RSS items stay out)', () => {
		expect(isEligibleReporting(report(), NOW)).toBe(true);
		expect(
			isEligibleReporting(report({ publishedAtStatus: 'missing', timestamp: Number.NaN }), NOW)
		).toBe(false);
		expect(
			isEligibleReporting(report({ publishedAtStatus: 'future', timestamp: Number.NaN }), NOW)
		).toBe(false);
		expect(isEligibleReporting(report({ publishedAtStatus: undefined, timestamp: NOW }), NOW)).toBe(
			false
		);
	});
	it('rejects more than 5 minutes ahead, tolerates small skew', () => {
		expect(isEligibleReporting(report({ timestamp: NOW + 6 * 60_000 }), NOW)).toBe(false);
		expect(isEligibleReporting(report({ timestamp: NOW + 4 * 60_000 }), NOW)).toBe(true);
	});
	it('excludes satire, events/listings and 311', () => {
		expect(isEligibleReporting(report({ category: 'satire' }), NOW)).toBe(false);
		expect(isEligibleReporting(report({ verification: 'satire' }), NOW)).toBe(false);
		for (const category of ['shows', 'cycling', 'endurance', 'prep', 'farm', '311'] as const) {
			expect(isEligibleReporting(report({ category }), NOW)).toBe(false);
		}
	});
});

describe('scope', () => {
	it('town when tagged; county only when explicitly county-scoped; otherwise unlocated', () => {
		expect(classifyReportingScope({ townSlug: 'novato' })).toBe('town');
		expect(classifyReportingScope({ geoScope: 'county' })).toBe('county');
		expect(classifyReportingScope({ townSlug: 'novato', geoScope: 'county' })).toBe('town');
		expect(classifyReportingScope({})).toBe('unlocated');
	});
});

describe('COUNTY_WIDE_RULE allocation', () => {
	it('case 1, All of Marin: the 5 newest dated eligible items from any source and scope', () => {
		const items = [
			report({ hoursAgo: 1, townSlug: 'novato' }),
			report({ hoursAgo: 2, geoScope: 'county', source: 'NBC Bay Area – Marin' }),
			report({ hoursAgo: 3 }),
			report({ hoursAgo: 4, townSlug: 'fairfax' }),
			report({ hoursAgo: 5 }),
			report({ hoursAgo: 6 }),
			report({ hoursAgo: 0.5, publishedAtStatus: 'missing', timestamp: Number.NaN })
		];
		const out = selectLatestReporting(items, { town: null, now: NOW });
		expect(ids(out)).toEqual([
			'news.example:r1',
			'news.example:r2',
			'news.example:r3',
			'news.example:r4',
			'news.example:r5'
		]);
		expect(out.map((e) => e.scope)).toEqual(['town', 'county', 'unlocated', 'town', 'unlocated']);
	});

	it('case 2, a town with plenty: 3 town + 2 county-wide; other towns and unlocated never appear', () => {
		const items = [
			...[1, 2, 3, 4, 5].map((h) => report({ hoursAgo: h + 0.5, townSlug: 'mill-valley' })),
			...[1, 2, 3, 4].map((h) => report({ hoursAgo: h, geoScope: 'county' })),
			report({ hoursAgo: 0.1 }),
			report({ hoursAgo: 0.3, townSlug: 'novato' })
		];
		const out = selectLatestReporting(items, { town: 'mill-valley', now: NOW });
		expect(out).toHaveLength(5);
		expect(out.filter((e) => e.scope === 'town')).toHaveLength(3);
		expect(out.filter((e) => e.scope === 'county')).toHaveLength(2);
		expect(out.every((e) => e.scope !== 'unlocated' && e.item.townSlug !== 'novato')).toBe(true);
		const times = out.map((e) => e.publishedAt);
		expect([...times].sort((a, b) => b - a)).toEqual(times);
	});

	it('case 3, a town with fewer than 3: county items backfill to 5, never unlocated', () => {
		const items = [
			report({ hoursAgo: 1, townSlug: 'mill-valley' }),
			...[1, 2, 3, 4, 5].map((h) => report({ hoursAgo: h, geoScope: 'county' })),
			...[0.1, 0.2, 0.3].map((h) => report({ hoursAgo: h }))
		];
		const out = selectLatestReporting(items, { town: 'mill-valley', now: NOW });
		expect(out.map((e) => e.scope).sort()).toEqual([
			'county',
			'county',
			'county',
			'county',
			'town'
		]);
	});

	it('case 3, with too few county items as well: the list stays short rather than padding with unlocated', () => {
		const items = [
			report({ hoursAgo: 1, townSlug: 'mill-valley' }),
			report({ hoursAgo: 2, geoScope: 'county' }),
			...[0.1, 0.2, 0.3].map((h) => report({ hoursAgo: h }))
		];
		expect(selectLatestReporting(items, { town: 'mill-valley', now: NOW })).toHaveLength(2);
	});

	it('the rule is the only switch: with backfill off (one-line change) the town view is 1 + 2', () => {
		const items = [
			report({ hoursAgo: 1, townSlug: 'mill-valley' }),
			...[1, 2, 3, 4, 5].map((h) => report({ hoursAgo: h, geoScope: 'county' }))
		];
		const rule = { ...COUNTY_WIDE_RULE, countyBackfillsTown: false };
		expect(selectLatestReporting(items, { town: 'mill-valley', now: NOW, rule })).toHaveLength(3);
	});

	it('the constant is authoritative: a 2 + 1 rule yields 2 + 1 (total 3 everywhere)', () => {
		const rule = { ...COUNTY_WIDE_RULE, townSlots: 2, countySlots: 1 };
		const plenty = [
			...[1, 2, 3].map((h) => report({ hoursAgo: h, townSlug: 'mill-valley' })),
			...[1, 2, 3].map((h) => report({ hoursAgo: h + 0.5, geoScope: 'county' })),
			...[0.1, 0.2].map((h) => report({ hoursAgo: h }))
		];
		const town = selectLatestReporting(plenty, { town: 'mill-valley', now: NOW, rule });
		expect(town.filter((e) => e.scope === 'town')).toHaveLength(2);
		expect(town.filter((e) => e.scope === 'county')).toHaveLength(1);
		expect(selectLatestReporting(plenty, { town: null, now: NOW, rule })).toHaveLength(3);
		const short = [
			report({ hoursAgo: 1, townSlug: 'mill-valley' }),
			...[1, 2, 3].map((h) => report({ hoursAgo: h, geoScope: 'county' }))
		];
		expect(
			selectLatestReporting(short, { town: 'mill-valley', now: NOW, rule })
				.map((e) => e.scope)
				.sort()
		).toEqual(['county', 'county', 'town']);
	});
});

describe('dedupe via the shared rules', () => {
	it('collapses a syndicated article (same canonical URL) to the higher-priority copy', () => {
		const items = [
			report({
				id: 'marinij.com:1',
				link: 'https://www.marinij.com/2026/09/28/fire-near-fairfax/?utm_source=rss',
				title: 'Fire near Fairfax spreads',
				source: 'Marin IJ',
				hoursAgo: 1
			}),
			report({
				id: 'county.gov:9',
				link: 'http://marinij.com/2026/09/28/fire-near-fairfax',
				title: 'A different headline entirely',
				source: 'County Fire',
				verification: 'official',
				hoursAgo: 2
			})
		];
		const out = selectLatestReporting(items, { town: null, now: NOW });
		expect(ids(out)).toEqual(['county.gov:9']);
		expect(out[0].alsoReportedBy).toHaveLength(1);
	});
	it('keeps a recurring title 30 days apart, and distinct notices sharing one landing URL', () => {
		const recurring = [
			report({ title: 'City Council Regular Meeting Recap', hoursAgo: 2 }),
			report({ title: 'City Council Regular Meeting Recap', hoursAgo: 30 * 24 })
		];
		expect(selectLatestReporting(recurring, { town: null, now: NOW })).toHaveLength(2);
		const landing = 'https://www.townoffairfax.org/news';
		const notices = [
			report({ link: landing, title: 'Pool hours change this week', source: 'Town of Fairfax' }),
			report({
				link: landing,
				title: 'Leaf blower hearing is set',
				source: 'Town of Fairfax',
				hoursAgo: 2
			})
		];
		expect(selectLatestReporting(notices, { town: null, now: NOW })).toHaveLength(2);
	});
	it('merges the same story by title within 24h, including accents inside words; never short titles', () => {
		const accented = [
			report({ title: 'Réouverture du marché de Novato', hoursAgo: 1 }),
			report({ title: 'Reouverture du marche de Novato!', source: 'Pacific Sun', hoursAgo: 3 })
		];
		expect(selectLatestReporting(accented, { town: null, now: NOW })).toHaveLength(1);
		const generic = [report({ title: 'Agenda' }), report({ title: 'Agenda', hoursAgo: 2 })];
		expect(selectLatestReporting(generic, { town: null, now: NOW })).toHaveLength(2);
	});
	it('keeps GUID 42 from two feeds apart, and joins one post carried by two Marin IJ tag feeds by its URL', () => {
		const apart = [
			report({ id: 'marin-ij-marin-county:42', source: 'Marin IJ – Marin County' }),
			report({ id: 'nbc-bay-area-marin:42', source: 'NBC Bay Area – Marin', hoursAgo: 2 })
		];
		expect(ids(selectLatestReporting(apart, { town: null, now: NOW }))).toEqual([
			'marin-ij-marin-county:42',
			'nbc-bay-area-marin:42'
		]);
		const post = {
			title: 'Supervisors approve Marin budget',
			link: 'https://www.marinij.com/2026/09/28/budget/'
		};
		const copies = [
			report({ ...post, id: 'marin-ij-politics:777', source: 'Marin IJ – Politics' }),
			report({ ...post, id: 'marin-ij-marin-county:777', source: 'Marin IJ – Marin County' })
		];
		expect(selectLatestReporting(copies, { town: null, now: NOW })).toHaveLength(1);
	});
	it('does not mutate its input', () => {
		const items = [report(), report({ hoursAgo: 2 })];
		const copy = structuredClone(items);
		selectLatestReporting(items, { town: null, now: NOW });
		expect(items).toEqual(copy);
	});
});

describe('COUNTY_WIDE_RULE allocation takes the newest of each quota (Codex PR4 #3)', () => {
	it('town 3 + county 2 are the newest of each, whatever the input order', () => {
		const town = [5, 1, 4, 2, 3].map((h) => report({ hoursAgo: h + 0.5, townSlug: 'mill-valley' }));
		const county = [4, 1, 3, 2].map((h) => report({ hoursAgo: h, geoScope: 'county' }));
		const items = [
			county[2],
			town[0],
			county[0],
			town[3],
			town[1],
			county[3],
			town[4],
			town[2],
			county[1]
		];
		const out = selectLatestReporting(items, { town: 'mill-valley', now: NOW });
		// newest first: county 1h, town 1.5h, county 2h, town 2.5h, town 3.5h
		expect(ids(out)).toEqual([county[1], town[1], county[3], town[3], town[4]].map((i) => i.id));
	});

	it('county backfill takes the newest county items', () => {
		const town = report({ hoursAgo: 1.5, townSlug: 'mill-valley' });
		const county = [6, 2, 5, 1, 3, 4].map((h) => report({ hoursAgo: h, geoScope: 'county' }));
		const out = selectLatestReporting([...county, town], { town: 'mill-valley', now: NOW });
		// newest first: county 1h, town 1.5h, county 2h, 3h, 4h
		expect(ids(out)).toEqual([county[3], town, county[1], county[4], county[5]].map((i) => i.id));
	});
});
