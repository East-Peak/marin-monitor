/**
 * The one scheduled news producer (TV spec Principle 1; Codex tv-r1 #1–#3).
 *
 * Everything runs inside ONE invocation deadline (deps.deadlineAt), fixed
 * before the lease is taken and carved up as:
 *   lease + read  → each ≤ blobOpMs, and never into the publish reserve
 *   upstream fetch → until deadlineAt − publishReserveMs
 *   publish        → ≤ blobOpMs, and never into the release reserve
 *   lease release  → whatever is left (≤ blobOpMs); failure is reported, not thrown
 *
 * 1. Take the lease, or skip (an overlapping invocation does no upstream work).
 * 2. Read the previous revision, its ETag and every source's last-good items.
 * 3. Fetch every source with bounded concurrency.
 * 4. Resolve per-source status with last-good retention; build revision N+1.
 * 5. Publish with compare-and-swap on the ETag read in step 2 — a run that
 *    lost a race is 'superseded' and publishes nothing.
 * 6. Release the lease (conditional delete: never someone else's).
 *
 * Feed-native content only: no article fetching and no geocoding here.
 */
import { createDeadline } from './abortable';
import type { BoundedFetchResult } from './bounded-fetch';
import { buildSnapshot, ingestFeed, resolveSource } from './ingest';
import { snapshotBytes, type SnapshotStore } from './snapshot-store';
import type { NewsSource } from './sources';

export interface ProducerLimits {
	concurrency: number;
	/** Must exceed the function's maxDuration so a live run is never pre-empted. */
	leaseMs: number;
	retainMaxAgeMs: number;
	/** Ceiling for any single Blob operation. */
	blobOpMs: number;
	/** Time kept free after fetching for publish + release. */
	publishReserveMs: number;
	/** Time kept free after publishing for the lease release. */
	releaseReserveMs: number;
}

export const PRODUCER_LIMITS: ProducerLimits = {
	concurrency: 6,
	leaseMs: 120_000,
	retainMaxAgeMs: 48 * 3_600_000,
	blobOpMs: 8_000,
	publishReserveMs: 14_000,
	releaseReserveMs: 4_000
};

export interface ProducerDeps {
	sources: readonly NewsSource[];
	store: SnapshotStore;
	fetchFeed: (url: string, signal: AbortSignal) => Promise<BoundedFetchResult>;
	now: () => number;
	/** Absolute epoch ms by which the whole run, release included, must finish. */
	deadlineAt: number;
	runId: string;
	limits?: Partial<ProducerLimits>;
}

export type ProducerResult =
	| {
			outcome: 'published';
			revision: number;
			items: number;
			bytes: number;
			durationMs: number;
			leaseReleased: boolean;
			sources: { id: string; status: string; error: string | null }[];
	  }
	| { outcome: 'skipped-locked' }
	| { outcome: 'superseded'; revision: number; leaseReleased: boolean };

async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index]);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
	return results;
}

type Deadline = ReturnType<typeof createDeadline>;

/** Steps 2–5: read, fetch, build, publish. Throws if storage misses its deadline. */
async function produceAndPublish(deps: ProducerDeps, limits: ProducerLimits, deadline: Deadline) {
	const previous = await deps.store.read(deadline.signal(limits.blobOpMs, limits.publishReserveMs));
	const prevStatus = new Map(previous.snapshot?.sources.map((s) => [s.id, s]) ?? []);

	const fetchBudget = AbortSignal.timeout(
		Math.max(0, deadline.remaining() - limits.publishReserveMs)
	);
	const statuses = await mapWithConcurrency(deps.sources, limits.concurrency, async (source) => {
		const fetched: BoundedFetchResult = fetchBudget.aborted
			? { ok: false, reason: 'timeout', detail: 'run budget exhausted' }
			: await deps.fetchFeed(source.url, fetchBudget);
		const nowMs = deps.now();
		return resolveSource(
			source,
			ingestFeed(source, fetched, nowMs),
			prevStatus.get(source.id),
			nowMs,
			limits.retainMaxAgeMs
		);
	});

	const snapshot = buildSnapshot(
		{
			revision: previous.revision,
			lastSuccessfulScrapeAt: previous.snapshot?.lastSuccessfulScrapeAt ?? null
		},
		statuses,
		deps.sources,
		deps.now()
	);
	const outcome = await deps.store.publish(
		snapshot,
		previous.etag,
		deadline.signal(limits.blobOpMs, limits.releaseReserveMs)
	);
	return { snapshot, outcome };
}

export async function runNewsProducer(deps: ProducerDeps): Promise<ProducerResult> {
	const limits = { ...PRODUCER_LIMITS, ...deps.limits };
	const deadline = createDeadline(deps.deadlineAt, deps.now);
	const startedMs = deps.now();

	const leaseSignal = deadline.signal(limits.blobOpMs, limits.publishReserveMs);
	if (!(await deps.store.acquireLease(deps.runId, startedMs, limits.leaseMs, leaseSignal))) {
		return { outcome: 'skipped-locked' };
	}
	// A failed release never turns a finished run into an error: the lease
	// simply expires after leaseMs.
	const release = () =>
		deps.store.releaseLease(deps.runId, deadline.signal(limits.blobOpMs)).then(
			() => true,
			(err: unknown) => {
				console.warn(`[produce-news] lease release failed: ${String(err)}`);
				return false;
			}
		);

	let run: Awaited<ReturnType<typeof produceAndPublish>>;
	try {
		run = await produceAndPublish(deps, limits, deadline);
	} catch (err) {
		await release();
		throw err;
	}
	const leaseReleased = await release();
	const { snapshot } = run;
	if (run.outcome === 'conflict') {
		return { outcome: 'superseded', revision: snapshot.revision, leaseReleased };
	}
	return {
		outcome: 'published',
		revision: snapshot.revision,
		items: snapshot.items.length,
		bytes: snapshotBytes(snapshot),
		durationMs: deps.now() - startedMs,
		leaseReleased,
		sources: snapshot.sources.map((s) => ({ id: s.id, status: s.status, error: s.lastError }))
	};
}
