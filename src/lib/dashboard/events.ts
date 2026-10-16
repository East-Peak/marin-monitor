/**
 * Events & Sports (desktop Goal 4): shows over the next ten Pacific days and the race calendar,
 * from the activity blob (/api/data/activity) through its own status-bearing read. A day with no
 * shows is a 0 bucket drawn blank; a failed read is unavailable, never an empty calendar.
 */
import type { NewsItem } from '$lib/types';
import { mapMeasured, measuredFromEntry, type Measured } from './measured';
import { PACIFIC, nextDate, pacificDate } from './pacific-time';
import { datasetEntry, type DatasetFetch } from './source-adapters';
import { presentSection, type SectionPresentation } from './source-status';

export const EVENTS_DATASETS = {
	activity: { id: 'activity', name: 'Events calendar' }
} as const;

export const SHOW_DAYS = 10;
const SHOWS_LISTED = 5;
const RACES_LISTED = 6;
const RACE_CATEGORIES: ReadonlySet<string> = new Set(['endurance', 'cycling']);
const DAY_MS = 86_400_000;

export interface ShowDay {
	/** Pacific calendar date, YYYY-MM-DD. */
	key: string;
	weekday: string;
	date: string;
	count: number;
	/** The bar's label: the count, or blank for a day with none (never "0"). */
	shown: string;
}

export interface ShowRow {
	id: string;
	title: string;
	link: string;
	weekday: string;
	day: string;
	meta: string;
}

export interface RaceRow {
	id: string;
	title: string;
	link: string;
	when: string;
	inDays: number;
	registrationOpen: boolean;
}

export interface EventsView {
	/** `total` is null with no dated show: the feed can't vouch for an empty calendar. */
	shows: Measured<{ days: ShowDay[]; total: number | null; next: ShowRow[] }>;
	races: Measured<RaceRow[]>;
	/** Everything dated from now on, for the header; null without a read or with none. */
	upcoming: number | null;
	status: SectionPresentation;
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, ...opts });
const WEEKDAY_NARROW = fmt({ weekday: 'narrow' });
const WEEKDAY_SHORT = fmt({ weekday: 'short' });
const DAY_OF_MONTH = fmt({ day: 'numeric' });
const MONTH_DAY = fmt({ month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = fmt({ month: 'short', day: 'numeric', year: 'numeric' });
/** Noon UTC on a date reads as that same date in Pacific time. */
const noonOf = (key: string) => Date.parse(`${key}T12:00:00Z`);

function showDays(shows: readonly NewsItem[], now: number): ShowDay[] {
	const counts = new Map<string, number>();
	for (const s of shows) {
		const key = pacificDate(s.timestamp);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const days: ShowDay[] = [];
	for (let i = 0, key = pacificDate(now); i < SHOW_DAYS; i++, key = nextDate(key)) {
		const count = counts.get(key) ?? 0;
		days.push({
			key,
			weekday: WEEKDAY_NARROW.format(noonOf(key)),
			date: DAY_OF_MONTH.format(noonOf(key)),
			count,
			shown: count ? String(count) : ''
		});
	}
	return days;
}

/**
 * Only a time still ahead can be a show's start: the producer stamps a venue's calendar page
 * with its fetch time and an RSS post with its publication time, both already past
 * (Codex desk4 #1).
 */
const isUpcoming = (i: NewsItem, now: number) => Number.isFinite(i.timestamp) && i.timestamp >= now;

function showsOf(items: readonly NewsItem[], now: number) {
	const shows = items.filter((i) => i.category === 'shows' && isUpcoming(i, now));
	const days = showDays(shows, now);
	const inStrip = new Set(days.map((d) => d.key));
	const total = shows.filter((s) => inStrip.has(pacificDate(s.timestamp))).length;
	return {
		days,
		total: total || null,
		next: [...shows]
			.sort((a, b) => a.timestamp - b.timestamp)
			.slice(0, SHOWS_LISTED)
			.map((s) => ({
				id: s.id,
				title: s.title.split(' | ')[0],
				link: s.link,
				weekday: WEEKDAY_SHORT.format(s.timestamp),
				day: MONTH_DAY.format(s.timestamp),
				meta: s.town ? `${s.source} · ${s.town}` : s.source
			}))
	};
}

function racesOf(items: readonly NewsItem[], now: number): RaceRow[] {
	return items
		.filter((i) => RACE_CATEGORIES.has(i.category) && isUpcoming(i, now))
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(0, RACES_LISTED)
		.map((r) => ({
			id: r.id,
			title: r.title.split(/ [—·] /)[0],
			link: r.link,
			when: MONTH_DAY_YEAR.format(r.timestamp),
			inDays: Math.round((r.timestamp - now) / DAY_MS),
			registrationOpen: /registration open/i.test(r.title)
		}));
}

export function eventsView(input: {
	activity: readonly NewsItem[] | null;
	outcomes: Readonly<Record<string, DatasetFetch>>;
	now: number;
}): EventsView {
	const { now } = input;
	const A = EVENTS_DATASETS.activity;
	const entry = datasetEntry(A.id, A.name, input.outcomes[A.id], null);
	const read = measuredFromEntry(entry, input.activity, 'Venue and race calendars', now);
	const shows = mapMeasured(read, (items) => showsOf(items, now));
	const races = mapMeasured(read, (items) => racesOf(items, now));
	const valued = read.kind === 'value' ? 1 : 0;
	return {
		shows,
		races,
		upcoming:
			read.kind === 'value' ? read.value.filter((i) => isUpcoming(i, now)).length || null : null,
		status: presentSection([entry], { total: valued, matching: valued }, now)
	};
}
