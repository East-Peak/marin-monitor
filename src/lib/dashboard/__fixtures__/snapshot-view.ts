/** Snapshot stories and views with the producer's real shapes, for the v2 model tests. */
import type { NewsSnapshotItem, NewsSnapshotView } from '$lib/news/snapshot';
import { fromSnapshotRead, fromSnapshotSource } from '../source-adapters';

const H = 3_600_000;
let seq = 0;

export function resetStories() {
	seq = 0;
}

export type StoryOver = Partial<NewsSnapshotItem> & { hoursAgo?: number | null };

export function story(now: number, over: StoryOver = {}): NewsSnapshotItem {
	const { hoursAgo = 1, ...rest } = over;
	seq += 1;
	const at = hoursAgo === null ? null : new Date(now - hoursAgo * H).toISOString();
	const sourceId = rest.sourceId ?? 'point-reyes-light';
	const category = rest.category ?? 'local';
	return {
		id: `${sourceId}:s${seq}`,
		sourceId,
		source: 'Point Reyes Light',
		category,
		verification: 'local_media',
		title: `Distinct headline ${seq}`,
		link: `https://news.example/s${seq}`,
		canonicalUrl: `https://news.example/s${seq}`,
		summary: null,
		publishedAt: at,
		publishedAtRaw: at,
		publishedAtSource: at ? 'rss:pubDate' : null,
		publishedAtStatus: at ? 'valid' : 'missing',
		publishedAtAssumedZone: null,
		eventAt: null,
		eventAtSource: null,
		updatedAt: null,
		fetchedAt: new Date(now).toISOString(),
		town: null,
		point: null,
		topics: [],
		categories: [category],
		alsoReportedBy: [],
		...rest
	};
}

export type SourceOver = Partial<NewsSnapshotView['sources'][number]>;

export function snapshotView(
	now: number,
	items: NewsSnapshotItem[],
	sources: SourceOver[] = [{}]
): NewsSnapshotView {
	const at = new Date(now).toISOString();
	return {
		schemaVersion: 1,
		revision: 1,
		generatedAt: at,
		lastSuccessfulScrapeAt: at,
		sources: sources.map((s) => ({
			id: 'point-reyes-light',
			name: 'Point Reyes Light',
			category: 'local',
			verification: 'local_media',
			status: 'ok',
			lastAttemptAt: at,
			lastSuccessAt: at,
			lastError: null,
			consecutiveFailures: 0,
			itemCount: 1,
			...s
		})),
		items
	};
}

/** The controller's real entries for a view after a successful read. */
export const snapshotEntries = (v: NewsSnapshotView, now: number) => [
	fromSnapshotRead({ ok: true, at: now, observedAt: null }, v),
	...v.sources.map(fromSnapshotSource)
];
