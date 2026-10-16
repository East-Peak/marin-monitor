/**
 * The Marin Lately band (desktop Goal 4): satire, clearly labelled, from the news snapshot's
 * own Marin Lately items. The feed has gone quiet before, so the band says so from the newest
 * piece's date; it never hard-codes "quiet" and never guesses when the snapshot holds nothing.
 */
import { parseFeedDate } from '$lib/news/feed-date';
import type { NewsSnapshotView } from '$lib/news/snapshot';
import { mapMeasured, measuredFromEntry, measuredUnknown, type Measured } from './measured';
import { PACIFIC, pacificDate } from './pacific-time';
import type { SourceStatusEntry } from './source-status';

export const LATELY_SOURCE = 'Marin Lately';
export const LATELY_FEED_ID = 'news:marin-lately';
export const LATELY_LINK = 'https://marinlately.substack.com/';
const LATELY_MAX = 6;
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
	/** Newest first, at most six; only inside a read snapshot. */
	pieces: LatelyPiece[];
	/** "Latest piece Jan 7, 2026: the feed has been quiet for 9 months." Null with no pieces. */
	latest: string | null;
	/** "No pieces from the feed." only for a read snapshot that holds none. */
	empty: string | null;
	/** The feed's own status; marked out of date while the feed is quiet. */
	source: Measured<unknown>;
}

const DAY = new Intl.DateTimeFormat('en-US', {
	timeZone: PACIFIC,
	month: 'short',
	day: 'numeric',
	year: 'numeric'
});

/** Whole calendar months from one Pacific date to another (Jan 7 → Oct 15 is 9). */
export function monthsBetween(from: number, to: number): number {
	const [fy, fm, fd] = pacificDate(from).split('-').map(Number);
	const [ty, tm, td] = pacificDate(to).split('-').map(Number);
	const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
	return Math.max(0, months);
}

function latestWording(newest: number, now: number): { text: string; quiet: string | null } {
	const months = monthsBetween(newest, now);
	const day = DAY.format(newest);
	if (months < 1) return { text: `Latest piece ${day}.`, quiet: null };
	const span = months === 1 ? '1 month' : `${months} months`;
	return { text: `Latest piece ${day}: the feed has been quiet for ${span}.`, quiet: span };
}

export function latelyView(input: {
	view: NewsSnapshotView | null;
	sources: readonly SourceStatusEntry[];
	now: number;
}): LatelyView {
	const { view, sources, now } = input;
	const read = sources.find((e) => e.id === 'part:snapshot');
	const viewM = measuredFromEntry(read, view, read?.name ?? 'News snapshot', now);
	if (viewM.kind !== 'value')
		return { pieces: [], latest: null, empty: null, source: mapMeasured(viewM, () => null) };

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

	const feed = sources.find((e) => e.id === LATELY_FEED_ID);
	const source: Measured<unknown> = feed
		? measuredFromEntry(feed, pieces, FEED_LABEL, now)
		: measuredUnknown(FEED_LABEL, 'not in the news snapshot');
	if (pieces.length === 0) {
		// Only the feed's own fresh, successful read can say it holds nothing (Codex desk4 #3).
		const fresh = source.kind === 'value' && source.retainedAfter === null;
		return { pieces, latest: null, empty: fresh ? 'No pieces from the feed.' : null, source };
	}

	const { text, quiet } = latestWording(pieces[0].publishedAt, now);
	const marked =
		quiet && source.kind === 'value' && source.retainedAfter === null
			? { ...source, retainedAfter: `no new piece in ${quiet}` }
			: source;
	return { pieces, latest: text, empty: null, source: marked };
}
