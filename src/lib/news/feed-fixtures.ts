/**
 * Frozen feed fixtures for the shared news pipeline tests. Every fixture is a
 * real-shaped document (WordPress RSS, Atom), not a minimal stub.
 * NOW is the frozen clock all date expectations are computed against.
 */
export const NOW = Date.parse('2026-09-28T20:00:00.000Z');

/** WordPress-style RSS 2.0: CDATA, entities, content:encoded, tracking params. */
export const RSS_WORDPRESS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
	xmlns:content="http://purl.org/rss/1.0/modules/content/"
	xmlns:dc="http://purl.org/dc/elements/1.1/"
	xmlns:atom="http://www.w3.org/2005/Atom"
	xmlns:georss="http://www.georss.org/georss">
<channel>
	<title>Marin Test Journal</title>
	<atom:link href="https://www.marinij.com/tag/news/feed/" rel="self" type="application/rss+xml" />
	<link>https://www.marinij.com</link>
	<item>
		<title><![CDATA[Fire &amp; Ice: <b>Mill Valley</b> council weighs trail plan]]></title>
		<link>https://www.marinij.com/2026/09/28/fire-ice/?utm_source=rss&amp;utm_medium=rss</link>
		<dc:creator><![CDATA[Staff]]></dc:creator>
		<pubDate>Mon, 28 Sep 2026 12:00:00 -0700</pubDate>
		<guid isPermaLink="false">https://www.marinij.com/?p=101</guid>
		<description><![CDATA[<p>The council&#8217;s plan&nbsp;&mdash; explained.</p><p>Second paragraph.</p>]]></description>
		<content:encoded><![CDATA[<p>Full body text.</p><script>track()</script>]]></content:encoded>
	</item>
	<item>
		<title>Tam Valley &amp; Sausalito ferry update</title>
		<link>https://www.marinij.com/2026/09/27/ferry/</link>
		<pubDate>Sun, 27 Sep 2026 09:30:00 GMT</pubDate>
		<description>Escaped markup: &lt;em&gt;ferry&lt;/em&gt; schedule &amp;amp; fares</description>
		<georss:point>37.8590 -122.4852</georss:point>
	</item>
</channel>
</rss>`;

/** One item per date case the normalizer must classify. */
export const RSS_DATE_CASES = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
	<item><title>Valid pubDate</title><link>https://ex.org/a</link><pubDate>Mon, 28 Sep 2026 12:00:00 -0700</pubDate></item>
	<item><title>Missing date</title><link>https://ex.org/b</link></item>
	<item><title>Invalid date</title><link>https://ex.org/c</link><pubDate>not-a-real-date</pubDate></item>
	<item><title>Date only</title><link>https://ex.org/d</link><pubDate>2026-09-28</pubDate></item>
	<item><title>Impossible calendar date</title><link>https://ex.org/e</link><pubDate>Mon, 30 Feb 2026 10:00:00 GMT</pubDate></item>
	<item><title>Future beyond skew</title><link>https://ex.org/f</link><pubDate>Mon, 28 Sep 2026 14:00:00 -0700</pubDate></item>
	<item><title>Future within skew</title><link>https://ex.org/g</link><pubDate>Mon, 28 Sep 2026 13:03:00 -0700</pubDate></item>
	<item><title>dc:date only</title><link>https://ex.org/h</link><dc:date>2026-09-28T08:15:00-07:00</dc:date></item>
	<item><title>Epoch placeholder</title><link>https://ex.org/i</link><pubDate>Thu, 01 Jan 1970 00:00:00 GMT</pubDate></item>
</channel>
</rss>`;

/** Atom: an updated-only entry, a published+updated entry, html-typed title. */
export const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>Atom Source</title>
	<updated>2026-09-28T19:00:00Z</updated>
	<entry>
		<title>Updated only</title>
		<link rel="self" href="https://atom.example/self/1"/>
		<link rel="alternate" href="https://atom.example/posts/1"/>
		<id>urn:atom:1</id>
		<updated>2026-09-28T18:00:00Z</updated>
		<summary>Only an updated time.</summary>
	</entry>
	<entry>
		<title type="html">Published &lt;i&gt;and&lt;/i&gt; updated</title>
		<link href="https://atom.example/posts/2"/>
		<id>urn:atom:2</id>
		<published>2026-09-27T10:00:00Z</published>
		<updated>2026-09-28T11:00:00Z</updated>
		<content type="html">&lt;p&gt;Body&lt;/p&gt;</content>
	</entry>
</feed>`;

export const TRUNCATED_RSS = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Cut off</title></item><item><title>Half`;

export const HTML_ERROR_PAGE = `<!DOCTYPE html><html><head><title>403 Forbidden</title></head><body><h1>Forbidden</h1></body></html>`;

/** An RSS document with n distinct, dated items. */
export function rssWithItems(n: number): string {
	const items = Array.from(
		{ length: n },
		(_, i) =>
			`<item><title>Item ${i}</title><link>https://ex.org/${i}</link><pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item>`
	).join('');
	return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
}
