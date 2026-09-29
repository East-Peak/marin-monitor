/**
 * Pure pieces of one producer run: turn a fetch result into a source's own
 * items, decide each source's status with last-good retention, and assemble
 * the next revision. No I/O, no clock reads — `nowMs` is always injected.
 *
 * Retention works on each source's OWN undeduplicated collection
 * (sources[].items), never on the deduplicated public view: a story that
 * source B also carried survives B's outage even when A's copy won dedupe
 * and A later drops it.
 */
import { isLocallyRelevant } from '$lib/config/relevance';
import { dedupeItems } from '$lib/news/dedupe';
import { sourceScopedId } from '$lib/news/identity';
import { compareNewest } from '$lib/news/order';
import { FeedParseError, parseFeedXml } from '$lib/news/feed-xml';
import { normalizeEntry, type NormalizedNewsItem } from '$lib/news/normalize';
import {
	NEWS_SNAPSHOT_SCHEMA_VERSION,
	type NewsSnapshot,
	type NewsSourceItem,
	type NewsSourceStatus
} from '$lib/news/snapshot';
import type { NewsItem } from '$lib/types';
import type { BoundedFetchResult } from './bounded-fetch';
import type { NewsSource } from './sources';

export const MAX_ITEMS_PER_SOURCE = 30;
/**
 * Serialized budget for one source's items. Every item appears in both
 * snapshot views, so all sources together stay well under MAX_SNAPSHOT_BYTES:
 * one oversized feed fails (or retains) only itself, never the publication.
 */
export const MAX_SOURCE_ITEMS_BYTES = 50_000;

export type SourceIngest = { ok: true; items: NewsSourceItem[] } | { ok: false; error: string };

/** The same relevance rule the dashboard store applies (stores/news.ts). */
function isRelevant(item: NormalizedNewsItem): boolean {
	const view: NewsItem = {
		id: item.id,
		title: item.title,
		link: item.link,
		timestamp: 0,
		description: item.summary ?? undefined,
		content: item.content ?? undefined,
		source: item.source,
		category: item.category,
		verification: item.verification,
		townSlug: item.town?.slug
	};
	return isLocallyRelevant(view);
}

export function ingestFeed(
	source: NewsSource,
	fetched: BoundedFetchResult,
	nowMs: number
): SourceIngest {
	if (!fetched.ok) return { ok: false, error: `${fetched.reason}: ${fetched.detail}` };
	let entries;
	try {
		entries = parseFeedXml(fetched.text).entries;
	} catch (err) {
		if (err instanceof FeedParseError) return { ok: false, error: `parse: ${err.message}` };
		throw err;
	}
	const ctx = {
		sourceId: source.id,
		source: source.name,
		category: source.category,
		verification: source.verification,
		assumedTimeZone: source.assumedTimeZone,
		pubDateMeaning: source.pubDateMeaning
	};
	const fetchedAt = new Date(nowMs).toISOString();
	const items: NewsSourceItem[] = [];
	for (const entry of entries) {
		const normalized = normalizeEntry(entry, ctx, nowMs);
		if (!normalized || !isRelevant(normalized)) continue;
		const { content: _content, ...rest } = normalized;
		// A GUID is unique only within its own feed: namespace it by source.
		items.push({ ...rest, id: sourceScopedId(source.id, rest.id), fetchedAt });
	}
	// Newest first regardless of feed order, then cap.
	const kept = items.sort(compareNewest).slice(0, MAX_ITEMS_PER_SOURCE);
	const bytes = new TextEncoder().encode(JSON.stringify(kept)).byteLength;
	if (bytes > MAX_SOURCE_ITEMS_BYTES) {
		return {
			ok: false,
			error: `too-large: items are ${bytes} bytes (max ${MAX_SOURCE_ITEMS_BYTES})`
		};
	}
	return { ok: true, items: kept };
}

/**
 * Success replaces the source's items. Failure keeps its previous items
 * (status 'retained') while its last success is younger than retainMaxAgeMs;
 * after that the source is 'failed' and contributes nothing.
 */
export function resolveSource(
	source: NewsSource,
	ingest: SourceIngest,
	previous: NewsSourceStatus | undefined,
	nowMs: number,
	retainMaxAgeMs: number
): NewsSourceStatus {
	const now = new Date(nowMs).toISOString();
	const base = {
		id: source.id,
		name: source.name,
		category: source.category,
		verification: source.verification,
		lastAttemptAt: now
	};
	if (ingest.ok) {
		return {
			...base,
			status: ingest.items.length > 0 ? 'ok' : 'empty',
			lastSuccessAt: now,
			lastError: null,
			consecutiveFailures: 0,
			itemCount: ingest.items.length,
			items: ingest.items
		};
	}
	const lastSuccessAt = previous?.lastSuccessAt ?? null;
	const retainable =
		lastSuccessAt !== null &&
		nowMs - Date.parse(lastSuccessAt) <= retainMaxAgeMs &&
		(previous?.items.length ?? 0) > 0;
	const items = retainable ? (previous?.items ?? []) : [];
	return {
		...base,
		status: retainable ? 'retained' : 'failed',
		lastSuccessAt,
		lastError: ingest.error,
		consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
		itemCount: items.length,
		items
	};
}

export function buildSnapshot(
	previous: { revision: number; lastSuccessfulScrapeAt: string | null },
	sourceStatuses: readonly NewsSourceStatus[],
	sources: readonly NewsSource[],
	nowMs: number
): NewsSnapshot {
	const generatedAt = new Date(nowMs).toISOString();
	const priority = new Map(sources.map((s) => [s.id, s.priority]));
	// Success this run ⇔ consecutiveFailures reset to 0 (per-source clocks differ).
	const anySuccess = sourceStatuses.some((s) => s.consecutiveFailures === 0);
	return {
		schemaVersion: NEWS_SNAPSHOT_SCHEMA_VERSION,
		revision: previous.revision + 1,
		generatedAt,
		lastSuccessfulScrapeAt: anySuccess ? generatedAt : previous.lastSuccessfulScrapeAt,
		sources: [...sourceStatuses],
		items: dedupeItems(
			sourceStatuses.flatMap((s) => s.items),
			(id) => priority.get(id) ?? Number.MAX_SAFE_INTEGER
		)
	};
}
