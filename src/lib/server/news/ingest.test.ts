import { describe, expect, it } from 'vitest';
import {
	HTML_ERROR_PAGE,
	NOW,
	RSS_DATE_CASES,
	RSS_WORDPRESS,
	TRUNCATED_RSS
} from '$lib/news/feed-fixtures';
import { parseNewsSnapshot, type NewsSourceItem, type NewsSourceStatus } from '$lib/news/snapshot';
import {
	buildSnapshot,
	ingestFeed,
	MAX_ITEMS_PER_SOURCE,
	MAX_SOURCE_ITEMS_BYTES,
	resolveSource
} from './ingest';
import { MAX_SNAPSHOT_BYTES } from './snapshot-store';
import { NEWS_SOURCES, type NewsSource } from './sources';

const SRC: NewsSource = {
	id: 'pt-reyes-light',
	name: 'Point Reyes Light',
	url: 'https://www.ptreyeslight.com/feed/',
	category: 'local',
	verification: 'local_media',
	priority: 0
};
const ok = (text: string) => ({ ok: true as const, text, finalUrl: SRC.url, bytes: text.length });
const HOUR = 3_600_000;
const RETAIN = 48 * HOUR;
const FRESH = { revision: 0, lastSuccessfulScrapeAt: null };

describe('ingestFeed', () => {
	it('namespaces ids by source and drops content from the stored copy', () => {
		const r = ingestFeed(SRC, ok(RSS_WORDPRESS), NOW);
		if (!r.ok) throw new Error(r.error);
		expect(r.items).toHaveLength(2);
		expect(r.items[0]).not.toHaveProperty('content');
		expect(r.items[0]).toMatchObject({
			id: 'pt-reyes-light:https://www.marinij.com/?p=101',
			sourceId: 'pt-reyes-light',
			fetchedAt: new Date(NOW).toISOString()
		});
	});
	it('keeps undated items with unknown status rather than inventing a time', () => {
		const r = ingestFeed(SRC, ok(RSS_DATE_CASES), NOW);
		if (!r.ok) throw new Error(r.error);
		const missing = r.items.find((i) => i.title === 'Missing date');
		expect(missing).toMatchObject({ publishedAt: null, publishedAtStatus: 'missing' });
	});
	it("keeps an event-start source's date as eventAt, never publication", () => {
		const bos = {
			...SRC,
			id: 'bos',
			name: 'Marin County BOS – Agendas',
			pubDateMeaning: 'event-start' as const
		};
		const r = ingestFeed(bos, ok(RSS_WORDPRESS), NOW);
		if (!r.ok) throw new Error(r.error);
		expect(r.items[0]).toMatchObject({ publishedAt: null, eventAt: '2026-09-28T19:00:00.000Z' });
	});
	it('applies the dashboard relevance rule (mixed-source item without a Marin anchor is dropped)', () => {
		const nbc = { ...SRC, id: 'nbc', name: 'NBC Bay Area – Crime' };
		const xml = `<rss><channel><item><title>Oakland police chase ends in crash</title><link>https://x/1</link><pubDate>Mon, 28 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
		expect(ingestFeed(nbc, ok(xml), NOW)).toEqual({ ok: true, items: [] });
	});
	it(`keeps the ${MAX_ITEMS_PER_SOURCE} newest items even when the feed lists oldest first`, () => {
		const days = Array.from({ length: 40 }, (_, i) => i + 1);
		const xml = `<rss><channel>${days
			.map(
				(d) =>
					`<item><title>Day ${d}</title><link>https://x/${d}</link><pubDate>${new Date(Date.UTC(2026, 7, 31 + d, 12)).toUTCString()}</pubDate></item>`
			)
			.join('')}</channel></rss>`;
		const r = ingestFeed(SRC, ok(xml), Date.UTC(2026, 9, 11));
		if (!r.ok) throw new Error(r.error);
		expect(r.items).toHaveLength(MAX_ITEMS_PER_SOURCE);
		expect(r.items[0].title).toBe('Day 40');
		expect(r.items.at(-1)?.title).toBe('Day 11');
	});
	it(`fails a source whose items exceed ${MAX_SOURCE_ITEMS_BYTES} bytes, so one feed cannot outgrow the snapshot`, () => {
		const xml = RSS_WORDPRESS.replace(
			'Mill Valley',
			`Mill Valley ${'x'.repeat(MAX_SOURCE_ITEMS_BYTES)}`
		);
		const r = ingestFeed(SRC, ok(xml), NOW);
		expect(r).toMatchObject({ ok: false });
		expect(!r.ok && r.error).toMatch(/^too-large: items are \d+ bytes \(max 50000\)$/);
	});
	it('budgets every source well inside the snapshot ceiling (each item appears in both views)', () => {
		expect(NEWS_SOURCES.length * 2 * MAX_SOURCE_ITEMS_BYTES).toBeLessThan(0.8 * MAX_SNAPSHOT_BYTES);
	});
	it('treats a 200 HTML page (bot challenge, soft 404) as a failure, not an empty feed', () => {
		expect(ingestFeed(SRC, ok(HTML_ERROR_PAGE), NOW)).toEqual({
			ok: false,
			error: 'parse: not an RSS or Atom document (root <html>)'
		});
	});
	it('reports fetch failures and parse failures as errors', () => {
		expect(ingestFeed(SRC, { ok: false, reason: 'http-status', detail: 'HTTP 404' }, NOW)).toEqual({
			ok: false,
			error: 'http-status: HTTP 404'
		});
		expect(ingestFeed(SRC, ok(TRUNCATED_RSS), NOW)).toMatchObject({
			ok: false,
			error: expect.stringMatching(/^parse: malformed XML/)
		});
	});
});

const prevItem = { id: 'pt-reyes-light:old', title: 'Old story' } as NewsSourceItem;
function prevStatus(p: Partial<NewsSourceStatus>): NewsSourceStatus {
	return {
		id: SRC.id,
		name: SRC.name,
		category: 'local',
		verification: 'local_media',
		status: 'ok',
		lastAttemptAt: new Date(NOW - HOUR).toISOString(),
		lastSuccessAt: new Date(NOW - HOUR).toISOString(),
		lastError: null,
		consecutiveFailures: 0,
		itemCount: 1,
		items: [prevItem],
		...p
	};
}

describe('resolveSource — per-source last-good retention', () => {
	it('success replaces items and clears failure state', () => {
		const r = resolveSource(
			SRC,
			{ ok: true, items: [] },
			prevStatus({ consecutiveFailures: 3 }),
			NOW,
			RETAIN
		);
		expect(r).toMatchObject({
			status: 'empty',
			items: [],
			lastSuccessAt: new Date(NOW).toISOString(),
			consecutiveFailures: 0,
			lastError: null
		});
	});
	it("failure retains the source's own last-good items while the last success is recent", () => {
		const r = resolveSource(
			SRC,
			{ ok: false, error: 'timeout: x' },
			prevStatus({ consecutiveFailures: 1 }),
			NOW,
			RETAIN
		);
		expect(r).toMatchObject({
			status: 'retained',
			items: [prevItem],
			lastError: 'timeout: x',
			consecutiveFailures: 2,
			lastSuccessAt: new Date(NOW - HOUR).toISOString(),
			itemCount: 1
		});
	});
	it('failure drops items once the last success is older than the retention window', () => {
		const old = new Date(NOW - RETAIN - 1).toISOString();
		const r = resolveSource(
			SRC,
			{ ok: false, error: 'e' },
			prevStatus({ lastSuccessAt: old }),
			NOW,
			RETAIN
		);
		expect(r).toMatchObject({ status: 'failed', items: [], lastSuccessAt: old });
	});
	it('failure with no history is failed with no items', () => {
		const r = resolveSource(SRC, { ok: false, error: 'e' }, undefined, NOW, RETAIN);
		expect(r).toMatchObject({
			status: 'failed',
			lastSuccessAt: null,
			consecutiveFailures: 1,
			itemCount: 0
		});
	});
});

describe('buildSnapshot', () => {
	it('increments the revision and advances lastSuccessfulScrapeAt only on a success', () => {
		const good = resolveSource(SRC, { ok: true, items: [] }, undefined, NOW, RETAIN);
		const s1 = buildSnapshot(FRESH, [good], [SRC], NOW);
		expect(s1).toMatchObject({ revision: 1, lastSuccessfulScrapeAt: new Date(NOW).toISOString() });
		const bad = resolveSource(SRC, { ok: false, error: 'e' }, s1.sources[0], NOW + HOUR, RETAIN);
		const s2 = buildSnapshot(s1, [bad], [SRC], NOW + HOUR);
		expect(s2).toMatchObject({ revision: 2, lastSuccessfulScrapeAt: new Date(NOW).toISOString() });
	});
	it('continues numbering from a salvaged revision', () => {
		expect(
			buildSnapshot({ revision: 57, lastSuccessfulScrapeAt: null }, [], [SRC], NOW).revision
		).toBe(58);
	});
	it('produces a snapshot the strict reader accepts', () => {
		const r = ingestFeed(SRC, ok(RSS_WORDPRESS), NOW);
		const status = resolveSource(SRC, r, undefined, NOW, RETAIN);
		const s = buildSnapshot(FRESH, [status], [SRC], NOW);
		expect(parseNewsSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
	});
});
