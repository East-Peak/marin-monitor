/**
 * An offer's end, enforced where the budget is read (Codex R2 P1): /cost and
 * the card serve the stored weekly prices, so a lease whose offer ended since
 * the run must read unavailable now, not at the next run.
 *
 * When the stored budget was priced by the sheet and method in code, it is
 * priced again by the same engine, from its own stored reads, as of its own
 * run, with the ended offer unavailable: exactly what the run would have said.
 * Otherwise the ended lines are dropped by hand and break-even is withheld,
 * since it cannot be recomputed without the engine.
 */
import type {
	HouseholdSheet,
	LiveKey,
	LiveRead,
	LiveReads,
	PricedBudget,
	PricedInput,
	PricedLine
} from './model';
import { METHOD_VERSION, offerEnded, priceSheet } from './price';

const ended = (i: PricedInput, now: Date) =>
	i.class === 'live' &&
	i.availability !== 'unavailable' &&
	i.validUntil !== undefined &&
	offerEnded(i.validUntil, now);

const endedReason = (i: PricedInput) => `offer ended ${i.validUntil}`;

/** A stored live input as the read it was priced from; an ended offer reads unavailable. */
function asRead(i: PricedInput, now: Date): LiveRead {
	const read: LiveRead = {
		availability: i.availability,
		value: i.value,
		observedAt: i.asOf,
		maxAgeDays: i.maxAgeDays ?? 0,
		source: i.source ?? i.label,
		...(i.reason ? { reason: i.reason } : {}),
		...(i.period ? { period: i.period } : {}),
		...(i.checkedAt ? { checkedAt: i.checkedAt } : {}),
		...(i.validUntil ? { validUntil: i.validUntil } : {})
	};
	return ended(i, now)
		? {
				...read,
				availability: 'unavailable',
				value: null,
				observedAt: null,
				reason: endedReason(i)
			}
		: read;
}

function repriced(b: PricedBudget, sheet: HouseholdSheet, now: Date): PricedBudget {
	const reads: Partial<Record<LiveKey, LiveRead>> = {};
	for (const spec of sheet.lines) {
		const line = b.lines.find((l) => l.id === spec.id);
		for (const [name, input] of Object.entries(spec.inputs)) {
			const priced = line?.inputs.find((i) => i.name === name);
			if (input.class === 'live' && priced) reads[input.live] = asRead(priced, now);
			// A preferred read that was used is repriced from; one that was not leaves the citation.
			if (input.class === 'cited' && input.prefer && priced?.class === 'live')
				reads[input.prefer] = asRead(priced, now);
		}
	}
	if (sheet.marketTracker.class === 'live') {
		reads[sheet.marketTracker.live] = asRead(b.marketTracker, now);
	}
	return priceSheet(sheet, reads as LiveReads, new Date(b.pricedAt));
}

function dropped(b: PricedBudget, now: Date): PricedBudget {
	const sections = { ...b.sections };
	let burn = b.burnMonthly;
	let complete = b.complete;
	const lines = b.lines.map((l): PricedLine => {
		if (!l.inputs.some((i) => ended(i, now))) return l;
		const first = l.inputs.find((i) => ended(i, now))!;
		if (l.monthly !== null) {
			burn -= l.monthly;
			sections[l.section] = (sections[l.section] ?? 0) - l.monthly;
		}
		if (l.required) complete = false;
		return {
			...l,
			monthly: null,
			availability: 'unavailable',
			reason: endedReason(first),
			inputs: l.inputs.map((i) =>
				ended(i, now)
					? { ...i, value: null, availability: 'unavailable', asOf: null, reason: endedReason(i) }
					: i
			)
		};
	});
	return { ...b, lines, sections, burnMonthly: burn, complete, breakEven: null };
}

/**
 * A cited figure whose own end has passed (a hand-entered offer) is stale at
 * read time too: the figure stays, as it always did past its end, but a budget
 * priced while it still ran never reads fresh after it.
 */
const endedCited = (i: PricedInput, now: Date) =>
	i.class === 'cited' &&
	i.availability === 'ok' &&
	i.validUntil !== undefined &&
	offerEnded(i.validUntil, now);

const RANK = { unavailable: 0, stale: 1, ok: 2 } as const;

function staled(b: PricedBudget, now: Date): PricedBudget {
	if (!b.lines.some((l) => l.inputs.some((i) => endedCited(i, now)))) return b;
	return {
		...b,
		lines: b.lines.map((l): PricedLine => {
			if (!l.inputs.some((i) => endedCited(i, now))) return l;
			const inputs = l.inputs.map((i) =>
				endedCited(i, now)
					? { ...i, availability: 'stale' as const, reason: `past ${i.validUntil}` }
					: i
			);
			const availability = inputs.reduce<PricedLine['availability']>(
				(w, i) => (RANK[i.availability] < RANK[w] ? i.availability : w),
				'ok'
			);
			return { ...l, inputs, availability };
		})
	};
}

export function withOfferEnds(
	budgets: readonly PricedBudget[],
	sheets: readonly HouseholdSheet[],
	now: Date
): PricedBudget[] {
	return budgets.map((priced) => {
		const b = staled(priced, now);
		if (!b.lines.some((l) => l.inputs.some((i) => ended(i, now)))) return b;
		const sheet = sheets.find((s) => s.id === b.town);
		return sheet && sheet.version === b.sheetVersion && b.methodVersion === METHOD_VERSION
			? repriced(b, sheet, now)
			: dropped(b, now);
	});
}

/**
 * Cache-Control for a response built from these budgets: never fresh, or
 * served stale, past the first offer still running in them, so a cached page
 * cannot show a lease after its offer ends (Codex).
 */
export function offerCacheControl(
	budgets: readonly PricedBudget[],
	now: Date,
	sMaxAge: number,
	staleWhileRevalidate: number
): string {
	const ends = budgets.flatMap((b) =>
		b.lines.flatMap((l) =>
			l.inputs.flatMap((i) =>
				(i.class === 'live' || i.class === 'cited') &&
				i.availability !== 'unavailable' &&
				i.validUntil &&
				!offerEnded(i.validUntil, now)
					? [Date.parse(`${i.validUntil}T23:59:59.999Z`)]
					: []
			)
		)
	);
	const left = ends.length
		? Math.max(0, Math.floor((Math.min(...ends) - now.getTime()) / 1000))
		: Infinity;
	if (left === 0) return 'private, no-store';
	const fresh = Math.min(sMaxAge, left);
	const stale = Math.max(0, Math.min(staleWhileRevalidate, left - fresh));
	return `public, s-maxage=${fresh}, stale-while-revalidate=${stale}`;
}
