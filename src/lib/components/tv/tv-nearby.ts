/**
 * The TV map sidebar's "nearby" selection. A recency window needs a known
 * publication time: `now - NaN > maxAge` is false, so without the explicit
 * check every undated item would pass a seven-day gate. Results are ordered
 * globally (not by category concatenation), dated newest first.
 */
import { compareByTimestamp, hasKnownPublicationTime } from '$lib/news/order';
import type { NewsItem } from '$lib/types';

export interface NearbyQuery {
	lat: number;
	lon: number;
	radius: number;
	nearbyTownSlugs: ReadonlySet<string>;
	nowMs: number;
	maxAgeMs: number;
}

export function selectNearby(items: readonly NewsItem[], q: NearbyQuery): NewsItem[] {
	return items
		.filter((item) => {
			if (!hasKnownPublicationTime(item) || q.nowMs - item.timestamp > q.maxAgeMs) return false;
			if (typeof item.lat === 'number' && typeof item.lon === 'number') {
				if (Math.abs(item.lat - q.lat) < q.radius && Math.abs(item.lon - q.lon) < q.radius)
					return true;
			}
			return Boolean(item.townSlug && q.nearbyTownSlugs.has(item.townSlug));
		})
		.sort(compareByTimestamp);
}
