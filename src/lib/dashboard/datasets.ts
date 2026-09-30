/**
 * Dataset ownership for the v2 dashboard (spec §13.7).
 *
 * The owner (the v2 controller) loads datasets, never the panel that shows
 * them, so map pins don't depend on which sections are open.
 * - essential: brief/map essentials, loaded at start and on every refresh;
 * - inventory: full inventories, loaded only through an explicit ensure().
 * One bounded request per dataset at a time. A failure never overwrites the
 * store: its last good value stays, with the observation time it came with.
 */
import { writable, type Readable } from 'svelte/store';
import { boundedOp, DEFAULT_OP_DEADLINE_MS } from '$lib/api/marin/bounded-op';
import type { FetchResult } from '$lib/api/marin/data-fetcher';
import type { DatasetFetch } from './source-adapters';
import { parseObservedAt } from './source-status';

export type DatasetTier = 'essential' | 'inventory';

export interface DatasetDef<T = unknown> {
	id: string;
	name: string;
	tier: DatasetTier;
	load: (signal: AbortSignal) => Promise<FetchResult<T>>;
	commit: (data: T) => void;
	/** The value's own observation time (e.g. `current.lastSuccessfulScrapeAt`). */
	observedAtOf: (data: T) => unknown;
	/** The G0a freshness policy for this dataset; null = no age rule. */
	maxAgeMs: number | null;
}

export interface DatasetRegistry {
	ensure(id: string): Promise<void>;
	refresh(tier: DatasetTier): Promise<void>;
	outcomes: Readable<Readonly<Record<string, DatasetFetch>>>;
}

/** Erases the data type so differently typed datasets share one list. */
export function dataset<T>(def: DatasetDef<T>): DatasetDef {
	return def as unknown as DatasetDef;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createDatasetRegistry(
	defs: readonly DatasetDef[],
	signal: AbortSignal,
	options: { deadlineMs?: number } = {}
): DatasetRegistry {
	const deadlineMs = options.deadlineMs ?? DEFAULT_OP_DEADLINE_MS;
	const byId = new Map(defs.map((d) => [d.id, d]));
	const inFlight = new Map<string, Promise<void>>();
	const attempted = new Set<string>();
	/** The observation time of the value each store currently holds, if this registry wrote it. */
	const retainedAt = new Map<string, number | null>();
	const outcomes = writable<Record<string, DatasetFetch>>({});

	function load(def: DatasetDef): Promise<void> {
		const running = inFlight.get(def.id);
		if (running) return running;
		if (signal.aborted) return Promise.resolve();
		attempted.add(def.id);
		const run = (async () => {
			let result: FetchResult<unknown>;
			try {
				result = await boundedOp(`dataset ${def.id}`, (s) => def.load(s), {
					owner: signal,
					timeoutMs: deadlineMs
				});
			} catch (err) {
				result = { ok: false, error: message(err), fallback: undefined };
			}
			if (signal.aborted) return;
			let outcome: DatasetFetch;
			if (result.ok) {
				const observedAt = parseObservedAt(def.observedAtOf(result.data));
				def.commit(result.data);
				retainedAt.set(def.id, observedAt);
				outcome =
					result.dataSource === 'live'
						? { kind: 'live', observedAt }
						: { kind: 'fallback', dataSource: result.dataSource, observedAt };
			} else {
				outcome = {
					kind: 'failed',
					error: result.error,
					retained: retainedAt.has(def.id),
					observedAt: retainedAt.get(def.id) ?? null
				};
			}
			outcomes.update((all) => ({ ...all, [def.id]: outcome }));
		})().finally(() => inFlight.delete(def.id));
		inFlight.set(def.id, run);
		return run;
	}

	return {
		ensure(id) {
			const def = byId.get(id);
			if (!def) return Promise.reject(new Error(`unknown dataset: ${id}`));
			const running = inFlight.get(id);
			if (running) return running;
			return attempted.has(id) ? Promise.resolve() : load(def);
		},
		async refresh(tier) {
			const due = defs.filter(
				(d) => d.tier === tier && (tier === 'essential' || attempted.has(d.id))
			);
			await Promise.all(due.map(load));
		},
		outcomes: { subscribe: outcomes.subscribe }
	};
}
