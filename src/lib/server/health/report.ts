/**
 * Reads what blob storage currently holds for every inventory source and
 * evaluates it. The single entry point for /api/health and check-freshness.
 */
import { BlobNotFoundError } from '@vercel/blob';
import { readBlobFreshnessTimestamp } from '$lib/server/blob-freshness';
import { evaluate, type HealthReport, type Observation, type SourcePolicy } from './evaluate';
import { KNOWN_SUBSOURCE_FAILURES, SOURCE_INVENTORY } from './inventory';

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

export async function buildHealthReport(token: string, now: Date): Promise<HealthReport> {
	const observations = Object.fromEntries(
		await Promise.all(
			SOURCE_INVENTORY.map(async (policy) => [policy.name, await observe(policy, token)] as const)
		)
	);
	return evaluate(
		{ sources: SOURCE_INVENTORY, subsourceFailures: KNOWN_SUBSOURCE_FAILURES },
		observations,
		now
	);
}

/** Blob key per source — internal diagnostics for authenticated callers only. */
export function inventoryBlobKeys(): Record<string, string> {
	return Object.fromEntries(SOURCE_INVENTORY.map((s) => [s.name, s.blobKey]));
}
