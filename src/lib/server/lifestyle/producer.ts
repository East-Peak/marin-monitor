/**
 * The Lifestyle Index's scheduled run: read our live inputs, price every
 * household, and add the run to its history, on a new blob key beside the
 * old composite.
 *
 * - A history read that fails, or a history we cannot parse, aborts the run:
 *   it never overwrites history with an empty one.
 * - The write is a compare-and-swap on what was read, so an overlapping run
 *   cannot overwrite newer data; a retried run replaces its own entries.
 * - An input that cannot be read is unavailable, never an abort: the budget
 *   says what is missing.
 */
import { priceAnchors, type Anchor } from '$lib/lifestyle/anchors';
import { historyEntry, mergeHistory, type HistoryEntry } from '$lib/lifestyle/history';
import type { HouseholdSheet, LiveReads, PricedBudget } from '$lib/lifestyle/model';
import { priceSheet } from '$lib/lifestyle/price';
import { BlobWriteConflict, type BlobApi } from '$lib/server/news/snapshot-store';
import { LIVE_BLOBS, readLive, type LiveBlobName, type RawLiveBlobs } from './live';

export const LIFESTYLE_KEY = 'lifestyle/v1/index.json';
/** A year of weekly runs per town (an entry is ~8 KB; health reads the whole blob). */
export const HISTORY_PER_TOWN = 52;

export interface LifestyleSnapshot {
	readonly schema: 1;
	readonly runId: string;
	readonly computedAt: string;
	/** The last run with every budget complete on in-date live reads: what /api/health watches. */
	readonly lastSuccessfulScrapeAt: string | null;
	readonly anchors: readonly Anchor[];
	readonly budgets: readonly PricedBudget[];
}

export interface LifestyleDoc {
	readonly current: LifestyleSnapshot | null;
	readonly history: readonly HistoryEntry[];
}

export type RunResult =
	| {
			readonly outcome: 'written';
			readonly runId: string;
			readonly towns: readonly {
				town: string;
				burnMonthly: number;
				complete: boolean;
				breakEven: number | null;
			}[];
	  }
	| { readonly outcome: 'aborted'; readonly reason: 'history read failed' | 'history unreadable' }
	| { readonly outcome: 'conflict' };

export interface RunDeps {
	readonly api: BlobApi;
	/** A live input blob's parsed JSON, or null; a throw counts as null. */
	readonly readInput: (key: string, signal: AbortSignal) => Promise<unknown>;
	readonly sheets: readonly HouseholdSheet[];
	readonly now: Date;
	readonly runId: string;
	readonly signal: AbortSignal;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** An entry with its model identity, lines and quantities: what movers rely on. */
export function isEntry(e: unknown): e is HistoryEntry {
	return (
		isObject(e) &&
		['runId', 'town', 'sheetVersion', 'methodVersion', 'pricedAt'].every(
			(k) => typeof e[k] === 'string'
		) &&
		typeof e.taxYear === 'number' &&
		Array.isArray(e.lines) &&
		e.lines.every((l) => isObject(l) && typeof l.id === 'string' && isObject(l.inputs)) &&
		isObject(e.quantities)
	);
}

function parseDoc(text: string): LifestyleDoc | null {
	try {
		const doc = JSON.parse(text) as unknown;
		if (!isObject(doc) || !Array.isArray(doc.history) || !doc.history.every(isEntry)) return null;
		if (doc.current !== null && !isObject(doc.current)) return null;
		return doc as unknown as LifestyleDoc;
	} catch {
		return null;
	}
}

const DAY_MS = 86_400_000;

/**
 * A run succeeds when every budget is complete and every live read is
 * available and observed inside its own max age. A labelled fallback inside a
 * fresh run (a grocery reference price) reads stale on its line but is not a
 * pipeline failure; nor is a cited figure past its re-check, which is a
 * re-check chore shown on the page.
 */
function succeeded(budgets: readonly PricedBudget[], live: LiveReads, now: Date): boolean {
	const fresh = Object.values(live).every((r) => {
		const at = r.observedAt === null ? NaN : Date.parse(r.observedAt);
		return r.availability !== 'unavailable' && now.getTime() - at <= r.maxAgeDays * DAY_MS;
	});
	return fresh && budgets.every((b) => b.complete);
}

async function readInputs(deps: RunDeps): Promise<RawLiveBlobs> {
	const names = Object.keys(LIVE_BLOBS) as LiveBlobName[];
	const values = await Promise.all(
		names.map((name) => deps.readInput(LIVE_BLOBS[name], deps.signal).catch(() => null))
	);
	return Object.fromEntries(names.map((name, i) => [name, values[i] ?? null])) as RawLiveBlobs;
}

export async function runLifestyle(deps: RunDeps): Promise<RunResult> {
	let stored: { text: string; etag: string } | null;
	try {
		stored = await deps.api.read(LIFESTYLE_KEY, deps.signal);
	} catch {
		return { outcome: 'aborted', reason: 'history read failed' };
	}
	const previous = stored ? parseDoc(stored.text) : { current: null, history: [] };
	if (!previous) return { outcome: 'aborted', reason: 'history unreadable' };

	const live = readLive(await readInputs(deps), deps.now);
	const budgets = deps.sheets.map((sheet) => priceSheet(sheet, live, deps.now));
	const computedAt = deps.now.toISOString();
	const current: LifestyleSnapshot = {
		schema: 1,
		runId: deps.runId,
		computedAt,
		lastSuccessfulScrapeAt: succeeded(budgets, live, deps.now)
			? computedAt
			: (previous.current?.lastSuccessfulScrapeAt ?? null),
		anchors: priceAnchors(deps.now),
		budgets
	};
	const history = mergeHistory(
		previous.history,
		budgets.map((b) => historyEntry(b, deps.runId)),
		HISTORY_PER_TOWN
	);
	const body = JSON.stringify({ current, history } satisfies LifestyleDoc);

	try {
		await deps.api.write(
			LIFESTYLE_KEY,
			body,
			stored ? { ifMatch: stored.etag } : { createOnly: true },
			deps.signal
		);
	} catch (err) {
		if (err instanceof BlobWriteConflict) return { outcome: 'conflict' };
		throw err;
	}
	return {
		outcome: 'written',
		runId: deps.runId,
		towns: budgets.map((b) => ({
			town: b.town,
			burnMonthly: b.burnMonthly,
			complete: b.complete,
			breakEven: b.breakEven?.gross ?? null
		}))
	};
}
