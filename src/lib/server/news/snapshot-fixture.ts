/**
 * A real published snapshot for read-path tests: the WordPress fixture run
 * through the producer's own ingest, so it satisfies parseNewsSnapshot by
 * construction (never a hand-built approximation). Test-only.
 *
 * marinReportingSnapshot: five dated Marin stories, the SSR e2e seed
 * (tests/e2e/fixtures/news-snapshot-producer.json, written by its test).
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

function snapshotFrom(text: string, nowMs: number): NewsSnapshot {
	const fetched = { ok: true as const, text, finalUrl: PRL.url, bytes: 1 };
	const status = resolveSource(PRL, ingestFeed(PRL, fetched, nowMs), undefined, nowMs, 1);
	return buildSnapshot({ revision: 0, lastSuccessfulScrapeAt: null }, [status], [PRL], nowMs);
}

export function publishedSnapshot(nowMs = NOW): NewsSnapshot {
	return snapshotFrom(RSS_WORDPRESS, nowMs);
}

const MARIN_STORIES = [
	['San Rafael council approves Canal housing plan', 'san-rafael-housing'],
	['Mill Valley opens new trail access on Mount Tamalpais', 'mill-valley-trail'],
	['Novato schools add later start times', 'novato-schools'],
	['Sausalito ferry schedule changes this week', 'sausalito-ferry'],
	['Point Reyes Station water main repair finished', 'point-reyes-water']
] as const;

export function marinReportingSnapshot(nowMs = NOW): NewsSnapshot {
	const items = MARIN_STORIES.map(
		([title, slug], i) => `<item>
		<title>${title}</title>
		<link>https://www.ptreyeslight.com/news/${slug}/</link>
		<pubDate>${new Date(nowMs - (i + 1) * 3_600_000).toUTCString()}</pubDate>
		<guid isPermaLink="false">${slug}</guid>
		<description>${title}.</description>
	</item>`
	);
	return snapshotFrom(
		`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Point Reyes Light</title>${items.join('')}</channel></rss>`,
		nowMs
	);
}
