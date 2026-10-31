/**
 * The Marin Lately band (desktop Goal 4): satire, clearly labelled, from the news snapshot's
 * own Marin Lately items. It is a featured slot, so it shows only while it has something
 * recent: the newest piece at most 30 days old at `now` (DASH-FLIP1). Otherwise, or with no
 * read snapshot, there is no band at all.
 */
import { parseFeedDate } from '$lib/news/feed-date';
import type { NewsSnapshotView } from '$lib/news/snapshot';
import { measuredFromEntry, measuredUnknown, type Measured } from './measured';
import { PACIFIC } from './pacific-time';
import type { SourceStatusEntry } from './source-status';

export const LATELY_SOURCE = 'Marin Lately';
export const LATELY_FEED_ID = 'news:marin-lately';
export const LATELY_LINK = 'https://www.marinlately.com/';
const LATELY_MAX = 6;
/** The band's recency window: a newest piece older than this hides it. */
const LATELY_MAX_AGE_MS = 30 * 86_400_000;
const FEED_LABEL = 'marinlately.com feed';
/** Newsletter housekeeping ("Quick Update for Our Subscribers") is not a piece. */
const PROMO = /\bsubscribers?\b/i;

export interface LatelyPiece {
	id: string;
	title: string;
	link: string;
	summary: string | null;
	publishedAt: number;
}

export interface LatelyView {
	/** Newest first, at most six, never empty. */
	pieces: LatelyPiece[];
	/** "Latest piece Oct 10, 2026." */
	latest: string;
	/** The feed's own status. */
	source: Measured<unknown>;
}

const DAY = new Intl.DateTimeFormat('en-US', {
	timeZone: PACIFIC,
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});

export function latelyView(input: {
	view: NewsSnapshotView | null;
	sources: readonly SourceStatusEntry[];
	now: number;
}): LatelyView | null {
	const { view, sources, now } = input;
	const read = sources.find((e) => e.id === 'part:snapshot');
	const viewM = measuredFromEntry(read, view, read?.name ?? 'News snapshot', now);
	if (viewM.kind !== 'value') return null;

	const pieces = viewM.value.items
		.filter((s) => s.source === LATELY_SOURCE && !PROMO.test(s.title))
		.flatMap((s) => {
			const at = s.publishedAt ? parseFeedDate(s.publishedAt) : null;
			return at === null
				? []
				: [{ id: s.id, title: s.title, link: s.link, summary: s.summary, publishedAt: at }];
		})
		.sort((a, b) => b.publishedAt - a.publishedAt)
		.slice(0, LATELY_MAX);

	if (pieces.length === 0 || now - pieces[0].publishedAt > LATELY_MAX_AGE_MS) return null;

	const feed = sources.find((e) => e.id === LATELY_FEED_ID);
	const source: Measured<unknown> = feed
		? measuredFromEntry(feed, pieces, FEED_LABEL, now)
		: measuredUnknown(FEED_LABEL, 'not in the news snapshot');
	return { pieces, latest: `Latest piece ${DAY.format(pieces[0].publishedAt)}.`, source };
}
