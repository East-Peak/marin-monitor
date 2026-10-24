/**
 * Recency counts ("stories in the last 24h") include only items with a known
 * publication time within the window. An undated item stays visible as
 * "undated" elsewhere but is never "recent" (dashboard §13.8; d1b1 ruling a).
 */
import { hasKnownPublicationTime } from './order';
import { FUTURE_SKEW_MS, type PublishedAtStatus } from './feed-date';

/** A time no further ahead of `now` than feed clock skew allows. False for an unknown (NaN) time. */
export function withinFutureSkew(timestamp: number, now: number): boolean {
	return timestamp <= now + FUTURE_SKEW_MS;
}

export function isWithinWindow(
	item: { publishedAtStatus?: PublishedAtStatus; timestamp: number },
	windowMs: number,
	now: number
): boolean {
	return (
		hasKnownPublicationTime(item) &&
		item.timestamp >= now - windowMs &&
		withinFutureSkew(item.timestamp, now)
	);
}

/** The map's story window (MAPFRESH1): a story's own publication time within the last 7 days. */
export const MAP_NEWS_WINDOW_MS = 7 * 86_400_000;
export const MAP_NEWS_WINDOW_LINE = 'Stories from the last 7 days';

export const onMapWindow = (item: Parameters<typeof isWithinWindow>[0], now: number) =>
	isWithinWindow(item, MAP_NEWS_WINDOW_MS, now);
