import { describe, expect, it } from 'vitest';
import { FeedParseError, MAX_FEED_DEPTH, parseFeedXml } from './feed-xml';
import {
	ATOM_FEED,
	HTML_ERROR_PAGE,
	RSS_DATE_CASES,
	RSS_WORDPRESS,
	TRUNCATED_RSS
} from './feed-fixtures';

describe('parseFeedXml — RSS 2.0', () => {
	const feed = parseFeedXml(RSS_WORDPRESS);

	it('detects RSS and extracts every item', () => {
		expect(feed.format).toBe('rss');
		expect(feed.entries).toHaveLength(2);
	});
	it('keeps CDATA content raw (markup intact) with XML entities decoded once', () => {
		expect(feed.entries[0].title).toBe(
			'Fire &amp; Ice: <b>Mill Valley</b> council weighs trail plan'
		);
		expect(feed.entries[1].title).toBe('Tam Valley & Sausalito ferry update');
		expect(feed.entries[1].description).toBe('Escaped markup: <em>ferry</em> schedule &amp; fares');
	});
	it('decodes entities in text links', () => {
		expect(feed.entries[0].link).toBe(
			'https://www.marinij.com/2026/09/28/fire-ice/?utm_source=rss&utm_medium=rss'
		);
	});
	it('reads namespaced content:encoded and guid', () => {
		expect(feed.entries[0].content).toBe('<p>Full body text.</p><script>track()</script>');
		expect(feed.entries[0].guid).toBe('https://www.marinij.com/?p=101');
	});
	it('ignores channel-level title/link and atom:link', () => {
		expect(feed.entries.map((e) => e.title)).not.toContain('Marin Test Journal');
	});
	it('collects pubDate as a publication candidate', () => {
		expect(feed.entries[0].published).toEqual([
			{ source: 'rss:pubDate', raw: 'Mon, 28 Sep 2026 12:00:00 -0700' }
		]);
	});
	it('reads feed-native georss coordinates', () => {
		expect(feed.entries[1].point).toEqual({ lat: 37.859, lon: -122.4852 });
		expect(feed.entries[0].point).toBeNull();
	});
	it('collects dc:date when there is no pubDate', () => {
		const dc = parseFeedXml(RSS_DATE_CASES).entries.find((e) => e.title === 'dc:date only');
		expect(dc?.published).toEqual([{ source: 'rss:dc:date', raw: '2026-09-28T08:15:00-07:00' }]);
	});
});

describe('parseFeedXml — Atom', () => {
	const feed = parseFeedXml(ATOM_FEED);

	it('detects Atom and prefers rel=alternate over rel=self', () => {
		expect(feed.format).toBe('atom');
		expect(feed.entries[0].link).toBe('https://atom.example/posts/1');
	});
	it('treats a rel-less link as alternate', () => {
		expect(feed.entries[1].link).toBe('https://atom.example/posts/2');
	});
	it('never offers <updated> as a publication candidate', () => {
		expect(feed.entries[0].published).toEqual([]);
		expect(feed.entries[0].updated).toBe('2026-09-28T18:00:00Z');
	});
	it('keeps published and updated separate', () => {
		expect(feed.entries[1].published).toEqual([
			{ source: 'atom:published', raw: '2026-09-27T10:00:00Z' }
		]);
		expect(feed.entries[1].updated).toBe('2026-09-28T11:00:00Z');
	});
	it('maps id → guid, summary → description, content → content', () => {
		expect(feed.entries[0].guid).toBe('urn:atom:1');
		expect(feed.entries[0].description).toBe('Only an updated time.');
		expect(feed.entries[1].content).toBe('<p>Body</p>');
	});
	it('ignores the feed-level <updated>', () => {
		expect(feed.entries).toHaveLength(2);
	});
});

describe('parseFeedXml — rejection', () => {
	it('rejects a truncated document instead of returning partial items', () => {
		expect(() => parseFeedXml(TRUNCATED_RSS)).toThrow(FeedParseError);
		expect(() => parseFeedXml(TRUNCATED_RSS)).toThrow(/unclosed/);
	});
	it('rejects an HTML error page', () => {
		expect(() => parseFeedXml(HTML_ERROR_PAGE)).toThrow(/not an RSS or Atom document/);
	});
	it('rejects an empty document', () => {
		expect(() => parseFeedXml('')).toThrow(/empty document/);
	});
	it('rejects unclosed markup inside an item (raw <br> outside CDATA)', () => {
		expect(() =>
			parseFeedXml(
				'<rss><channel><item><title>x</title><description>a<br>b</description></item></channel></rss>'
			)
		).toThrow(/unclosed <br>/);
	});
	it('accepts self-closing tags', () => {
		expect(() => parseFeedXml(ATOM_FEED)).not.toThrow();
	});
	it.each([
		[
			'a second root element',
			'<rss><channel></channel></rss><rss><channel></channel></rss>',
			/after the root/
		],
		[
			'an item outside the closed root',
			'<rss><channel></channel></rss><item><title>x</title></item>',
			/after the root/
		],
		['text after the root', '<rss><channel></channel></rss>junk', /outside the root/],
		[
			'an unterminated trailing comment',
			'<rss><channel></channel></rss><!-- cut',
			/unterminated comment/
		],
		[
			'an unterminated comment inside',
			'<rss><channel><!-- x </channel></rss>',
			/unterminated comment|unclosed/
		],
		[
			'an unterminated CDATA section',
			'<rss><channel><item><title><![CDATA[abc</title></item></channel></rss>',
			/unterminated CDATA/
		],
		['a truncated end tag', '<rss><channel></channel></rss', /malformed end tag/],
		['a truncated attribute', '<rss><channel><item><link href="x', /malformed <link>/],
		[
			'a truncated start tag after the root',
			'<rss><channel/></rss><item',
			/after the root|malformed/
		],
		['trailing CDATA after the root', '<rss><channel/></rss><![CDATA[', /CDATA outside/],
		[
			'an unquoted attribute',
			'<rss><channel><item><link href=x/></item></channel></rss>',
			/malformed <link>/
		],
		['a stray end tag', '<rss><channel></b></channel></rss>', /unclosed <channel>/],
		['RSS with no channel', '<rss version="2.0"/>', /no <channel>/],
		['RSS with items but no channel', '<rss><item><title>x</title></item></rss>', /no <channel>/]
	])('rejects %s', (_label, xml, message) => {
		expect(() => parseFeedXml(xml)).toThrow(message);
	});
	it('handles deep nesting in linear time: an ~800 KB nested document is rejected fast', () => {
		const n = 100_000;
		const xml = `<rss><channel>${'<a>'.repeat(n)}${'</a>'.repeat(n)}</channel></rss>`;
		const started = performance.now();
		expect(() => parseFeedXml(xml)).toThrow(/nested deeper than 64/);
		expect(performance.now() - started).toBeLessThan(2_000);
	});
	it('accepts nesting up to the depth limit, and rejects one level more', () => {
		// rss > channel > item, then n more levels
		const nested = (n: number) =>
			`<rss><channel><item><title>t</title>${'<a>'.repeat(n)}${'</a>'.repeat(n)}</item></channel></rss>`;
		expect(parseFeedXml(nested(MAX_FEED_DEPTH - 3)).entries.map((e) => e.title)).toEqual(['t']);
		expect(() => parseFeedXml(nested(MAX_FEED_DEPTH - 2))).toThrow(/nested deeper than 64/);
	});
	it('ignores items outside the channel (wrong ancestry)', () => {
		const feed = parseFeedXml(
			'<rss><channel><item><title>in</title></item></channel><extra><item><title>out</title></item></extra></rss>'
		);
		expect(feed.entries.map((e) => e.title)).toEqual(['in']);
	});
	it('accepts RSS 1.0 (rdf:RDF) items that are siblings of the channel', () => {
		const feed = parseFeedXml(
			'<rdf:RDF><channel><title>t</title></channel><item><title>one</title></item></rdf:RDF>'
		);
		expect(feed.entries.map((e) => e.title)).toEqual(['one']);
	});
	it('accepts comments and processing instructions around the root', () => {
		expect(() =>
			parseFeedXml('<?xml version="1.0"?><!-- a --><rss><channel/></rss><!-- b -->')
		).not.toThrow();
	});
	it('returns zero entries for a valid empty channel', () => {
		expect(
			parseFeedXml('<rss version="2.0"><channel><title>t</title></channel></rss>').entries
		).toEqual([]);
	});
});
