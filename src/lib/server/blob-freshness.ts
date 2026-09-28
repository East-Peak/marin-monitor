import { head } from '@vercel/blob';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { readSuccessfulScrapeAt, type ScrapeMetadataValue } from './scrape-metadata';

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asScrapeMetadataValue(value: unknown): ScrapeMetadataValue | null {
	return isJsonRecord(value) ? (value as ScrapeMetadataValue) : null;
}

const asString = (value: unknown) => (typeof value === 'string' ? value : null);

/**
 * Once a writer records scrape metadata (`lastSuccessfulScrapeAt`, or the
 * legacy `lastLiveScrapeAt`), that is authoritative: null means no live scrape
 * has succeeded, and it must not fall back to `lastUpdated`.
 */
function readObservedAt(value: unknown): string | null | undefined {
	if (!isJsonRecord(value)) return undefined;
	if ('lastSuccessfulScrapeAt' in value || 'lastLiveScrapeAt' in value) {
		return asString(value.lastSuccessfulScrapeAt) ?? asString(value.lastLiveScrapeAt);
	}
	return readSuccessfulScrapeAt(asScrapeMetadataValue(value)) ?? undefined;
}

export function extractBlobFreshnessTimestamp(data: unknown): string | null {
	if (!isJsonRecord(data)) return null;

	const current = readObservedAt(data.current);
	if (current !== undefined) return current;
	return readObservedAt(data) ?? null;
}

/**
 * Read freshness timestamp for a blob.
 *
 * Two distinct semantics:
 *
 * - **Manual datasets** (preferContent=false): the blob is a snapshot whose
 *   freshness IS its upload time. Returns lastUpdated = uploadedAt.
 *
 * - **Live-scrape datasets** (preferContent=true): freshness is whatever
 *   `lastSuccessfulScrapeAt` is embedded in the content. If the content has
 *   no metadata, or the fetch fails, lastUpdated is null. We never substitute
 *   uploadedAt for missing scrape metadata — that would lie about whether a
 *   live scrape actually succeeded.
 */
export async function readBlobFreshnessTimestamp(
	blobKey: string,
	token: string,
	options: {
		preferContent?: boolean;
		timeoutMs?: number;
	} = {}
): Promise<{ uploadedAt: string | null; lastUpdated: string | null }> {
	const blob = await head(blobKey, { token });
	const uploadedAt = blob.uploadedAt?.toISOString() ?? null;

	if (!options.preferContent) {
		return { uploadedAt, lastUpdated: uploadedAt };
	}

	try {
		const response = await fetchWithTimeout(
			blob.downloadUrl,
			{ headers: { Authorization: `Bearer ${token}` } },
			options.timeoutMs ?? 8000
		);

		if (!response.ok) {
			return { uploadedAt, lastUpdated: null };
		}

		const data = await response.json();
		return { uploadedAt, lastUpdated: extractBlobFreshnessTimestamp(data) };
	} catch {
		return { uploadedAt, lastUpdated: null };
	}
}
