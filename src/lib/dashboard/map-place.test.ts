import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { NewsItem } from '$lib/types';

const fixtures = join(__dirname, '../server/__fixtures__/activity-shows');
const fixture = (name: string) => readFileSync(join(fixtures, name), 'utf8');
/** Each calendar URL serves today's real page, trimmed. */
const PAGES: Record<string, string> = {
	'https://sweetwatermusichall.org/events/feed/': fixture('sweetwater-feed.xml'),
	'https://ranchonicasio.com/events/feed/': fixture('rancho-nicasio-feed.xml'),
	'https://macsat19broadway.com/events/': fixture('macs-events.html'),
	'https://dancepalace.org/events/': fixture('dance-palace-events.html'),
	'https://www.marinjcc.org/events/': fixture('jcc-events.html'),
	'https://touristclubsf.org/calendar/': fixture('tourist-club-calendar.html')
};
vi.mock('$lib/server/scrapers/shared', async (orig) => ({
	...(await orig<object>()),
	safeFetch: vi.fn(async (url: string) => {
		const page = PAGES[url];
		if (page === undefined) throw new Error(`no fixture for ${url}`);
		return page;
	}),
	fetchLastModified: vi.fn(async () => '2026-10-18T20:25:00Z')
}));

const { scrapeShowRssFeeds, scrapeShowsHubs } = await import('$lib/server/scrapers/activity/shows');
const { placeOf } = await import('./map-place');

const NOW = Date.parse('2026-09-27T12:00:00-07:00');
const items = [...(await scrapeShowRssFeeds(NOW)), ...(await scrapeShowsHubs(NOW))];
const titled = (part: string) => {
	const hit = items.find((i) => i.title.includes(part));
	if (!hit) throw new Error(`no item titled …${part}…`);
	return hit;
};

/** Records as today's marin-activity.json carries them (2026-10-18). */
const MARINDURO: NewsItem = {
	id: 'cycling:marin-trail-stewards:marinduro-may-8-2027:https-marintrailstewards-org-marinduro',
	title: 'Marinduro — May 8, 2027',
	link: 'https://marintrailstewards.org/marinduro',
	timestamp: 1809759600000,
	source: 'Marin Trail Stewards',
	category: 'cycling',
	verification: 'community',
	town: 'Fairfax',
	townSlug: 'fairfax',
	lat: 37.9871,
	lon: -122.5889,
	locationConfidence: 'exact'
};
const LIBRARY_SYSTEM: NewsItem = {
	id: 'shows:marin-county-free-library:marin-county-free-library-events:https-marinlibrary-bibliocommons-com-v2-events',
	title: 'Marin County Free Library events',
	link: 'https://marinlibrary.bibliocommons.com/v2/events',
	timestamp: 1792355120000,
	source: 'Marin County Free Library',
	category: 'shows',
	verification: 'community',
	lat: 37.9991,
	lon: -122.5234,
	locationConfidence: 'exact'
};

describe('placeOf: a show is placed only at a confirmed venue (NEWSPIN1)', () => {
	it.each([
		['Adrian West Band', 'marin-jcc', 'Osher Marin JCC'], // names the venue
		['Shabbat Yoga', 'marin-jcc', 'Osher Marin JCC'], // a room at the venue's street address
		['Jewish Book Club', 'marin-jcc', 'Osher Marin JCC'],
		['Volunteer Work Day', 'tourist-club', 'Tourist Club'], // an alias
		['Ballet at the Palace', 'dance-palace', 'Dance Palace'], // "Main Hall · 503 B Street"
		['CHRIS CAIN', 'rancho-nicasio', 'Rancho Nicasio'] // a single-venue calendar, no words
	])('%s → the venue', (title, id, label) => {
		const p = placeOf(titled(title));
		expect(p).toMatchObject({
			kind: 'place',
			id: `venue:${id}`,
			place: { precision: 'venue', label, provenance: 'venue list' }
		});
	});

	it('places a Mac’s card (no location words) at Mac’s own point', () => {
		const macs = items.find((i) => i.source === "Mac's at 19 Broadway")!;
		expect(placeOf(macs)).toMatchObject({
			kind: 'place',
			place: { lat: 37.9869, lon: -122.588, label: "Mac's at 19 Broadway" }
		});
	});

	it.each([
		['West Point Inn', 'at California Alpine Lodge, not the Tourist Club'],
		['Re-Visioning Zionism', 'at Rodef Sholom Sanctuary, not the JCC'],
		['Virtual Briefing', 'virtual'],
		['CANCELLED', 'cancelled (and at JCC South, 36 Tiburon Blvd)']
	])('%s → not mapped (%s)', (title) => {
		expect(placeOf(titled(title))).toEqual({ kind: 'none' });
	});

	it.each([
		['Marinduro, on Mac’s point by its source', MARINDURO],
		['the county library system', LIBRARY_SYSTEM]
	])('%s → not mapped', (_, item) => {
		expect(placeOf(item)).toEqual({ kind: 'none' });
	});

	it('hub pages → not mapped', () => {
		const hubs = items.filter((i) => !i.venueId);
		expect(hubs.length).toBeGreaterThan(0);
		for (const hub of hubs) expect(placeOf(hub)).toEqual({ kind: 'none' });
	});

	it('online or postponed per the page’s own schema.org status → not mapped', () => {
		const base = titled('Adrian West Band');
		for (const status of ['EventPostponed', 'EventCancelled', 'OnlineEventAttendanceMode'])
			expect(
				placeOf({ ...base, content: `Osher Marin JCC · https://schema.org/${status}` })
			).toEqual({ kind: 'none' });
	});
});

describe('placeOf: a blotter report is a town, never a point (NEWSPIN1)', () => {
	const report = (over: Partial<NewsItem>): NewsItem => ({
		id: 'blotter-SO1',
		title: 'Theft · 5XX The Alameda',
		link: 'https://data.marincounty.gov/',
		timestamp: 0,
		source: 'Marin Sheriff Blotter',
		category: 'safety',
		verification: 'official',
		townSlug: 'san-anselmo',
		...over
	});

	it('is its town, whatever point the county gave', () => {
		expect(placeOf(report({ lat: 37.99878, lon: -122.57125 }))).toEqual({
			kind: 'town',
			townSlug: 'san-anselmo'
		});
	});

	it('is nothing when its town isn’t a Marin town we draw', () => {
		expect(placeOf(report({ townSlug: 'nowhere' }))).toEqual({ kind: 'none' });
	});
});
