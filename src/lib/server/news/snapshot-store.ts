/**
 * Durable, overlap-safe storage for the news snapshot.
 *
 * - publish() is a compare-and-swap on the blob's ETag: a run can only
 *   replace the exact revision it read, so an overlapping or late run can
 *   never overwrite newer data (it gets 'conflict').
 * - The lease keeps overlapping cron invocations from doing the upstream
 *   work twice. It expires, so a crashed run cannot wedge the producer, and
 *   it is released with a conditional delete, so a run can never delete a
 *   lease that a later run has taken over.
 * - Every operation takes an AbortSignal and must reject once it aborts.
 *
 * The blob primitives are injected (BlobApi) so the same logic runs against
 * @vercel/blob in production and an in-memory double in tests.
 */
import { parseNewsSnapshot, salvageRevision, type NewsSnapshot } from '$lib/news/snapshot';

export const NEWS_SNAPSHOT_KEY = 'news/v1/snapshot.json';
export const NEWS_LEASE_KEY = 'news/v1/lease.json';
/** Hard ceiling on a published snapshot (UTF-8 bytes of JSON). */
export const MAX_SNAPSHOT_BYTES = 3_000_000;

/** A conditional write lost: the blob exists (createOnly) or its ETag moved (ifMatch). */
export class BlobWriteConflict extends Error {
	override name = 'BlobWriteConflict';
}

export type WriteCondition = { ifMatch: string } | { createOnly: true };

export interface BlobApi {
	read(key: string, signal: AbortSignal): Promise<{ text: string; etag: string } | null>;
	/** Throws BlobWriteConflict when the condition does not hold. */
	write(
		key: string,
		body: string,
		condition: WriteCondition,
		signal: AbortSignal
	): Promise<{ etag: string }>;
	/** Throws BlobWriteConflict when the ETag no longer matches. */
	remove(key: string, ifMatch: string, signal: AbortSignal): Promise<void>;
}

export interface StoredSnapshot {
	/** null when absent OR invalid (bad JSON, unknown schema, broken invariants). */
	snapshot: NewsSnapshot | null;
	/** Non-null whenever the blob exists — needed to CAS over an invalid one. */
	etag: string | null;
	/** Last published revision, salvaged from an invalid blob; 0 if none. */
	revision: number;
}

export interface SnapshotStore {
	read(signal: AbortSignal): Promise<StoredSnapshot>;
	publish(
		snapshot: NewsSnapshot,
		expectedEtag: string | null,
		signal: AbortSignal
	): Promise<'published' | 'conflict'>;
	acquireLease(
		runId: string,
		nowMs: number,
		leaseMs: number,
		signal: AbortSignal
	): Promise<boolean>;
	releaseLease(runId: string, signal: AbortSignal): Promise<void>;
}

const utf8Bytes = (text: string) => new TextEncoder().encode(text).byteLength;

/** UTF-8 size of the published JSON. */
export function snapshotBytes(snapshot: NewsSnapshot): number {
	return utf8Bytes(JSON.stringify(snapshot));
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** null for anything malformed — including a non-finite expiry (1e400 parses as Infinity). */
function parseLease(text: string): { runId: string; expiresAt: number } | null {
	const value = parseJson(text) as { runId?: unknown; expiresAt?: unknown } | null;
	return value && typeof value.runId === 'string' && Number.isFinite(value.expiresAt)
		? { runId: value.runId, expiresAt: value.expiresAt as number }
		: null;
}

async function conditional<T>(write: () => Promise<T>, onConflict: T): Promise<T> {
	try {
		return await write();
	} catch (err) {
		if (err instanceof BlobWriteConflict) return onConflict;
		throw err;
	}
}

export function createSnapshotStore(api: BlobApi): SnapshotStore {
	return {
		async read(signal) {
			const found = await api.read(NEWS_SNAPSHOT_KEY, signal);
			if (!found) return { snapshot: null, etag: null, revision: 0 };
			const raw = parseJson(found.text);
			const snapshot = parseNewsSnapshot(raw);
			return { snapshot, etag: found.etag, revision: snapshot?.revision ?? salvageRevision(raw) };
		},

		async publish(snapshot, expectedEtag, signal) {
			const body = JSON.stringify(snapshot);
			const bytes = utf8Bytes(body);
			if (bytes > MAX_SNAPSHOT_BYTES) {
				throw new Error(`snapshot is ${bytes} bytes (max ${MAX_SNAPSHOT_BYTES})`);
			}
			const condition: WriteCondition = expectedEtag
				? { ifMatch: expectedEtag }
				: { createOnly: true };
			return conditional(async () => {
				await api.write(NEWS_SNAPSHOT_KEY, body, condition, signal);
				return 'published' as const;
			}, 'conflict' as const);
		},

		async acquireLease(runId, nowMs, leaseMs, signal) {
			const body = JSON.stringify({ runId, expiresAt: nowMs + leaseMs });
			const current = await api.read(NEWS_LEASE_KEY, signal);
			if (current && (parseLease(current.text)?.expiresAt ?? 0) > nowMs) return false;
			const condition: WriteCondition = current ? { ifMatch: current.etag } : { createOnly: true };
			return conditional(async () => {
				await api.write(NEWS_LEASE_KEY, body, condition, signal);
				return true;
			}, false);
		},

		async releaseLease(runId, signal) {
			const current = await api.read(NEWS_LEASE_KEY, signal);
			if (!current || parseLease(current.text)?.runId !== runId) return;
			await conditional(() => api.remove(NEWS_LEASE_KEY, current.etag, signal), undefined);
		}
	};
}
