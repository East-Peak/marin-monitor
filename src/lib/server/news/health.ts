/**
 * News producer → G0a health, from ONE bounded, validated read of the
 * snapshot. The same read yields both:
 * - the 'News Snapshot' inventory observation: missing → unavailable;
 *   unreadable, invalid or unsupported → unknown; valid → its
 *   lastSuccessfulScrapeAt;
 * - per-feed subsource failures: a feed with no successful fetch within
 *   NEWS_SOURCE_MAX_AGE_MS (one failed run is retention's job, not an alert).
 * A snapshot that cannot be validated therefore can never look healthy.
 */
import type { NewsSnapshot } from '$lib/news/snapshot';
import type { Observation, SubsourceFailure } from '$lib/server/health/evaluate';
import { createSnapshotStore, type BlobApi } from './snapshot-store';
import { vercelBlobApi } from './vercel-blob-api';

export const NEWS_SNAPSHOT_SOURCE = 'News Snapshot';
export const NEWS_SOURCE_MAX_AGE_MS = 6 * 3_600_000;
const READ_TIMEOUT_MS = 8_000;

export interface NewsHealth {
	observation: Observation;
	failures: SubsourceFailure[];
}

export function newsSourceFailures(snapshot: NewsSnapshot, nowMs: number): SubsourceFailure[] {
	return snapshot.sources.flatMap((source) => {
		const last = source.lastSuccessAt === null ? null : Date.parse(source.lastSuccessAt);
		if (last !== null && nowMs - last <= NEWS_SOURCE_MAX_AGE_MS) return [];
		const since =
			last === null
				? 'never fetched successfully'
				: `no successful fetch since ${source.lastSuccessAt}`;
		return [
			{
				name: source.name,
				parent: 'News feeds',
				problem: `${since} (last error: ${source.lastError ?? 'none recorded'})`,
				disposition: 'Repair or retire the feed in src/lib/config/feeds.ts'
			}
		];
	});
}

export async function readNewsHealth(
	api: BlobApi,
	now: Date,
	timeoutMs = READ_TIMEOUT_MS
): Promise<NewsHealth> {
	try {
		const { snapshot, etag } = await createSnapshotStore(api).read(AbortSignal.timeout(timeoutMs));
		if (etag === null) return { observation: { kind: 'missing' }, failures: [] };
		if (snapshot === null) return { observation: { kind: 'error' }, failures: [] };
		return {
			observation: {
				kind: 'found',
				uploadedAt: null,
				contentTimestamp: snapshot.lastSuccessfulScrapeAt
			},
			failures: newsSourceFailures(snapshot, now.getTime())
		};
	} catch {
		return { observation: { kind: 'error' }, failures: [] };
	}
}

export function readNewsHealthFromBlob(token: string, now: Date): Promise<NewsHealth> {
	if (!token) return Promise.resolve({ observation: { kind: 'error' }, failures: [] });
	return readNewsHealth(vercelBlobApi(token), now);
}
