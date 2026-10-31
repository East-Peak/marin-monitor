/**
 * Pure selections for SignalsPanel. Multi-source groups keep undated items
 * but order them after every dated one; "fresh" requires a
 * known publication time (undated items are never "fresh").
 */
import { compareByTimestamp, compareKnownNewest, hasKnownPublicationTime } from '$lib/news/order';
import { isActiveAlert } from '$lib/news/alert-status';
import type { NewsItem } from '$lib/types';

export function topAlerts(items: readonly NewsItem[], limit = 5, now = Date.now()): NewsItem[] {
	return items
		.filter((item) => isActiveAlert(item, now))
		.sort(compareByTimestamp)
		.slice(0, limit);
}

/** More sources first; ties by the lead item's time, undated last. */
export function compareStoryGroups(
	a: { sources: { size: number }; items: readonly NewsItem[] },
	b: { sources: { size: number }; items: readonly NewsItem[] }
): number {
	return (
		b.sources.size - a.sources.size ||
		compareKnownNewest(a.items[0]?.timestamp, b.items[0]?.timestamp)
	);
}

export function selectFreshStories(
	items: readonly NewsItem[],
	nowMs: number,
	windowMs: number,
	limit = 6
): NewsItem[] {
	return items
		.filter((item) => hasKnownPublicationTime(item) && item.timestamp > nowMs - windowMs)
		.sort(compareByTimestamp)
		.slice(0, limit);
}
