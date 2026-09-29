import { describe, expect, it } from 'vitest';
import { parseFeedXml } from './feed-xml';
import { ATOM_FEED, NOW, RSS_DATE_CASES, RSS_WORDPRESS } from './feed-fixtures';
import { canonicalizeUrl, normalizeEntry, type FeedContext } from './normalize';
import { newsSourceId } from './source-id';

const CTX: FeedContext = {
	sourceId: 'marin-ij',
	source: 'Marin IJ',
	category: 'local',
	verification: 'local_media'
};

function normalizeAll(xml: string) {
	return parseFeedXml(xml).entries.map((e) => normalizeEntry(e, CTX, NOW));
}

describe('normalizeEntry — text', () => {
	const [first, second] = normalizeAll(RSS_WORDPRESS);

	it('turns CDATA HTML titles into plain text with entities decoded', () => {
		expect(first?.title).toBe('Fire & Ice: Mill Valley council weighs trail plan');
	});
	it('decodes escaped markup in descriptions (the long-standing double pass)', () => {
		expect(second?.summary).toBe('Escaped markup: ferry schedule & fares');
	});
	it('decodes undeclared HTML entities (&nbsp; &mdash; &#8217;) and splits paragraphs', () => {
		expect(first?.summary).toBe('The council’s plan — explained. Second paragraph.');
	});
	it('drops script content from content:encoded', () => {
		expect(first?.content).toBe('Full body text.');
	});
	it('truncates the summary to 300 characters', () => {
		const long = normalizeEntry(
			{ ...parseFeedXml(RSS_WORDPRESS).entries[0], description: 'x'.repeat(500) },
			CTX,
			NOW
		);
		expect(long?.summary).toHaveLength(300);
	});
	it.each([['<img src="x">'], ['&nbsp;'], ['  ']])(
		'skips an entry whose title is only markup or whitespace (%s)',
		(title) => {
			const entry = { ...parseFeedXml(RSS_WORDPRESS).entries[0], title };
			expect(normalizeEntry(entry, CTX, NOW)).toBeNull();
		}
	);
	it('skips an entry with no title', () => {
		const entry = { ...parseFeedXml(RSS_WORDPRESS).entries[0], title: null };
		expect(normalizeEntry(entry, CTX, NOW)).toBeNull();
	});
});

describe('normalizeEntry — identity and links', () => {
	const [first] = normalizeAll(RSS_WORDPRESS);

	it('uses guid, then link, then a stable hash as id', () => {
		expect(first?.id).toBe('https://www.marinij.com/?p=101');
		const noGuid = { ...parseFeedXml(RSS_WORDPRESS).entries[0], guid: null };
		expect(normalizeEntry(noGuid, CTX, NOW)?.id).toBe(noGuid.link);
		const neither = { ...noGuid, link: null };
		const id = normalizeEntry(neither, CTX, NOW)?.id;
		expect(id).toMatch(/^rss-[a-z0-9]+$/);
		expect(normalizeEntry(neither, CTX, NOW)?.id).toBe(id);
	});
	it('blanks non-http links so javascript: never reaches the UI', () => {
		const entry = { ...parseFeedXml(RSS_WORDPRESS).entries[0], link: 'javascript:alert(1)' };
		const item = normalizeEntry(entry, CTX, NOW);
		expect(item?.link).toBe('');
		expect(item?.canonicalUrl).toBeNull();
	});
	it('keeps the original link but canonicalizes the dedupe key', () => {
		expect(first?.link).toContain('utm_source=rss');
		expect(first?.canonicalUrl).toBe('https://marinij.com/2026/09/28/fire-ice');
	});
});

describe('normalizeEntry — publication time (no Date.now substitution)', () => {
	const byTitle = new Map(normalizeAll(RSS_DATE_CASES).map((i) => [i?.title, i]));
	const status = (t: string) => byTitle.get(t)?.publishedAtStatus;

	it('classifies every fixture date case', () => {
		expect(status('Valid pubDate')).toBe('valid');
		expect(status('Missing date')).toBe('missing');
		expect(status('Invalid date')).toBe('invalid');
		expect(status('Date only')).toBe('invalid');
		expect(status('Impossible calendar date')).toBe('invalid');
		expect(status('Future beyond skew')).toBe('future');
		expect(status('Future within skew')).toBe('valid');
		expect(status('dc:date only')).toBe('valid');
		expect(status('Epoch placeholder')).toBe('invalid');
	});
	it('never invents a publishedAt for rejected or missing dates', () => {
		for (const t of ['Missing date', 'Invalid date', 'Future beyond skew', 'Epoch placeholder']) {
			expect(byTitle.get(t)?.publishedAt).toBeNull();
		}
	});
	it('records provenance of the value it used', () => {
		expect(byTitle.get('dc:date only')?.publishedAtSource).toBe('rss:dc:date');
		expect(byTitle.get('Valid pubDate')?.publishedAtSource).toBe('rss:pubDate');
	});
	it('Atom updated-only entries have unknown publication time and a separate updatedAt', () => {
		const [updatedOnly, both] = normalizeAll(ATOM_FEED);
		expect(updatedOnly?.publishedAtStatus).toBe('missing');
		expect(updatedOnly?.publishedAt).toBeNull();
		expect(updatedOnly?.updatedAt).toBe('2026-09-28T18:00:00.000Z');
		expect(both?.publishedAt).toBe('2026-09-27T10:00:00.000Z');
		expect(both?.publishedAtSource).toBe('atom:published');
		expect(both?.updatedAt).toBe('2026-09-28T11:00:00.000Z');
	});
});

describe('normalizeEntry — declared source zone', () => {
	it('dates zone-less NBC items in the source zone and records the assumption', () => {
		const nbc: FeedContext = { ...CTX, assumedTimeZone: 'America/Los_Angeles' };
		const entry = {
			...parseFeedXml(RSS_WORDPRESS).entries[0],
			published: [{ source: 'rss:pubDate' as const, raw: 'Fri, Sep 25 2026 11:48:58 AM' }]
		};
		expect(normalizeEntry(entry, nbc, NOW)).toMatchObject({
			publishedAt: '2026-09-25T18:48:58.000Z',
			publishedAtStatus: 'valid',
			publishedAtAssumedZone: 'America/Los_Angeles'
		});
		expect(normalizeEntry(entry, CTX, NOW)?.publishedAtStatus).toBe('invalid');
	});
});

describe('normalizeEntry — event-start sources (Granicus agendas)', () => {
	const bos: FeedContext = { ...CTX, pubDateMeaning: 'event-start' };
	const meeting = (raw: string) => ({
		...parseFeedXml(RSS_WORDPRESS).entries[0],
		published: [{ source: 'rss:pubDate' as const, raw }]
	});

	it('keeps a meeting that has not started as eventAt, publication unknown', () => {
		// NOW = 2026-09-28T20:00Z; meeting 2026-10-06 09:00 -0800
		expect(normalizeEntry(meeting('Tue, 06 Oct 2026 09:00:00 -0800'), bos, NOW)).toMatchObject({
			eventAt: '2026-10-06T17:00:00.000Z',
			eventAtSource: 'rss:pubDate',
			publishedAt: null,
			publishedAtStatus: 'missing',
			publishedAtSource: null
		});
	});
	it('never promotes the meeting time to publication after the meeting starts', () => {
		expect(normalizeEntry(meeting('Tue, 15 Sep 2026 09:00:00 -0800'), bos, NOW)).toMatchObject({
			eventAt: '2026-09-15T17:00:00.000Z',
			publishedAt: null,
			publishedAtStatus: 'missing'
		});
	});
	it('ordinary sources have no eventAt', () => {
		expect(normalizeEntry(meeting('Mon, 28 Sep 2026 12:00:00 -0700'), CTX, NOW)).toMatchObject({
			eventAt: null,
			eventAtSource: null,
			publishedAtStatus: 'valid'
		});
	});
});

describe('normalizeEntry — location provenance', () => {
	const [first, second] = normalizeAll(RSS_WORDPRESS);

	it('tags the town named in the title as a title match', () => {
		expect(first?.town).toEqual({
			name: 'Mill Valley',
			slug: 'mill-valley',
			source: 'title-match'
		});
	});
	it('keeps feed-native coordinates with feed provenance', () => {
		expect(second?.point).toEqual({ lat: 37.859, lon: -122.4852, source: 'feed' });
		expect(first?.point).toBeNull();
	});
});

describe('canonicalizeUrl', () => {
	it.each([
		['https://www.Example.com/a/b/?utm_campaign=x&b=2&a=1#frag', 'https://example.com/a/b?a=1&b=2'],
		['http://example.com/a', 'https://example.com/a'],
		['https://example.com/', 'https://example.com/'],
		['https://example.com/p?fbclid=abc', 'https://example.com/p'],
		['ftp://example.com/a', null],
		['not a url', null],
		[null, null]
	])('%s → %s', (raw, expected) => {
		expect(canonicalizeUrl(raw)).toBe(expected);
	});
});

describe('newsSourceId', () => {
	it('slugifies names, including en dashes and slashes', () => {
		expect(newsSourceId('Marin IJ – Breaking News')).toBe('marin-ij-breaking-news');
		expect(newsSourceId('MMWD / Marin Water')).toBe('mmwd-marin-water');
	});
});
