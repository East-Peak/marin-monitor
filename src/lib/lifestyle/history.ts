/**
 * The Lifestyle Index's history: one entry per town per run, carrying its
 * model identity (sheet version, method version, tax year) so that movers
 * only ever compare like with like.
 */
import type { Availability, PricedBudget } from './model';

export interface HistoryLine {
	readonly id: string;
	readonly monthly: number | null;
	/** Absent in entries written before LIFE3: such a line never pairs, so never moves. */
	readonly availability?: Availability;
	/** Each input's value and observation time (live) or check date (cited); persona has none. */
	readonly inputs: Readonly<Record<string, readonly [value: number | null, asOf: string | null]>>;
}

export interface HistoryEntry {
	readonly runId: string;
	readonly pricedAt: string;
	readonly town: string;
	readonly sheetVersion: string;
	readonly methodVersion: string;
	readonly taxYear: number;
	readonly burnMonthly: number;
	readonly complete: boolean;
	readonly breakEven: number | null;
	readonly lines: readonly HistoryLine[];
	/** The persona inputs, by line: a line moves only if these held still. */
	readonly quantities: Readonly<Record<string, string>>;
}

export function historyEntry(b: PricedBudget, runId: string): HistoryEntry {
	return {
		runId,
		pricedAt: b.pricedAt,
		town: b.town,
		sheetVersion: b.sheetVersion,
		methodVersion: b.methodVersion,
		taxYear: b.taxYear,
		burnMonthly: b.burnMonthly,
		complete: b.complete,
		breakEven: b.breakEven?.gross ?? null,
		lines: b.lines.map((l) => ({
			id: l.id,
			monthly: l.monthly,
			availability: l.availability,
			inputs: Object.fromEntries(l.inputs.map((i) => [i.name, [i.value, i.asOf] as const]))
		})),
		quantities: Object.fromEntries(
			b.lines.map((l) => [
				l.id,
				JSON.stringify(l.inputs.filter((i) => i.class === 'persona').map((i) => [i.name, i.value]))
			])
		)
	};
}

/** New entries first; a retried run replaces its earlier entries; each town keeps `perTown`. */
export function mergeHistory(
	existing: readonly HistoryEntry[],
	fresh: readonly HistoryEntry[],
	perTown: number
): HistoryEntry[] {
	const replaced = new Set(fresh.map((e) => `${e.town}\u0000${e.runId}`));
	const all = [...fresh, ...existing.filter((e) => !replaced.has(`${e.town}\u0000${e.runId}`))];
	const kept = new Map<string, number>();
	return all.filter((e) => {
		const n = (kept.get(e.town) ?? 0) + 1;
		kept.set(e.town, n);
		return n <= perTown;
	});
}

export type Comparison =
	| { readonly comparable: false; readonly reason: 'not enough comparable history' }
	| {
			readonly comparable: true;
			readonly moves: readonly {
				id: string;
				before: number;
				after: number;
				change: number;
			}[];
			/** Lines in the later run that could not be paired: while any are, "nothing moved" is not said. */
			readonly unpaired: number;
	  };

const NOT_COMPARABLE = { comparable: false, reason: 'not enough comparable history' } as const;

/**
 * Line moves between two runs of the same town, sheet version, method version
 * and tax year. A line counts only if it was priced from ok inputs in both runs
 * and its quantities are on record and held still, so a move is always an
 * observed price moving.
 */
export function compareRuns(before: HistoryEntry | null, after: HistoryEntry): Comparison {
	if (
		!before ||
		before.town !== after.town ||
		before.sheetVersion !== after.sheetVersion ||
		before.methodVersion !== after.methodVersion ||
		before.taxYear !== after.taxYear
	) {
		return NOT_COMPARABLE;
	}
	const earlier = new Map(before.lines.map((l) => [l.id, l]));
	const pairs = after.lines.flatMap((l) => {
		const prior = earlier.get(l.id);
		if (!prior || prior.monthly === null || l.monthly === null) return [];
		if (prior.availability !== 'ok' || l.availability !== 'ok') return [];
		const q = after.quantities[l.id];
		if (typeof q !== 'string' || before.quantities[l.id] !== q) return [];
		return [{ id: l.id, before: prior.monthly, after: l.monthly }];
	});
	// No line pair to compare is no comparable history, not "nothing moved".
	if (pairs.length === 0) return NOT_COMPARABLE;
	const moves = pairs
		.filter((p) => p.after !== p.before)
		.map((p) => ({ ...p, change: p.after - p.before }));
	return { comparable: true, moves, unpaired: after.lines.length - pairs.length };
}
