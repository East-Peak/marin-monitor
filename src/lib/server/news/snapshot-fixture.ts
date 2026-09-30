/**
 * A real published snapshot for read-path tests: the WordPress fixture run
 * through the producer's own ingest, so it satisfies parseNewsSnapshot by
 * construction (never a hand-built approximation). Test-only.
 */
import { NOW, RSS_WORDPRESS } from '$lib/news/feed-fixtures';
import type { NewsSnapshot } from '$lib/news/snapshot';
import { buildSnapshot, ingestFeed, resolveSource } from './ingest';
import type { NewsSource } from './sources';

const PRL: NewsSource = {
	id: 'point-reyes-light',
	name: 'Point Reyes Light',
	url: 'https://www.ptreyeslight.com/feed/',
	category: 'local',
	verification: 'local_media',
	priority: 0
};

export function publishedSnapshot(nowMs = NOW): NewsSnapshot {
	const fetched = { ok: true as const, text: RSS_WORDPRESS, finalUrl: PRL.url, bytes: 1 };
	const status = resolveSource(PRL, ingestFeed(PRL, fetched, nowMs), undefined, nowMs, 1);
	return buildSnapshot({ revision: 0, lastSuccessfulScrapeAt: null }, [status], [PRL], nowMs);
}
