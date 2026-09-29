/**
 * Pure ordering/labeling for the map's story lists (MapPanel inspector,
 * MapTooltip). Undated items (timestamp NaN) stay listed, sort after every
 * dated item across ALL categories, and read "undated" — never "NaNd".
 */
import { compareByTimestamp } from '$lib/news/order';
import type { NewsItem } from '$lib/types';
import { timeAgo } from '$lib/utils/format';

/** Items on an active layer, dated newest first, undated last. */
export function visibleMapItems(
	items: readonly NewsItem[],
	isVisible: (item: NewsItem) => boolean
): NewsItem[] {
	return items.filter(isVisible).sort(compareByTimestamp);
}

/** The town tooltip's list: this town's visible items, same order. */
export function townTooltipItems(
	items: readonly NewsItem[],
	townSlug: string,
	isVisible: (item: NewsItem) => boolean
): NewsItem[] {
	return visibleMapItems(
		items.filter((item) => item.townSlug === townSlug),
		isVisible
	);
}

/**
 * Age label for a pin, from a map feature's `timestamp` property. Missing,
 * non-numeric, non-finite and non-positive (epoch placeholder) values are
 * unknown → "undated".
 */
export function pinAgeLabel(raw: unknown): string {
	const ms =
		typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
	return Number.isFinite(ms) && ms > 0 ? timeAgo(ms) : 'undated';
}
