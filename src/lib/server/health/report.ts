/**
 * Reads what blob storage currently holds for every inventory source and
 * evaluates it. The single entry point for /api/health and check-freshness.
 */
import { BlobNotFoundError } from '@vercel/blob';
import { readBlobFreshnessTimestamp } from '$lib/server/blob-freshness';
import {
	evaluate,
	type HealthReport,
	type Observation,
	type SourcePolicy,
	type SubsourceFailure
} from './evaluate';
import { ACCEPTED_EXCEPTIONS, KNOWN_SUBSOURCE_FAILURES, SOURCE_INVENTORY } from './inventory';
import { NEWS_SNAPSHOT_SOURCE, readNewsHealthFromBlob } from '$lib/server/news/health';

async function observe(policy: SourcePolicy, token: string): Promise<Observation> {
	try {
		const { uploadedAt, lastUpdated } = await readBlobFreshnessTimestamp(policy.blobKey, token, {
			preferContent: policy.observedAt === 'content'
		});
		return {
			kind: 'found',
			uploadedAt,
			contentTimestamp: policy.observedAt === 'content' ? lastUpdated : null
		};
	} catch (error) {
		return error instanceof BlobNotFoundError ? { kind: 'missing' } : { kind: 'error' };
	}
}

/** Declared failures first; a live failure already declared by name is not repeated. */
function mergeSubsourceFailures(
	declared: readonly SubsourceFailure[],
	live: readonly SubsourceFailure[]
): SubsourceFailure[] {
	const names = new Set(declared.map((f) => f.name));
	return [...declared, ...live.filter((f) => !names.has(f.name))];
}

export async function buildHealthReport(token: string, now: Date): Promise<HealthReport> {
	// The news snapshot is observed through its own validated read (one read
	// for freshness AND feed failures), never by timestamp alone.
	const [entries, news] = await Promise.all([
		Promise.all(
			SOURCE_INVENTORY.filter((policy) => policy.name !== NEWS_SNAPSHOT_SOURCE).map(
				async (policy) => [policy.name, await observe(policy, token)] as const
			)
		),
		readNewsHealthFromBlob(token, now)
	]);
	return evaluate(
		{
			sources: SOURCE_INVENTORY,
			subsourceFailures: mergeSubsourceFailures(KNOWN_SUBSOURCE_FAILURES, news.failures),
			exceptions: ACCEPTED_EXCEPTIONS
		},
		{ ...Object.fromEntries(entries), [NEWS_SNAPSHOT_SOURCE]: news.observation },
		now
	);
}

/** Blob key per source — internal diagnostics for authenticated callers only. */
export function inventoryBlobKeys(): Record<string, string> {
	return Object.fromEntries(SOURCE_INVENTORY.map((s) => [s.name, s.blobKey]));
}
