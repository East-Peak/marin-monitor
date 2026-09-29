import { describe, expect, it } from 'vitest';
import { dedupeItems, type DedupeInput } from './dedupe';

const PRIORITY = ['marin-ij', 'marin-ij-crime', 'nbc', 'fairfax', 'san-rafael'];
const priorityOf = (id: string) => PRIORITY.indexOf(id);

function item(p: Partial<DedupeInput> & { id: string }): DedupeInput {
	const sourceId = p.sourceId ?? 'marin-ij';
	return {
		category: 'local',
		canonicalUrl: null,
		title: `Title for ${p.id} long enough`,
		publishedAt: '2026-09-28T12:00:00.000Z',
		...p,
		sourceId,
		id: `${sourceId}:${p.id}`
	};
}

describe('dedupeItems — identity', () => {
	it('merges the same article URL across sources, keeping the higher-priority dated copy', () => {
		const out = dedupeItems(
			[
				item({
					id: 'b',
					sourceId: 'marin-ij-crime',
					category: 'safety',
					canonicalUrl: 'https://marinij.com/2026/09/28/fire'
				}),
				item({ id: 'a', sourceId: 'marin-ij', canonicalUrl: 'https://marinij.com/2026/09/28/fire' })
			],
			priorityOf
		);
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe('marin-ij:a');
		expect(out[0].categories).toEqual(['local', 'safety']);
		expect(out[0].alsoReportedBy).toEqual(['marin-ij-crime']);
	});

	it('never merges unrelated stories from different sources that share a GUID', () => {
		const out = dedupeItems(
			[
				item({ id: '42', sourceId: 'fairfax', title: 'Fairfax pool hours change' }),
				item({ id: '42', sourceId: 'san-rafael', title: 'San Rafael repaves Fourth Street' })
			],
			priorityOf
		);
		expect(out.map((i) => i.id).sort()).toEqual(['fairfax:42', 'san-rafael:42']);
	});

	it('merges an exact duplicate entry within one source', () => {
		expect(dedupeItems([item({ id: 'same' }), item({ id: 'same' })], priorityOf)).toHaveLength(1);
	});

	it('keeps distinct same-source stories that reuse one GUID, with unique ids', () => {
		const out = dedupeItems(
			[
				item({ id: 'g', title: 'Council agenda posted for Oct 6' }),
				item({ id: 'g', title: 'Leaf blower ordinance hearing set' })
			],
			priorityOf
		);
		expect(out).toHaveLength(2);
		expect(new Set(out.map((i) => i.id)).size).toBe(2);
	});

	it.each([
		['a site home page', 'https://town.gov/'],
		['a news landing page', 'https://cityofsanrafael.org/news'],
		['a tag listing page', 'https://marinij.com/tag/crime'],
		['a Granicus publisher page', 'https://marin.granicus.com/ViewPublisher.php?view_id=33']
	])('does not merge different stories from different sources that both link %s', (_l, url) => {
		const out = dedupeItems(
			[
				item({
					id: '1',
					sourceId: 'fairfax',
					canonicalUrl: url,
					title: 'Fairfax pool hours change'
				}),
				item({
					id: '2',
					sourceId: 'san-rafael',
					canonicalUrl: url,
					title: 'San Rafael repaves Fourth Street'
				})
			],
			priorityOf
		);
		expect(out).toHaveLength(2);
	});

	it('treats a URL one source reuses for different titles as generic, even across sources', () => {
		const shared = 'https://town.gov/announcements/latest';
		const out = dedupeItems(
			[
				item({
					id: '1',
					sourceId: 'fairfax',
					canonicalUrl: shared,
					title: 'Pool hours change this week'
				}),
				item({
					id: '2',
					sourceId: 'fairfax',
					canonicalUrl: shared,
					title: 'Leaf blower hearing is set'
				}),
				item({
					id: '3',
					sourceId: 'san-rafael',
					canonicalUrl: shared,
					title: 'Fourth Street repaving begins'
				})
			],
			priorityOf
		);
		expect(out).toHaveLength(3);
	});
});

describe('dedupeItems — representative', () => {
	it('prefers a dated copy over a higher-priority undated one, keeping provenance', () => {
		const url = 'https://marinij.com/2026/09/28/fire';
		const out = dedupeItems(
			[
				item({ id: 'undated', sourceId: 'marin-ij', canonicalUrl: url, publishedAt: null }),
				item({
					id: 'dated',
					sourceId: 'nbc',
					canonicalUrl: url,
					publishedAt: '2026-09-28T09:00:00.000Z'
				})
			],
			priorityOf
		);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			id: 'nbc:dated',
			sourceId: 'nbc',
			publishedAt: '2026-09-28T09:00:00.000Z'
		});
		expect(out[0].alsoReportedBy).toEqual(['marin-ij']);
	});
});

describe('dedupeItems — titles', () => {
	it('merges the same normalized title published within 24h', () => {
		const out = dedupeItems(
			[
				item({ id: 'a', title: 'Fire near Lucas Valley Road!', sourceId: 'marin-ij' }),
				item({
					id: 'b',
					title: 'FIRE near Lucas Valley road',
					sourceId: 'nbc',
					publishedAt: '2026-09-28T20:00:00.000Z'
				})
			],
			priorityOf
		);
		expect(out.map((i) => i.id)).toEqual(['marin-ij:a']);
		expect(out[0].alsoReportedBy).toEqual(['nbc']);
	});

	it('does not merge a recurring title more than 24h apart', () => {
		const out = dedupeItems(
			[
				item({
					id: 'a',
					title: 'Board of Supervisors Regular Meeting',
					publishedAt: '2026-09-21T12:00:00.000Z'
				}),
				item({
					id: 'b',
					title: 'Board of Supervisors Regular Meeting',
					publishedAt: '2026-09-28T12:00:00.000Z'
				})
			],
			priorityOf
		);
		expect(out).toHaveLength(2);
	});

	it('never merges by title when either date is unknown, or the title is generic', () => {
		expect(
			dedupeItems(
				[
					item({ id: 'a', title: 'Same long headline here', publishedAt: null }),
					item({ id: 'b', title: 'Same long headline here' })
				],
				priorityOf
			)
		).toHaveLength(2);
		expect(
			dedupeItems(
				[item({ id: 'a', title: 'Agenda' }), item({ id: 'b', title: 'Agenda' })],
				priorityOf
			)
		).toHaveLength(2);
	});
});

describe('dedupeItems — ordering and merge fields', () => {
	it('orders dated items newest first, unknown dates last, ties by priority then id', () => {
		const out = dedupeItems(
			[
				item({ id: 'undated', publishedAt: null }),
				item({ id: 'old', publishedAt: '2026-09-27T12:00:00.000Z' }),
				item({ id: 'new', publishedAt: '2026-09-28T12:00:00.000Z' }),
				item({ id: 'tie', sourceId: 'nbc', publishedAt: '2026-09-28T12:00:00.000Z' })
			],
			priorityOf
		);
		expect(out.map((i) => i.id)).toEqual([
			'marin-ij:new',
			'nbc:tie',
			'marin-ij:old',
			'marin-ij:undated'
		]);
	});

	it('recomputes merge fields instead of inheriting stale ones', () => {
		const stale = {
			...item({ id: 'a' }),
			categories: ['satire' as const],
			alsoReportedBy: ['gone']
		};
		const [out] = dedupeItems([stale], priorityOf);
		expect(out.categories).toEqual(['local']);
		expect(out.alsoReportedBy).toEqual([]);
	});
});
