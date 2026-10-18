/**
 * The upcoming shows (NEWSPIN1): the one selector the Events section and the map share, so they
 * can't disagree on what's on. A show counts only with an event start (`startSource`): a
 * venue's own show date or JSON-LD `startDate`, never an end, post or fetch time. The window is
 * the next SHOW_DAYS Pacific calendar days, today included, re-applied on every call so kept
 * data ages out. A timed show must start from now on; a date-only show counts all of its day.
 */
import type { NewsItem } from '$lib/types';
import { nextDate, pacificDate } from './pacific-time';

export const SHOW_DAYS = 10;

export interface UpcomingShow {
	item: NewsItem;
	/** Its Pacific calendar day, YYYY-MM-DD. */
	day: string;
	/** Its start instant; null for a date-only show (no time of day is claimed). */
	at: number | null;
}

/** The window's last day: today plus SHOW_DAYS - 1. */
function lastDay(now: number): string {
	let day = pacificDate(now);
	for (let i = 1; i < SHOW_DAYS; i++) day = nextDate(day);
	return day;
}

export function upcomingShows(items: readonly NewsItem[], now: number): UpcomingShow[] {
	const first = pacificDate(now);
	const last = lastDay(now);
	return (
		items
			.flatMap((item): UpcomingShow[] => {
				if (item.category !== 'shows' || !item.startSource) return [];
				if (item.startDay) return [{ item, day: item.startDay, at: null }];
				if (!Number.isFinite(item.timestamp) || item.timestamp < now) return [];
				return [{ item, day: pacificDate(item.timestamp), at: item.timestamp }];
			})
			.filter((s) => s.day >= first && s.day <= last)
			// By day; within it a date-only show (at 0) first, then by start.
			.sort((a, b) => (a.day !== b.day ? (a.day < b.day ? -1 : 1) : (a.at ?? 0) - (b.at ?? 0)))
	);
}
