import { afterEach, describe, expect, it } from 'vitest';
import type { NewsItem } from '$lib/types';
import { SHOW_DAYS, upcomingShows } from './upcoming-shows';

const at = (iso: string) => Date.parse(iso);
let n = 0;
const show = (fields: Partial<NewsItem>): NewsItem => ({
	id: `show-${++n}`,
	title: `Show ${n}`,
	link: `https://venue.example/${n}`,
	timestamp: 0,
	source: 'Osher Marin JCC',
	category: 'shows',
	verification: 'community',
	...fields
});
const timed = (iso: string) => show({ timestamp: at(iso), startSource: 'startDate' });
const dayOnly = (day: string, timestamp = at(`${day}T00:00:00Z`)) =>
	show({ timestamp, startSource: 'calendar', startDay: day });
const days = (items: NewsItem[], now: number) => upcomingShows(items, now).map((s) => s.day);

// 3 PM PDT on Sunday, Oct 18.
const NOW = at('2026-10-18T15:00:00-07:00');

describe('upcomingShows: the one selector Events and the map share (NEWSPIN1)', () => {
	it('is the next 10 Pacific calendar days, today included', () => {
		expect(SHOW_DAYS).toBe(10);
		const items = [
			timed('2026-10-18T19:00:00-07:00'),
			timed('2026-10-27T23:30:00-07:00'), // the 10th day
			timed('2026-10-28T00:30:00-07:00') // the 11th
		];
		expect(days(items, NOW)).toEqual(['2026-10-18', '2026-10-27']);
	});

	it('a timed show has to start from now on; a date-only show counts all of its day', () => {
		const items = [timed('2026-10-18T10:00:00-07:00'), dayOnly('2026-10-18')];
		const out = upcomingShows(items, NOW);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ day: '2026-10-18', at: null });
	});

	it('places a date-only show on its Pacific day, not the UTC midnight it was stamped with', () => {
		// Rancho Nicasio's "Tue, 20 Oct 2026 00:00:00 +0000" is 5 PM on the 19th in Marin.
		expect(days([dayOnly('2026-10-20')], NOW)).toEqual(['2026-10-20']);
	});

	it('never takes an item with no event start: an end date, a post time or a fetch time', () => {
		const items = [
			show({ timestamp: at('2026-10-20T20:00:00-07:00') }), // a JSON-LD endDate
			show({ timestamp: NOW + 60_000, title: 'Sausalito Seahorse calendar' }) // a hub's fetch time
		];
		expect(upcomingShows(items, NOW)).toEqual([]);
	});

	it('takes only shows', () => {
		expect(
			upcomingShows([{ ...timed('2026-10-19T19:00:00-07:00'), category: 'cycling' }], NOW)
		).toEqual([]);
	});

	it('sorts by day, a date-only show first in its day, then by start', () => {
		const late = timed('2026-10-19T21:00:00-07:00');
		const early = timed('2026-10-19T18:00:00-07:00');
		const allDay = dayOnly('2026-10-19');
		const today = timed('2026-10-18T20:00:00-07:00');
		expect(upcomingShows([late, early, allDay, today], NOW).map((s) => s.item.id)).toEqual([
			today.id,
			allDay.id,
			early.id,
			late.id
		]);
	});

	it('keeps Pacific days across the fall DST change', () => {
		// Sat Oct 31, 11:30 PM PDT; clocks fall back at 2 AM Nov 1; the 10th day is Mon Nov 9.
		const now = at('2026-10-31T23:30:00-07:00');
		const items = [
			timed('2026-11-01T01:30:00-08:00'), // the second 1:30 AM
			timed('2026-11-09T23:00:00-08:00'),
			timed('2026-11-10T00:30:00-08:00')
		];
		expect(days(items, now)).toEqual(['2026-11-01', '2026-11-09']);
	});

	describe('under a non-Pacific TZ', () => {
		const original = process.env.TZ;
		afterEach(() => {
			if (original === undefined) delete process.env.TZ;
			else process.env.TZ = original;
		});

		it('reads the same days', () => {
			const items = [timed('2026-10-18T23:30:00-07:00'), dayOnly('2026-10-27')];
			const pacific = days(items, NOW);
			process.env.TZ = 'Asia/Tokyo';
			expect(new Date(NOW).getDate()).toBe(19); // Tokyo is already on the 19th
			expect(days(items, NOW)).toEqual(pacific);
			expect(pacific).toEqual(['2026-10-18', '2026-10-27']);
		});
	});
});
