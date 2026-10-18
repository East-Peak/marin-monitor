/**
 * Marin is on Pacific time. Calendar boundaries ("today", "midnight") and
 * wall-clock source times (NOAA tides) are read in America/Los_Angeles,
 * through the shared DST-checked feed-date parser.
 */
import { parseFeedDate } from '$lib/news/feed-date';

export const PACIFIC = 'America/Los_Angeles';

const DATE = new Intl.DateTimeFormat('en-CA', {
	timeZone: PACIFIC,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});
const TIME = new Intl.DateTimeFormat('en-US', {
	timeZone: PACIFIC,
	hour: 'numeric',
	minute: '2-digit'
});
const WALL = new Intl.DateTimeFormat('en-CA', {
	timeZone: PACIFIC,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});
const DAY = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, month: 'short', day: 'numeric' });

/** ICU uses a narrow no-break space before AM/PM; the UI and tests use a plain space. */
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');

export function pacificDate(ms: number): string {
	return DATE.format(ms);
}

/** `YYYY-MM-DD HH:MM` or `YYYY-MM-DDTHH:MM` as Pacific wall time; null if invalid or in a DST gap. */
export function parsePacificWallTime(value: string): number | null {
	if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(value)) return null;
	return parseFeedDate(value.replace(' ', 'T'), PACIFIC);
}

/** An instant as Pacific wall time, `YYYY-MM-DDTHH:MM:SS` (a floating-time query bound). */
export function pacificWallTime(ms: number): string {
	const part = Object.fromEntries(WALL.formatToParts(ms).map((p) => [p.type, p.value]));
	return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}:${part.second}`;
}

/** The calendar day after a `YYYY-MM-DD` date (date arithmetic only; no clock or zone). */
export function nextDate(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function pacificMidnightAfter(ms: number): number {
	// US DST transitions happen at 02:00, so local midnight always exists.
	return parsePacificWallTime(`${nextDate(pacificDate(ms))}T00:00`) as number;
}

export function formatAsOf(ms: number, now: number): string {
	const time = plain(TIME.format(ms));
	return pacificDate(ms) === pacificDate(now) ? time : `${plain(DAY.format(ms))}, ${time}`;
}
