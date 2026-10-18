import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const fixture = (name: string) =>
	readFileSync(join(__dirname, '../../__fixtures__/activity-shows', name), 'utf8');

/** Each calendar URL serves today's real page, trimmed (NEWSPIN1). */
const PAGES: Record<string, string> = {
	'https://sweetwatermusichall.org/events/feed/': fixture('sweetwater-feed.xml'),
	'https://ranchonicasio.com/events/feed/': fixture('rancho-nicasio-feed.xml'),
	'https://macsat19broadway.com/events/': fixture('macs-events.html'),
	'https://dancepalace.org/events/': fixture('dance-palace-events.html'),
	'https://www.marinjcc.org/events/': fixture('jcc-events.html'),
	'https://touristclubsf.org/calendar/': fixture('tourist-club-calendar.html')
};

vi.mock('../shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('../shared')>()),
	safeFetch: vi.fn(async (url: string) => {
		const page = PAGES[url];
		if (page === undefined) throw new Error(`no fixture for ${url}`);
		return page;
	}),
	fetchLastModified: vi.fn(async () => '2026-10-18T20:25:00Z')
}));

const { scrapeShowRssFeeds, scrapeShowsHubs } = await import('./shows');
const { VENUES } = await import('$lib/config/venues');

const NOW = Date.parse('2026-09-27T12:00:00-07:00');
const byTitle = <T extends { title: string }>(items: T[], part: string): T => {
	const hit = items.find((i) => i.title.includes(part));
	if (!hit) throw new Error(`no item titled …${part}…`);
	return hit;
};

describe('show calendars carry their start and location evidence (NEWSPIN1)', () => {
	it('stamps every single-venue calendar with its reviewed venue and that venue’s point', async () => {
		const items = [...(await scrapeShowRssFeeds(NOW)), ...(await scrapeShowsHubs(NOW))];
		for (const venue of VENUES) {
			const own = items.filter((i) => i.source === venue.source);
			expect(own.length, venue.source).toBeGreaterThan(0);
			for (const item of own) {
				expect(item.venueId).toBe(venue.id);
				expect([item.lat, item.lon]).toEqual([venue.lat, venue.lon]);
			}
		}
	});

	it('takes a JSON-LD startDate as the start, with the event’s own location words', async () => {
		const items = await scrapeShowsHubs(NOW);
		const shabbat = byTitle(items, 'Shabbat Yoga');
		expect(shabbat.startSource).toBe('startDate');
		expect(shabbat.startDay).toBeUndefined();
		expect(shabbat.locationText).toBe('JCC 2nd Floor Yoga Studio · 200 N. San Pedro Rd.');
		expect(byTitle(items, 'Re-Visioning Zionism').locationText).toMatch(/^Rodef Sholom Sanctuary/);
		expect(byTitle(items, 'West Point Inn').locationText).toMatch(/^California Alpine Lodge/);
		expect(byTitle(items, 'Virtual Briefing').locationText).toBeUndefined();
	});

	it('holds a calendar card’s date as a Pacific day, not a fake midnight', async () => {
		const items = await scrapeShowsHubs(NOW);
		const macs = items.filter((i) => i.source === "Mac's at 19 Broadway");
		expect(macs.length).toBeGreaterThan(0);
		expect(macs[0]).toMatchObject({ startSource: 'calendar', startDay: '2026-10-14' });
		expect(macs[0].locationText).toBeUndefined();
	});

	it('reads Rancho Nicasio’s RSS date as the show day; Sweetwater’s is a post time, no start', async () => {
		const items = await scrapeShowRssFeeds(NOW);
		const rancho = byTitle(items, 'CHRIS CAIN');
		expect(rancho).toMatchObject({ startSource: 'calendar', startDay: '2026-10-16' });
		const sweetwater = items.filter((i) => i.source === 'Sweetwater Music Hall');
		expect(sweetwater.length).toBeGreaterThan(0);
		for (const s of sweetwater) {
			expect(s.startSource).toBeUndefined();
			expect(s.startDay).toBeUndefined();
		}
	});

	it('gives hub pages no start and no venue (their date is the fetch time)', async () => {
		const items = await scrapeShowsHubs(NOW);
		const hubs = items.filter((i) => !VENUES.some((v) => v.source === i.source));
		expect(hubs.length).toBeGreaterThan(0);
		for (const hub of hubs) {
			expect(hub.startSource).toBeUndefined();
			expect(hub.venueId).toBeUndefined();
		}
	});

	it('never takes a JSON-LD endDate as the start', async () => {
		const { parseJsonLdEventPage } = await import('./parsers');
		const { safeFetch } = await import('../shared');
		vi.mocked(safeFetch).mockResolvedValueOnce(
			'<script type="application/ld+json">' +
				JSON.stringify({
					'@type': 'Event',
					name: 'Ends only',
					endDate: '2026-10-01T20:00:00-07:00'
				}) +
				'</script>'
		);
		const [item] = await parseJsonLdEventPage(
			{ source: 'Osher Marin JCC', url: 'https://example.test/', category: 'shows' },
			NOW
		);
		expect(item.startSource).toBeUndefined();
	});

	it('holds a date-only JSON-LD startDate as that day', async () => {
		const { parseJsonLdEventPage } = await import('./parsers');
		const { safeFetch } = await import('../shared');
		vi.mocked(safeFetch).mockResolvedValueOnce(
			'<script type="application/ld+json">' +
				JSON.stringify({ '@type': 'Event', name: 'All day', startDate: '2026-10-03' }) +
				'</script>'
		);
		const [item] = await parseJsonLdEventPage(
			{ source: 'Dance Palace', url: 'https://example.test/', category: 'shows' },
			NOW
		);
		expect(item).toMatchObject({ startSource: 'startDate', startDay: '2026-10-03' });
	});

	describe('Codex NEWSPIN1 review', () => {
		const page = (event: Record<string, unknown>) =>
			'<script type="application/ld+json">' +
			JSON.stringify({ '@type': 'Event', name: 'X', ...event }) +
			'</script>';
		const read = async (event: Record<string, unknown>, now = NOW) => {
			const { parseJsonLdEventPage } = await import('./parsers');
			const { safeFetch } = await import('../shared');
			vi.mocked(safeFetch).mockResolvedValueOnce(page(event));
			return parseJsonLdEventPage(
				{ source: 'Osher Marin JCC', url: 'https://example.test/', category: 'shows' },
				now
			);
		};

		it('#1 a VirtualLocation is said, never read as no location', async () => {
			const [item] = await read({
				startDate: '2026-10-01T19:00:00-07:00',
				location: { '@type': 'VirtualLocation', url: 'https://zoom.us/j/1' }
			});
			expect(item.locationText).toMatch(/virtual/i);
		});

		it('#1 a location given but unreadable is not "no location"', async () => {
			const [item] = await read({
				startDate: '2026-10-01T19:00:00-07:00',
				location: { '@type': 'Place', url: 'https://example.test/somewhere' }
			});
			expect(item.locationText).toBeDefined();
		});

		it('#4 a start with no zone is Pacific wall time, whatever the server’s zone', async () => {
			const original = process.env.TZ;
			process.env.TZ = 'UTC';
			try {
				const [item] = await read({ startDate: '2026-10-01T19:00:00' });
				expect(item.timestamp).toBe(Date.parse('2026-10-01T19:00:00-07:00'));
				expect(item.startSource).toBe('startDate');
			} finally {
				if (original === undefined) delete process.env.TZ;
				else process.env.TZ = original;
			}
		});

		it('#5 a date-only show is kept all of its Pacific day', async () => {
			const sixPm = Date.parse('2026-10-18T18:00:00-07:00');
			const items = await read({ startDate: '2026-10-18' }, sixPm);
			expect(items.map((i) => i.startDay)).toEqual(['2026-10-18']);
		});
	});
});
