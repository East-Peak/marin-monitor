/**
 * Frozen feeds through the REAL browser path: /api/feeds response →
 * rss.ts (shared parser + normalizer) → loadAllNews → news store → the
 * dashboard's category stores and the TV's allNewsItems. Faked: the network,
 * the lazy-import seam, and the unrelated non-RSS adapters (they resolve
 * empty so the test isolates RSS and stays fast).
 */
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedSource } from '$lib/config/feeds';

const PRL = 'https://www.ptreyeslight.com/feed/';
const NBC = 'https://www.nbcbayarea.com/tag/marin-county/feed/';
const BOS = 'https://marin.granicus.com/ViewPublisherRSS.php?view_id=33&mode=agendas';
const FAIRFAX = 'https://townoffairfaxca.gov/feed/';
const SAN_RAFAEL = 'https://www.cityofsanrafael.org/feed/';
const IJ_HOUSING = 'https://www.marinij.com/tag/housing/feed/';
const IJ_CRIME = 'https://www.marinij.com/tag/crime/feed/';

vi.mock('$lib/config/feeds', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/config/feeds')>();
	const feeds: Record<string, FeedSource[]> = Object.fromEntries(
		Object.keys(actual.FEEDS).map((k) => [k, []])
	);
	feeds.local = [
		{ name: 'Point Reyes Light', url: PRL, verification: 'local_media' },
		{
			name: 'NBC Bay Area – Marin',
			url: NBC,
			verification: 'local_media',
			assumedTimeZone: 'America/Los_Angeles'
		}
	];
	feeds.civic = [
		{
			name: 'Marin County BOS – Agendas',
			url: BOS,
			verification: 'official',
			pubDateMeaning: 'event-start'
		},
		{ name: 'Town of Fairfax', url: FAIRFAX, verification: 'official' }
	];
	// Cross-category GUID collisions: two publishers share GUID "42"; one
	// publisher (Marin IJ) carries the same post in two tag feeds.
	feeds.safety = [
		{ name: 'City of San Rafael', url: SAN_RAFAEL, verification: 'official' },
		{ name: 'Marin IJ – Crime', url: IJ_CRIME, verification: 'local_media' }
	];
	feeds.housing = [{ name: 'Marin IJ – Housing', url: IJ_HOUSING, verification: 'local_media' }];
	return { ...actual, FEEDS: feeds };
});

vi.mock('$lib/api/marin', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/api/marin')>()),
	fetchNpsAlerts: async () => [],
	fetchEarthquakes: async () => [],
	fetchTransitAlerts: async () => ({ items: [] }),
	fetchSheriffCrimeBlotter: async () => [],
	fetchSupplementalPoliceLogs: async () => [],
	fetchSupplementalActivityFeeds: async () => [],
	fetchSeeClickFixIssues: async () => []
}));

let failImports = 0;
vi.mock('./news-pipeline', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./news-pipeline')>();
	return {
		...actual,
		loadNewsPipeline: async () => {
			if (failImports > 0) {
				failImports -= 1;
				throw new Error('Failed to fetch dynamically imported module');
			}
			return actual.loadNewsPipeline();
		}
	};
});

const rss = (items: string) =>
	`<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items}</channel></rss>`;
const item = (title: string, link: string, pubDate?: string) =>
	`<item><title>${title}</title><link>${link}</link>${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}</item>`;

const guidItem = (guid: string, title: string, link: string) =>
	`<item><guid isPermaLink="false">${guid}</guid><title>${title}</title><link>${link}</link><pubDate>Mon, 28 Sep 2026 08:00:00 -0700</pubDate></item>`;

const FEED_BODIES: Record<string, string> = {
	// Undated items sit first, in the middle and last on purpose.
	[PRL]: rss(
		item('Undated Point Reyes notice', 'https://www.ptreyeslight.com/b') +
			item(
				'Point Reyes oyster farm reopens',
				'https://www.ptreyeslight.com/a',
				'Mon, 28 Sep 2026 10:00:00 -0700'
			) +
			item(
				'Point Reyes story from the future',
				'https://www.ptreyeslight.com/c',
				'Tue, 01 Apr 2098 10:00:00 GMT'
			) +
			item(
				'Point Reyes ferry schedule',
				'https://www.ptreyeslight.com/e',
				'Sun, 27 Sep 2026 08:00:00 -0700'
			)
	),
	[NBC]: rss(
		item(
			'Marin County fire crews train in Novato',
			'https://www.nbcbayarea.com/x/1/',
			'Sun, Sep 27 2026 06:57:01 PM'
		)
	),
	[FAIRFAX]: rss(
		guidItem('42', 'Fairfax pool hours change for fall', 'https://townoffairfaxca.gov/pool')
	),
	[SAN_RAFAEL]: rss(
		guidItem('42', 'San Rafael repaves Fourth Street', 'https://www.cityofsanrafael.org/paving')
	),
	// Same host, two feeds: GUID "42" is a different story in each; the
	// shared WordPress post (same article URL) appears in both.
	[IJ_CRIME]: rss(
		guidItem(
			'https://www.marinij.com/?p=777',
			'Mill Valley housing plan draws crowd',
			'https://www.marinij.com/2026/09/28/plan/?utm_source=rss'
		) +
			guidItem(
				'42',
				'Novato burglary suspect arrested in Marin',
				'https://www.marinij.com/2026/09/28/burglary/'
			)
	),
	[IJ_HOUSING]: rss(
		guidItem(
			'https://www.marinij.com/?p=777',
			'Mill Valley housing plan draws crowd',
			'https://www.marinij.com/2026/09/28/plan/'
		) +
			guidItem(
				'42',
				'Corte Madera rezoning vote in Marin',
				'https://www.marinij.com/2026/09/28/rezoning/'
			)
	),
	[BOS]: rss(
		item(
			'BOS Meeting 260915 - Sep 15, 2026',
			'https://marin.granicus.com/m1',
			'Tue, 15 Sep 2026 09:00:00 -0800'
		)
	)
};

let feedBodies = FEED_BODIES;

beforeEach(() => {
	feedBodies = FEED_BODIES;
	failImports = 0;
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string | URL | Request) => {
			const url = new URL(String(input), 'http://localhost');
			const target = url.pathname === '/api/feeds' ? url.searchParams.get('url') : null;
			const body = target ? feedBodies[target] : undefined;
			return body
				? new Response(body, { headers: { 'content-type': 'application/rss+xml' } })
				: new Response('not found', { status: 404 });
		})
	);
});

// Node ≥22 exposes a non-functional global localStorage that shadows jsdom's;
// the stores read it at import time, so give them a working one first.
const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (k: string) => memory.get(k) ?? null,
	setItem: (k: string, v: string) => void memory.set(k, v),
	removeItem: (k: string) => void memory.delete(k),
	clear: () => memory.clear()
});

const { loadAllNews } = await import('./load-all');
const { news, localNews, civicNews, allNewsItems } = await import('$lib/stores/news');

const titles = (items: { title: string }[]) => items.map((i) => i.title).sort();
const { hasKnownPublicationTime } = await import('$lib/news/order');

describe('frozen feeds → adapter → store → dashboard and TV', () => {
	it('keeps undated, future and event-time items, ordered after every dated item, on both surfaces', async () => {
		await loadAllNews();
		const order = [
			'Point Reyes oyster farm reopens', // 2026-09-28T17:00Z
			'Marin County fire crews train in Novato', // 2026-09-28T01:57Z (NBC, declared zone)
			'Point Reyes ferry schedule', // 2026-09-27T15:00Z
			'Undated Point Reyes notice',
			'Point Reyes story from the future'
		];
		expect(get(localNews).items.map((i) => i.title)).toEqual(order); // dashboard, final store order
		expect(
			get(allNewsItems)
				.filter((i) => i.category === 'local')
				.map((i) => i.title)
		).toEqual(order); // TV

		const byTitle = new Map(get(localNews).items.map((i) => [i.title, i]));
		expect(byTitle.get('Undated Point Reyes notice')).toMatchObject({
			publishedAtStatus: 'missing'
		});
		expect(byTitle.get('Point Reyes story from the future')).toMatchObject({
			publishedAtStatus: 'future'
		});
		expect(
			get(localNews)
				.items.filter(hasKnownPublicationTime)
				.map((i) => i.title)
		).toEqual(order.slice(0, 3));
		expect(byTitle.get('Marin County fire crews train in Novato')?.timestamp).toBe(
			Date.parse('2026-09-28T01:57:01.000Z')
		);

		const meeting = get(civicNews).items.find((i) => i.source === 'Marin County BOS – Agendas'); // kept, undated, meeting time as eventAt
		expect(meeting).toMatchObject({
			title: 'BOS Meeting 260915 - Sep 15, 2026',
			eventAt: '2026-09-15T17:00:00.000Z'
		});
		expect(hasKnownPublicationTime(meeting!)).toBe(false);
	});

	it('keeps GUID "42" stories apart — across hosts AND across two feeds on one host — and joins one post carried by two tag feeds', async () => {
		await loadAllNews();
		const combined = get(allNewsItems).map((i) => i.title);
		for (const title of [
			'Fairfax pool hours change for fall',
			'San Rafael repaves Fourth Street',
			'Novato burglary suspect arrested in Marin',
			'Corte Madera rezoning vote in Marin'
		]) {
			expect(combined).toContain(title);
		}
		expect(combined.filter((t) => t === 'Mill Valley housing plan draws crowd')).toHaveLength(1);
		expect(new Set(get(allNewsItems).map((i) => i.id)).size).toBe(get(allNewsItems).length);
	});

	it('keeps the previous items when the parser chunk fails to load, then recovers', async () => {
		await loadAllNews();
		const before = titles(get(localNews).items);

		failImports = 1;
		feedBodies = {
			...FEED_BODIES,
			[PRL]: rss(
				item(
					'Point Reyes follow-up',
					'https://www.ptreyeslight.com/d',
					'Mon, 28 Sep 2026 11:00:00 -0700'
				)
			)
		};
		const failed = await loadAllNews();
		expect(failed.errors.some((e) => e.startsWith('rss:'))).toBe(true);
		expect(titles(get(localNews).items)).toEqual(before); // retained, not wiped

		await loadAllNews();
		expect(titles(get(localNews).items)).toContain('Point Reyes follow-up'); // recovered
	});

	it('leaves no category loading after a refresh', async () => {
		await loadAllNews(true);
		expect(Object.values(get(news).categories).every((c) => !c.loading)).toBe(true);
	});
});
