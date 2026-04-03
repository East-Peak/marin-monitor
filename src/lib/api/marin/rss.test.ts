import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCategory } from './rss';
import type { NewsCategory, VerificationLevel } from '$lib/types';

// Mock $lib/config/api (logger)
vi.mock('$lib/config/api', () => ({
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

// We'll set feed config per test via the mock
let mockFeeds: Record<string, Array<{ name: string; url: string; verification: VerificationLevel; broken?: boolean }>> = {};

vi.mock('$lib/config/feeds', () => ({
	get FEEDS() {
		return new Proxy({}, {
			get(_target, prop) {
				return mockFeeds[prop as string] || [];
			}
		});
	}
}));

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

/** Build a minimal RSS 2.0 XML string from items */
function rssXml(items: Array<{
	title?: string;
	link?: string;
	description?: string;
	pubDate?: string;
	guid?: string;
	contentEncoded?: string;
}>): string {
	const itemsXml = items.map(i => {
		const parts: string[] = [];
		if (i.title !== undefined) parts.push(`<title>${i.title}</title>`);
		if (i.link !== undefined) parts.push(`<link>${i.link}</link>`);
		if (i.description !== undefined) parts.push(`<description>${i.description}</description>`);
		if (i.pubDate !== undefined) parts.push(`<pubDate>${i.pubDate}</pubDate>`);
		if (i.guid !== undefined) parts.push(`<guid>${i.guid}</guid>`);
		if (i.contentEncoded !== undefined) parts.push(`<content:encoded>${i.contentEncoded}</content:encoded>`);
		return `<item>${parts.join('')}</item>`;
	}).join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Test Feed</title>
    ${itemsXml}
  </channel>
</rss>`;
}

/** Build a minimal Atom XML string from entries */
function atomXml(entries: Array<{
	title?: string;
	linkHref?: string;
	summary?: string;
	content?: string;
	published?: string;
	updated?: string;
	id?: string;
}>): string {
	const entriesXml = entries.map(e => {
		const parts: string[] = [];
		if (e.title !== undefined) parts.push(`<title>${e.title}</title>`);
		if (e.linkHref !== undefined) parts.push(`<link rel="alternate" href="${e.linkHref}" />`);
		if (e.summary !== undefined) parts.push(`<summary>${e.summary}</summary>`);
		if (e.content !== undefined) parts.push(`<content>${e.content}</content>`);
		if (e.published !== undefined) parts.push(`<published>${e.published}</published>`);
		if (e.updated !== undefined) parts.push(`<updated>${e.updated}</updated>`);
		if (e.id !== undefined) parts.push(`<id>${e.id}</id>`);
		return `<entry>${parts.join('')}</entry>`;
	}).join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom Feed</title>
  ${entriesXml}
</feed>`;
}

/** Set up a single feed that returns the given XML */
function setupSingleFeed(
	category: NewsCategory,
	feedName: string,
	verification: VerificationLevel,
	xml: string
) {
	mockFeeds = {
		[category]: [{ name: feedName, url: 'https://example.com/feed.xml', verification }]
	};

	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		text: () => Promise.resolve(xml)
	});
}

// ────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────

describe('RSS Feed Parser (via fetchCategory)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mockFeeds = {};
	});

	// ── Valid RSS 2.0 parsing ──

	describe('parsing valid RSS 2.0 XML', () => {
		it('extracts title, link, pubDate, source, category, and verification', async () => {
			const xml = rssXml([{
				title: 'Mill Valley Fire Contained',
				link: 'https://example.com/article/1',
				description: 'A small brush fire was quickly contained.',
				pubDate: 'Mon, 01 Apr 2026 10:30:00 GMT',
				guid: 'article-1'
			}]);

			setupSingleFeed('safety', 'Test News', 'local_media', xml);
			const result = await fetchCategory('safety');

			expect(result.items).toHaveLength(1);
			const item = result.items[0];
			expect(item.title).toBe('Mill Valley Fire Contained');
			expect(item.link).toBe('https://example.com/article/1');
			expect(item.pubDate).toBe('Mon, 01 Apr 2026 10:30:00 GMT');
			expect(item.source).toBe('Test News');
			expect(item.category).toBe('safety');
			expect(item.verification).toBe('local_media');
			expect(item.id).toBe('article-1');
			expect(item.timestamp).toBe(new Date('Mon, 01 Apr 2026 10:30:00 GMT').getTime());
		});

		it('extracts description and truncates it to 300 chars', async () => {
			const longDesc = 'A'.repeat(500);
			const xml = rssXml([{
				title: 'Long Article',
				link: 'https://example.com/long',
				description: longDesc,
				pubDate: 'Mon, 01 Apr 2026 12:00:00 GMT'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items).toHaveLength(1);
			expect(result.items[0].description).toHaveLength(300);
		});

		it('extracts content:encoded field', async () => {
			const xml = rssXml([{
				title: 'Rich Content Article',
				link: 'https://example.com/rich',
				pubDate: 'Mon, 01 Apr 2026 12:00:00 GMT',
				contentEncoded: '<p>Full article body with <strong>HTML</strong></p>'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items).toHaveLength(1);
			expect(result.items[0].content).toBe('Full article body with HTML');
		});

		it('parses multiple items and sorts newest first', async () => {
			const xml = rssXml([
				{
					title: 'Older Article',
					link: 'https://example.com/old',
					pubDate: 'Mon, 30 Mar 2026 08:00:00 GMT'
				},
				{
					title: 'Newer Article',
					link: 'https://example.com/new',
					pubDate: 'Tue, 01 Apr 2026 14:00:00 GMT'
				}
			]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items).toHaveLength(2);
			expect(result.items[0].title).toBe('Newer Article');
			expect(result.items[1].title).toBe('Older Article');
		});

		it('uses link as id when guid is absent', async () => {
			const xml = rssXml([{
				title: 'No GUID',
				link: 'https://example.com/no-guid',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items[0].id).toBe('https://example.com/no-guid');
		});

		it('generates a stable hash id when both guid and link are absent', async () => {
			const xml = rssXml([{
				title: 'No Identifiers',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items[0].id).toMatch(/^rss-/);
			// Same input should produce the same hash
			const firstId = result.items[0].id;

			const result2 = await fetchCategory('local');
			expect(result2.items[0].id).toBe(firstId);
		});
	});

	// ── Atom format ──

	describe('parsing Atom XML', () => {
		it('extracts title, link, published date from Atom entries', async () => {
			const xml = atomXml([{
				title: 'Atom Article',
				linkHref: 'https://example.com/atom/1',
				summary: 'An atom summary',
				published: '2026-04-01T12:00:00Z',
				id: 'urn:atom:1'
			}]);

			setupSingleFeed('civic', 'Atom Source', 'official', xml);
			const result = await fetchCategory('civic');

			expect(result.items).toHaveLength(1);
			const item = result.items[0];
			expect(item.title).toBe('Atom Article');
			expect(item.link).toBe('https://example.com/atom/1');
			expect(item.pubDate).toBe('2026-04-01T12:00:00Z');
			expect(item.source).toBe('Atom Source');
			expect(item.category).toBe('civic');
			expect(item.verification).toBe('official');
			expect(item.id).toBe('urn:atom:1');
		});

		it('falls back to updated when published is absent', async () => {
			const xml = atomXml([{
				title: 'Updated Only',
				linkHref: 'https://example.com/atom/2',
				updated: '2026-03-31T08:00:00Z'
			}]);

			setupSingleFeed('civic', 'Atom Source', 'official', xml);
			const result = await fetchCategory('civic');

			expect(result.items).toHaveLength(1);
			expect(result.items[0].pubDate).toBe('2026-03-31T08:00:00Z');
			expect(result.items[0].timestamp).toBe(new Date('2026-03-31T08:00:00Z').getTime());
		});
	});

	// ── Missing fields ──

	describe('handling missing fields', () => {
		it('skips items with no title', async () => {
			const xml = rssXml([
				{ link: 'https://example.com/no-title', pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT' },
				{ title: 'Has Title', link: 'https://example.com/has-title', pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT' }
			]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items).toHaveLength(1);
			expect(result.items[0].title).toBe('Has Title');
		});

		it('uses empty string for link when missing', async () => {
			const xml = rssXml([{
				title: 'No Link',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items[0].link).toBe('');
		});

		it('uses Date.now() for timestamp when pubDate is missing', async () => {
			const before = Date.now();
			const xml = rssXml([{
				title: 'No Date',
				link: 'https://example.com/no-date'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');
			const after = Date.now();

			expect(result.items[0].pubDate).toBeUndefined();
			expect(result.items[0].timestamp).toBeGreaterThanOrEqual(before);
			expect(result.items[0].timestamp).toBeLessThanOrEqual(after);
		});

		it('uses Date.now() for timestamp when pubDate is invalid', async () => {
			const before = Date.now();
			const xml = rssXml([{
				title: 'Bad Date',
				link: 'https://example.com/bad-date',
				pubDate: 'not-a-real-date'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');
			const after = Date.now();

			// When date is invalid, pubDate is omitted and timestamp falls back to Date.now()
			expect(result.items[0].timestamp).toBeGreaterThanOrEqual(before);
			expect(result.items[0].timestamp).toBeLessThanOrEqual(after);
		});

		it('omits description and content when absent', async () => {
			const xml = rssXml([{
				title: 'Bare Bones',
				link: 'https://example.com/bare',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items[0].description).toBeUndefined();
			expect(result.items[0].content).toBeUndefined();
		});
	});

	// ── HTML cleaning ──

	describe('HTML cleaning', () => {
		it('strips HTML tags from title and description', async () => {
			const xml = rssXml([{
				title: '<b>Bold</b> &amp; <em>Italic</em> Title',
				link: 'https://example.com/html',
				description: '<p>Paragraph with <a href="#">link</a> and <strong>bold</strong></p>',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items[0].title).toBe('Bold & Italic Title');
			expect(result.items[0].description).toBe('Paragraph with link and bold');
		});

		it('strips CDATA wrappers', async () => {
			const xml = rssXml([{
				title: 'CDATA Test',
				link: 'https://example.com/cdata',
				description: '<![CDATA[Some content here]]>',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items[0].description).toBe('Some content here');
		});

		it('collapses whitespace', async () => {
			const xml = rssXml([{
				title: '  Multiple   spaces   and\n\nnewlines  ',
				link: 'https://example.com/spaces',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items[0].title).toBe('Multiple spaces and newlines');
		});

		it('decodes HTML entities in text processed by cleanHtml', async () => {
			// Use &amp;amp; so that after DOMParser decodes &amp; to &, cleanHtml sees &amp; and decodes to &
			// Similarly &amp;quot; -> DOMParser -> &quot; -> cleanHtml -> "
			const xml = rssXml([{
				title: 'Fire &amp; Ice',
				link: 'https://example.com/entities',
				description: 'Quotes &amp;quot;here&amp;quot; and &amp;#039;there&amp;#039;',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			setupSingleFeed('local', 'Test Source', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items[0].title).toBe('Fire & Ice');
			expect(result.items[0].description).toBe('Quotes "here" and \'there\'');
		});
	});

	// ── Malformed/invalid XML ──

	describe('handling malformed XML', () => {
		it('returns empty items and logs error for invalid XML', async () => {
			setupSingleFeed('local', 'Bad Feed', 'local_media', 'this is not xml at all');
			const result = await fetchCategory('local');

			// fetchRssXml checks for '<' — "this is not xml at all" has none,
			// so it throws "Feed proxy returned invalid XML"
			expect(result.items).toEqual([]);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('Bad Feed');
		});

		it('returns empty items for XML with parsererror', async () => {
			// Broken XML that DOMParser will produce a parsererror for
			const brokenXml = '<?xml version="1.0"?><rss><channel><unclosed>';
			setupSingleFeed('local', 'Broken Feed', 'local_media', brokenXml);
			const result = await fetchCategory('local');

			expect(result.items).toEqual([]);
			expect(result.errors).toHaveLength(1);
		});

		it('returns empty items when fetch fails with HTTP error', async () => {
			mockFeeds = {
				local: [{ name: 'Down Feed', url: 'https://example.com/down.xml', verification: 'local_media' as VerificationLevel }]
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500
			});

			const result = await fetchCategory('local');
			expect(result.items).toEqual([]);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('Down Feed');
		});

		it('returns empty items when fetch throws a network error', async () => {
			mockFeeds = {
				local: [{ name: 'Net Error Feed', url: 'https://example.com/error.xml', verification: 'local_media' as VerificationLevel }]
			};
			global.fetch = vi.fn().mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));

			const result = await fetchCategory('local');
			expect(result.items).toEqual([]);
			expect(result.errors).toHaveLength(1);
		});
	});

	// ── Empty feed ──

	describe('handling empty feeds', () => {
		it('returns empty array for RSS feed with no items', async () => {
			const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Empty Feed</title></channel></rss>`;

			setupSingleFeed('local', 'Empty Feed', 'local_media', xml);
			const result = await fetchCategory('local');

			expect(result.items).toEqual([]);
			expect(result.errors).toEqual([]);
		});

		it('returns empty array for Atom feed with no entries', async () => {
			const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty Atom</title></feed>`;

			setupSingleFeed('civic', 'Empty Atom', 'official', xml);
			const result = await fetchCategory('civic');

			expect(result.items).toEqual([]);
			expect(result.errors).toEqual([]);
		});

		it('returns empty array when no feeds are configured for the category', async () => {
			mockFeeds = {};
			const result = await fetchCategory('local');

			expect(result.items).toEqual([]);
			expect(result.errors).toEqual([]);
		});
	});

	// ── Category and verification assignment ──

	describe('category and verification assignment from feed config', () => {
		it('assigns category and verification from feed config, not from XML', async () => {
			const xml = rssXml([{
				title: 'Test Article',
				link: 'https://example.com/a',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			setupSingleFeed('safety', 'Official Source', 'official', xml);
			const result = await fetchCategory('safety');

			expect(result.items[0].category).toBe('safety');
			expect(result.items[0].verification).toBe('official');
		});

		it('assigns different verification levels for different feeds in same category', async () => {
			mockFeeds = {
				local: [
					{ name: 'Media Outlet', url: 'https://example.com/media.xml', verification: 'local_media' as VerificationLevel },
					{ name: 'Community Org', url: 'https://example.com/community.xml', verification: 'community' as VerificationLevel }
				]
			};

			const mediaXml = rssXml([{
				title: 'Media Story',
				link: 'https://example.com/media/1',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			const communityXml = rssXml([{
				title: 'Community Post',
				link: 'https://example.com/community/1',
				pubDate: 'Tue, 01 Apr 2026 09:00:00 GMT'
			}]);

			global.fetch = vi.fn()
				.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(mediaXml) })
				.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(communityXml) });

			const result = await fetchCategory('local');

			expect(result.items).toHaveLength(2);
			const mediaItem = result.items.find(i => i.title === 'Media Story');
			const communityItem = result.items.find(i => i.title === 'Community Post');
			expect(mediaItem?.verification).toBe('local_media');
			expect(communityItem?.verification).toBe('community');
		});

		it('applies satire verification level correctly', async () => {
			const xml = rssXml([{
				title: 'Satirical Report',
				link: 'https://example.com/satire/1',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			setupSingleFeed('satire', 'Marin Lately', 'satire', xml);
			const result = await fetchCategory('satire');

			expect(result.items[0].category).toBe('satire');
			expect(result.items[0].verification).toBe('satire');
		});
	});

	// ── Broken feed filtering ──

	describe('broken feed filtering', () => {
		it('skips feeds marked as broken', async () => {
			mockFeeds = {
				local: [
					{ name: 'Working Feed', url: 'https://example.com/working.xml', verification: 'local_media' as VerificationLevel },
					{ name: 'Broken Feed', url: 'https://example.com/broken.xml', verification: 'local_media' as VerificationLevel, broken: true }
				]
			};

			const xml = rssXml([{
				title: 'Working Article',
				link: 'https://example.com/working/1',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve(xml)
			});

			const result = await fetchCategory('local');

			// Only one fetch call, not two (broken feed skipped)
			expect(global.fetch).toHaveBeenCalledTimes(1);
			expect(result.items).toHaveLength(1);
			expect(result.items[0].title).toBe('Working Article');
		});
	});

	// ── Multi-feed aggregation ──

	describe('multi-feed aggregation', () => {
		it('combines items from multiple feeds in the same category', async () => {
			mockFeeds = {
				local: [
					{ name: 'Source A', url: 'https://example.com/a.xml', verification: 'local_media' as VerificationLevel },
					{ name: 'Source B', url: 'https://example.com/b.xml', verification: 'local_media' as VerificationLevel }
				]
			};

			const xmlA = rssXml([{
				title: 'Article from A',
				link: 'https://example.com/a/1',
				pubDate: 'Tue, 01 Apr 2026 08:00:00 GMT'
			}]);

			const xmlB = rssXml([{
				title: 'Article from B',
				link: 'https://example.com/b/1',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			global.fetch = vi.fn()
				.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(xmlA) })
				.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(xmlB) });

			const result = await fetchCategory('local');

			expect(result.items).toHaveLength(2);
			// Newest first
			expect(result.items[0].title).toBe('Article from B');
			expect(result.items[1].title).toBe('Article from A');
			expect(result.category).toBe('local');
		});

		it('reports errors from individual feeds while returning items from others', async () => {
			mockFeeds = {
				local: [
					{ name: 'Good Feed', url: 'https://example.com/good.xml', verification: 'local_media' as VerificationLevel },
					{ name: 'Bad Feed', url: 'https://example.com/bad.xml', verification: 'local_media' as VerificationLevel }
				]
			};

			const goodXml = rssXml([{
				title: 'Good Article',
				link: 'https://example.com/good/1',
				pubDate: 'Tue, 01 Apr 2026 10:00:00 GMT'
			}]);

			global.fetch = vi.fn()
				.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(goodXml) })
				.mockResolvedValueOnce({ ok: false, status: 500 });

			const result = await fetchCategory('local');

			expect(result.items).toHaveLength(1);
			expect(result.items[0].title).toBe('Good Article');
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('Bad Feed');
		});
	});

	// ── Feed proxy validation ──

	describe('feed proxy validation', () => {
		it('rejects responses that contain no XML (no < character)', async () => {
			setupSingleFeed('local', 'Non-XML Feed', 'local_media', 'plain text response with no angle brackets');
			const result = await fetchCategory('local');

			expect(result.items).toEqual([]);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('invalid XML');
		});

		it('rejects empty responses', async () => {
			mockFeeds = {
				local: [{ name: 'Empty Response', url: 'https://example.com/empty.xml', verification: 'local_media' as VerificationLevel }]
			};
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: () => Promise.resolve('')
			});

			const result = await fetchCategory('local');

			expect(result.items).toEqual([]);
			expect(result.errors).toHaveLength(1);
		});
	});
});
