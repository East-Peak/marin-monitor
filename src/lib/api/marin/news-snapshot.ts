/**
 * Browser reader of GET /api/news/snapshot (TV slice 3; the dashboard at G2).
 * The server serves only a strictly validated snapshot. The browser checks
 * the body again (a cached body can predate a deploy; a gateway can answer
 * with HTML) and converts public items to the stores' NewsItem.
 * Never throws: every failure is an honest NewsSnapshotResponse. One
 * deadline covers the request AND the body (fetchWithTimeout stops timing at
 * the headers, which let a stalled body wedge a TV refresh — Codex r1 #6).
 */
import type { NewsItem } from '$lib/types';
import {
	parseNewsSnapshotResponse,
	type NewsSnapshotItem,
	type NewsSnapshotResponse,
	type NewsSnapshotView
} from '$lib/news/snapshot';

export const NEWS_SNAPSHOT_URL = '/api/news/snapshot';
/** Publication and observation: three missed 15-minute producer runs. */
export const SNAPSHOT_STALE_AFTER_MS = 45 * 60_000;
/** A retained source becomes a wallboard problem after 8 missed 15-minute runs (retention lasts 48 h; /api/health alerts at 6 h). */
export const RETAINED_DEGRADED_AFTER_MS = 2 * 3_600_000;

const READ_FAILED: NewsSnapshotResponse = { status: 'unknown', reason: 'read-failed' };

export async function fetchNewsSnapshot(
	options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<NewsSnapshotResponse> {
	const { timeoutMs = 10_000, signal } = options;
	const controller = new AbortController();
	// Rejects once aborted; raced against every await so even a body stream
	// that ignores the signal cannot outlive the deadline.
	const aborted = new Promise<never>((_, reject) => {
		controller.signal.addEventListener('abort', () => reject(new Error('aborted')), {
			once: true
		});
	});
	aborted.catch(() => {});
	const abort = () => controller.abort();
	const timer = setTimeout(abort, timeoutMs);
	signal?.addEventListener('abort', abort, { once: true });
	if (signal?.aborted) abort();
	try {
		const response = await Promise.race([
			fetch(NEWS_SNAPSHOT_URL, { signal: controller.signal }),
			aborted
		]);
		const text = await Promise.race([response.text(), aborted]);
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			return response.ok ? { status: 'unknown', reason: 'invalid' } : READ_FAILED;
		}
		return parseNewsSnapshotResponse(body) ?? { status: 'unknown', reason: 'invalid' };
	} catch {
		return READ_FAILED;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', abort);
	}
}

/**
 * The stores' view of a snapshot story (the shape rss.ts builds for a feed
 * item). Location is exactly as precise as the evidence: feed coordinates →
 * an exact pin; a title-matched town → town/townSlug (placed at the static
 * MARIN_TOWNS centroid by the consumers); nothing is geocoded.
 */
export function snapshotItemToNewsItem(item: NewsSnapshotItem): NewsItem {
	return {
		id: item.id,
		title: item.title,
		link: item.link,
		pubDate: item.publishedAtRaw ?? undefined,
		publishedAtSource: item.publishedAtSource ?? undefined,
		publishedAtStatus: item.publishedAtStatus,
		timestamp: item.publishedAt === null ? Number.NaN : Date.parse(item.publishedAt),
		...(item.eventAt ? { eventAt: item.eventAt } : {}),
		description: item.summary ?? undefined,
		source: item.source,
		category: item.category,
		verification: item.verification,
		...(item.town ? { town: item.town.name, townSlug: item.town.slug } : {}),
		topics: item.topics,
		...(item.point
			? {
					lat: item.point.lat,
					lon: item.point.lon,
					locationConfidence: 'exact' as const,
					locationEvidence: 'feed coordinates'
				}
			: {})
	};
}

/**
 * What the TV's DEGRADED badge counts for the snapshot it shows. Publication
 * age (the producer ran) and observation age (a source actually fetched) are
 * separate: the producer publishes even when every fetch fails.
 */
export function snapshotProblems(view: NewsSnapshotView, nowMs: number): string[] {
	const age = (iso: string | null) => (iso === null ? Infinity : nowMs - Date.parse(iso));
	const problems: string[] = [];
	if (age(view.generatedAt) > SNAPSHOT_STALE_AFTER_MS) {
		problems.push(`news-snapshot: not published since ${view.generatedAt}`);
	}
	if (age(view.lastSuccessfulScrapeAt) > SNAPSHOT_STALE_AFTER_MS) {
		problems.push(
			`news-snapshot: no successful fetch since ${view.lastSuccessfulScrapeAt ?? 'ever'}`
		);
	}
	for (const source of view.sources) {
		if (source.status === 'failed') {
			problems.push(`news:${source.id}: ${source.lastError ?? 'failed'}`);
		} else if (
			source.status === 'retained' &&
			age(source.lastSuccessAt) > RETAINED_DEGRADED_AFTER_MS
		) {
			problems.push(`news:${source.id}: retained, last fetched ${source.lastSuccessAt}`);
		}
	}
	return problems;
}
