/**
 * Time ordering and eligibility for news items — shared by the producer,
 * the browser adapters, the stores and (next) the dashboard/TV selectors.
 *
 * Unknown times are values that are not finite numbers (NaN, null,
 * undefined, ±Infinity). A subtraction comparator (`b - a`) returns NaN for
 * them, which Array#sort treats as "equal" — so an undated item can sit
 * ahead of dated ones. These comparators never subtract an unknown.
 */
import type { PublishedAtStatus } from './feed-date';

type Instant = number | null | undefined;

const known = (ms: Instant): ms is number => typeof ms === 'number' && Number.isFinite(ms);

/** Known times newest first; unknown times after every known one, in their original order. */
export function compareKnownNewest(a: Instant, b: Instant): number {
	if (known(a) && known(b)) return b - a;
	if (known(a)) return -1;
	if (known(b)) return 1;
	return 0;
}

/** For NewsItem-like values (`timestamp`, NaN when unknown). */
export function compareByTimestamp(a: { timestamp: Instant }, b: { timestamp: Instant }): number {
	return compareKnownNewest(a.timestamp, b.timestamp);
}

/** For normalized/snapshot items (`publishedAt` ISO string or null). */
export function compareNewest(
	a: { publishedAt: string | null },
	b: { publishedAt: string | null }
): number {
	const ms = (v: string | null) => (v === null ? null : Date.parse(v));
	return compareKnownNewest(ms(a.publishedAt), ms(b.publishedAt));
}

/**
 * Whether an item carries a trustworthy publication time — the gate for
 * "Latest reporting", recency windows and counts. Items without one stay
 * visible elsewhere as "undated". RSS items say so explicitly
 * (publishedAtStatus); other adapters are judged by a finite timestamp.
 */
export function hasKnownPublicationTime(item: {
	publishedAtStatus?: PublishedAtStatus;
	timestamp: Instant;
}): boolean {
	return item.publishedAtStatus !== undefined
		? item.publishedAtStatus === 'valid' && known(item.timestamp)
		: known(item.timestamp);
}
