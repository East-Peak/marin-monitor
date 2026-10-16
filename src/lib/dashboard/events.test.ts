import { describe, expect, it } from 'vitest';
import type { NewsItem } from '$lib/types';
import { EVENTS_DATASETS, SHOW_DAYS, eventsView } from './events';
import { pacificDate } from './pacific-time';

// 11:30 PM PDT on Oct 14: an hour later is Oct 15 in Marin but still Oct 15 06:30 UTC.
const NOW = Date.parse('2026-10-15T06:30:00Z');
const H = 3_600_000;
const D = 24 * H;
let n = 0;
const ev = (category: string, at: number, title = `Event ${++n}`): NewsItem => ({
	id: `ev-${++n}`,
	title,
	link: `https://events.example/${n}`,
	timestamp: at,
	source: 'Sweetwater Music Hall',
	category: category as NewsItem['category'],
	verification: 'official',
	town: 'Mill Valley'
});
const live = { [EVENTS_DATASETS.activity.id]: { kind: 'live' as const, observedAt: null } };

describe('Events & Sports (Goal 4)', () => {
	it('per-day buckets in Pacific time for 10 days', () => {
		const out = eventsView({
			activity: [
				ev('shows', NOW + 0.25 * H), // 11:45 PM Oct 14 Pacific: today
				ev('shows', NOW + 1 * H), // 12:30 AM Oct 15 Pacific: tomorrow (UTC says the same day)
				ev('shows', NOW + 9 * D),
				ev('shows', NOW + 10 * D), // day 11: outside the strip
				ev('endurance', NOW + 2 * D)
			],
			outcomes: live,
			now: NOW
		});
		if (out.shows.kind !== 'value') throw new Error('expected a value');
		const { days, total } = out.shows.value;
		expect(days).toHaveLength(SHOW_DAYS);
		expect(days[0].key).toBe('2026-10-14');
		expect(days[0].key).toBe(pacificDate(NOW));
		expect(days.map((d) => d.count)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
		expect(total).toBe(3);
	});

	it('only a future time can be a show start: a listing stamped at scrape time never counts (Codex desk4 #1)', () => {
		const out = eventsView({
			activity: [ev('shows', NOW - 2 * H, 'Sausalito Seahorse calendar'), ev('shows', NOW + 3 * D)],
			outcomes: live,
			now: NOW
		});
		if (out.shows.kind !== 'value') throw new Error('expected a value');
		expect(out.shows.value.days[0].count).toBe(0);
		expect(out.shows.value.total).toBe(1);
	});

	it('no dated shows: no "0 listed" and no "0 upcoming" (Codex desk4 #2)', () => {
		const out = eventsView({ activity: [ev('shows', NOW - 2 * H)], outcomes: live, now: NOW });
		if (out.shows.kind !== 'value') throw new Error('expected a value');
		expect(out.shows.value.total).toBeNull();
		expect(out.upcoming).toBeNull();
	});

	it('empty day is 0 bucket rendered blank', () => {
		const out = eventsView({ activity: [ev('shows', NOW + 2 * D)], outcomes: live, now: NOW });
		if (out.shows.kind !== 'value') throw new Error('expected a value');
		const empty = out.shows.value.days[0];
		expect(empty.count).toBe(0);
		expect(empty.shown).toBe('');
		expect(out.shows.value.days[2].shown).toBe('1');
	});

	it('next five shows from now, then the race calendar', () => {
		const out = eventsView({
			activity: [
				ev('shows', NOW - 2 * H, 'Already over'),
				...Array.from({ length: 7 }, (_, i) => ev('shows', NOW + (i + 1) * H, `Show ${i}`)),
				ev('endurance', NOW + 40 * D, 'Dipsea Race 2027 · Sunday, June 13, 2027'),
				ev('cycling', NOW + 5 * D, 'Gravel Grinder — Registration open'),
				ev('endurance', NOW - 3 * D, 'Past race'),
				ev('prep', NOW + 1 * D, 'Prep game')
			],
			outcomes: live,
			now: NOW
		});
		if (out.shows.kind !== 'value' || out.races.kind !== 'value') throw new Error('values');
		expect(out.shows.value.next.map((s) => s.title)).toEqual([
			'Show 0',
			'Show 1',
			'Show 2',
			'Show 3',
			'Show 4'
		]);
		expect(out.races.value.map((r) => r.title)).toEqual(['Gravel Grinder', 'Dipsea Race 2027']);
		expect(out.races.value[0].registrationOpen).toBe(true);
		expect(out.races.value[0].inDays).toBe(5);
	});

	it('failed read → unavailable', () => {
		const out = eventsView({
			activity: null,
			outcomes: {
				[EVENTS_DATASETS.activity.id]: {
					kind: 'failed',
					error: 'HTTP 503',
					retained: false,
					observedAt: null
				}
			},
			now: NOW
		});
		expect(out.shows.kind).toBe('unavailable');
		expect(out.races.kind).toBe('unavailable');
		expect(out.upcoming).toBeNull();
	});

	it('before the read lands, loading', () => {
		const out = eventsView({ activity: null, outcomes: {}, now: NOW });
		expect(out.shows.kind).toBe('loading');
	});
});
