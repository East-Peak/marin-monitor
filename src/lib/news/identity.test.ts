import { describe, expect, it } from 'vitest';
import {
	compareRepresentative,
	disambiguateReusedIds,
	isGenericUrl,
	sameStoryByTitle,
	collapseStoryCopies,
	sourceScopedId,
	titleKey
} from './identity';

describe('titleKey', () => {
	it('removes combining marks before normalizing punctuation', () => {
		expect(titleKey('Réouverture du café')).toBe('reouverture du cafe');
		expect(titleKey('Café — “Tam” Fire!')).toBe('cafe tam fire');
		expect(titleKey('Ñandú crossing')).toBe('nandu crossing');
	});
});

describe('sourceScopedId', () => {
	it('keeps equal GUIDs from different feeds distinct', () => {
		expect(sourceScopedId('fairfax', '42')).not.toBe(sourceScopedId('san-rafael', '42'));
	});
});

describe('collapseStoryCopies', () => {
	const story = (id: string, source: string, title: string, link: string) => ({
		id,
		source,
		title,
		link
	});

	it('keeps two feeds on the SAME host apart when each uses GUID 42 for a different story', () => {
		const out = collapseStoryCopies([
			story(
				'marin-ij-crime:42',
				'Marin IJ – Crime',
				'Novato burglary arrest',
				'https://www.marinij.com/2026/09/28/burglary/'
			),
			story(
				'marin-ij-housing:42',
				'Marin IJ – Housing',
				'Corte Madera rezoning vote',
				'https://www.marinij.com/2026/09/28/rezoning/'
			)
		]);
		expect(out.map((s) => s.id)).toEqual(['marin-ij-crime:42', 'marin-ij-housing:42']);
	});

	it('joins one Marin IJ post carried by two tag feeds, by its article URL', () => {
		const out = collapseStoryCopies([
			story(
				'marin-ij-housing:p101',
				'Marin IJ – Housing',
				'Mill Valley housing plan',
				'https://www.marinij.com/2026/09/28/plan/?utm_source=rss'
			),
			story(
				'marin-ij-crime:p101',
				'Marin IJ – Crime',
				'Mill Valley housing plan',
				'https://marinij.com/2026/09/28/plan'
			)
		]);
		expect(out.map((s) => s.id)).toEqual(['marin-ij-housing:p101']);
	});

	it('never joins by a landing page, or by a URL one source reuses for different titles', () => {
		const out = collapseStoryCopies([
			story('fairfax:1', 'Town of Fairfax', 'Pool hours change', 'https://townoffairfaxca.gov/'),
			story(
				'san-rafael:1',
				'City of San Rafael',
				'Fourth Street repaving',
				'https://townoffairfaxca.gov/'
			),
			story(
				'fairfax:2',
				'Town of Fairfax',
				'Leaf blower hearing',
				'https://townoffairfaxca.gov/news/latest'
			),
			story(
				'fairfax:3',
				'Town of Fairfax',
				'Pool hours change again',
				'https://townoffairfaxca.gov/news/latest'
			)
		]);
		expect(out).toHaveLength(4);
	});

	it('merges scope and provenance: a general copy first, then its county-feed copy → county-scoped', () => {
		const general = {
			...story(
				'marin-ij-news:p5',
				'Marin IJ',
				'Countywide burn ban issued',
				'https://www.marinij.com/2026/09/28/burn-ban/'
			),
			category: 'local' as const
		};
		const county = {
			...story(
				'marin-ij-marin-county:p5',
				'Marin IJ – Marin County',
				'Countywide burn ban issued',
				'https://www.marinij.com/2026/09/28/burn-ban/'
			),
			category: 'safety' as const,
			geoScope: 'county' as const
		};
		type Copy = ReturnType<typeof story> & { category: 'local' | 'safety'; geoScope?: 'county' };
		const copies: Copy[] = [general, county];
		const [merged, ...rest] = collapseStoryCopies(copies);
		expect(rest).toEqual([]);
		expect(merged).toMatchObject({
			id: 'marin-ij-news:p5',
			geoScope: 'county',
			categories: ['local', 'safety'],
			alsoReportedBy: ['Marin IJ – Marin County']
		});
		// A county selector over the combined list still finds the county report.
		expect(collapseStoryCopies(copies).filter((s) => s.geoScope === 'county')).toHaveLength(1);
	});

	it('keeps a town from any copy when the kept copy has none', () => {
		const [merged] = collapseStoryCopies([
			story('a:1', 'A', 'Fire crews train', 'https://x.com/2026/fire'),
			{
				...story('b:1', 'B', 'Fire crews train', 'https://x.com/2026/fire'),
				town: 'Novato',
				townSlug: 'novato'
			}
		]);
		expect(merged).toMatchObject({ townSlug: 'novato', town: 'Novato' });
	});

	it("represents a story by its dated copy even when an undated copy comes first, keeping every copy's scope", () => {
		const undated = {
			...story(
				'marin-ij-news:p9',
				'Marin IJ',
				'Novato levee repair begins',
				'https://www.marinij.com/2026/09/28/levee/'
			),
			category: 'local' as const,
			town: 'Novato',
			townSlug: 'novato',
			timestamp: Number.NaN,
			publishedAtStatus: 'missing' as const
		};
		const dated = {
			...story(
				'marin-ij-marin-county:p9',
				'Marin IJ – Marin County',
				'Novato levee repair begins',
				'https://www.marinij.com/2026/09/28/levee/'
			),
			category: 'safety' as const,
			geoScope: 'county' as const,
			timestamp: Date.parse('2026-09-28T17:00:00.000Z'),
			publishedAtStatus: 'valid' as const
		};
		type Copy = ReturnType<typeof story> & {
			category: 'local' | 'safety';
			town?: string;
			townSlug?: string;
			geoScope?: 'county';
			timestamp: number;
			publishedAtStatus: 'missing' | 'valid';
		};
		const copies: Copy[] = [undated, dated];
		expect(collapseStoryCopies(copies)).toEqual([
			{
				...dated,
				town: 'Novato',
				townSlug: 'novato',
				categories: ['safety', 'local'],
				alsoReportedBy: ['Marin IJ']
			}
		]);
	});

	it('keeps the first copy when no copy is dated', () => {
		const a = {
			...story('a:1', 'A', 'Fire crews train', 'https://x.com/2026/fire'),
			timestamp: Number.NaN
		};
		const b = {
			...story('b:1', 'B', 'Fire crews train', 'https://x.com/2026/fire'),
			timestamp: Number.NaN
		};
		expect(collapseStoryCopies([a, b]).map((s) => s.id)).toEqual(['a:1']);
	});

	it('drops an exact duplicate id', () => {
		const s = story('a:1', 'A', 'T', '');
		expect(collapseStoryCopies([s, { ...s }])).toHaveLength(1);
	});
});

describe('disambiguateReusedIds', () => {
	it('keeps two stories one feed filed under the same GUID apart, as the producer does', () => {
		const out = disambiguateReusedIds([
			{ id: 'ij:7', title: 'Sausalito ferry fares rise' },
			{ id: 'ij:7', title: 'San Anselmo creek cleanup' },
			{ id: 'ij:7', title: 'Sausalito ferry fares rise!' },
			{ id: 'ij:8', title: 'Other' }
		]);
		expect(out.map((i) => i.id)).toEqual(['ij:7', 'ij:7~2', 'ij:7', 'ij:8']);
	});
});

describe('sameStoryByTitle', () => {
	const at = (title: string, publishedAt: string | null) => ({ title, publishedAt });
	it('matches the same long title within 24h', () => {
		expect(
			sameStoryByTitle(
				at('Fire near Lucas Valley Road', '2026-09-28T00:00:00.000Z'),
				at('FIRE near Lucas Valley road!', '2026-09-28T23:00:00.000Z')
			)
		).toBe(true);
	});
	it.each([
		[
			'more than 24h apart',
			at('Board of Supervisors Meeting', '2026-09-21T00:00:00.000Z'),
			at('Board of Supervisors Meeting', '2026-09-28T00:00:00.000Z')
		],
		[
			'either undated',
			at('Same long headline here', null),
			at('Same long headline here', '2026-09-28T00:00:00.000Z')
		],
		[
			'a generic short title',
			at('Agenda', '2026-09-28T00:00:00.000Z'),
			at('Agenda', '2026-09-28T00:00:00.000Z')
		]
	])('does not match when %s', (_l, a, b) => {
		expect(sameStoryByTitle(a, b)).toBe(false);
	});
});

describe('isGenericUrl', () => {
	it.each([
		['https://town.gov/', true],
		['https://cityofsanrafael.org/news', true],
		['https://marinij.com/tag/crime', true],
		['https://marin.granicus.com/ViewPublisher.php?view_id=33', true],
		['https://marinij.com/2026/09/28/fire-ice', false],
		['https://marin.granicus.com/AgendaViewer.php?view_id=33&clip_id=1', false]
	])('%s → %s', (url, generic) => {
		expect(isGenericUrl(url)).toBe(generic);
	});
});

describe('compareRepresentative', () => {
	const rank = compareRepresentative<{ id: string; sourceId: string; publishedAt: string | null }>(
		(id) => ['a', 'b'].indexOf(id)
	);
	it('prefers a dated copy over a higher-priority undated one, then priority', () => {
		const copies = [
			{ id: 'a:1', sourceId: 'a', publishedAt: null },
			{ id: 'b:1', sourceId: 'b', publishedAt: '2026-09-28T00:00:00.000Z' },
			{ id: 'a:2', sourceId: 'a', publishedAt: '2026-09-28T00:00:00.000Z' }
		];
		expect(copies.sort(rank).map((c) => c.id)).toEqual(['a:2', 'b:1', 'a:1']);
	});
});
