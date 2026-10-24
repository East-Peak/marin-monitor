import { describe, expect, it } from 'vitest';
import { priceAnchors, type Anchor } from './anchors';
import { historyEntry, type HistoryEntry } from './history';
import { highlightFacts, THRESHOLDS, type Fact, type HighlightContext } from './highlights';
import type { LiveKey, LiveRead, LiveReads, PricedBudget, PricedLine } from './model';
import { priceSheet } from './price';
import { SHEETS } from './sheets';

const NOW = new Date('2026-10-23T11:36:55.978Z');
const LIVE: Record<LiveKey, number> = {
	'gas.regular': 6.179,
	'coffee.cappuccino': 4.925,
	'grocery.collagen': 13.47,
	'grocery.manuka': 10.99,
	'grocery.kombucha': 4.79,
	'grocery.oatMilk': 3.99,
	'grocery.silverOak': 83.49,
	'ikon.adult': 1449,
	'rivian.lease': 1209
};
const reads = (over: Partial<Record<LiveKey, Partial<LiveRead>>> = {}) =>
	Object.fromEntries(
		Object.entries(LIVE).map(([k, value]): [string, LiveRead] => [
			k,
			{
				availability: 'ok',
				value,
				observedAt: '2026-10-23T10:00:00.000Z',
				maxAgeDays: 10,
				source: 'test',
				...over[k as LiveKey]
			}
		])
	) as LiveReads;

const budgets = (live = reads(), now = NOW) => SHEETS.map((s) => priceSheet(s, live, now));
const RUN = '2026-10-23';

function context(over: Partial<HighlightContext> = {}): HighlightContext {
	const bs = over.budgets ?? budgets();
	return {
		runId: RUN,
		budgets: bs,
		anchors: priceAnchors(NOW),
		history: bs.map((b) => historyEntry(b, RUN)),
		sheets: SHEETS,
		...over
	};
}
const of = (facts: Readonly<Record<string, readonly Fact[]>>, town: string, template: string) =>
	(facts[town] ?? []).filter((f) => f.template === template);
const one = <T extends Fact['template']>(
	facts: Readonly<Record<string, readonly Fact[]>>,
	town: string,
	template: T
) => {
	const found = of(facts, town, template);
	expect(found, `${town} ${template}`).toHaveLength(1);
	return found[0] as Extract<Fact, { template: T }>;
};

/** One budget with a line's monthly (and its section's total and the burn) set by hand. */
function withLine(b: PricedBudget, id: string, monthly: number, over: Partial<PricedLine> = {}) {
	const line = b.lines.find((l) => l.id === id)!;
	const delta = monthly - (line.monthly ?? 0);
	return {
		...b,
		lines: b.lines.map((l) => (l.id === id ? { ...l, monthly, ...over } : l)),
		sections: { ...b.sections, [line.section]: (b.sections[line.section] ?? 0) + delta },
		burnMonthly: b.burnMonthly + delta
	};
}
const anchor = (as: readonly Anchor[], id: Anchor['id'], over: Partial<Anchor>) =>
	as.map((a) => (a.id === id ? { ...a, ...over } : a));

describe('comparisons against the pre-assigned anchors', () => {
	it('each template reads only its own anchor, in its own units', () => {
		const f = highlightFacts(context());
		const be = one(f, 'larkspur', 'breakEvenVsMedian');
		expect(be.anchor).toMatchObject({ id: 'medianHouseholdIncome', units: 'gross household' });
		const earner = one(f, 'larkspur', 'earnerVsTeacher');
		expect(earner.anchor).toMatchObject({ id: 'teacherSalary', units: 'gross individual' });
		// The main earner's wage, not the household's, against one teacher's salary.
		const lark = context().budgets.find((b) => b.town === 'larkspur')!;
		expect(earner.value).toBeCloseTo(lark.breakEven!.gross * 0.85, 6);
		expect(one(f, 'larkspur', 'spendingVsMinimumWage').anchor).toMatchObject({
			id: 'minimumWageTakeHome',
			units: 'net individual'
		});
		expect(one(f, 'larkspur', 'lineVsMinimumWage').anchor.id).toBe('minimumWageTakeHome');
	});

	it('an anchor that is not ok suppresses its own comparisons, and no other anchor stands in', () => {
		const ctx = context();
		const f = highlightFacts({
			...ctx,
			anchors: anchor(ctx.anchors, 'teacherSalary', { availability: 'unavailable' })
		});
		expect(of(f, 'ross', 'earnerVsTeacher')).toEqual([]);
		expect(one(f, 'ross', 'breakEvenVsMedian').anchor.id).toBe('medianHouseholdIncome');
		const stale = highlightFacts({
			...ctx,
			anchors: anchor(ctx.anchors, 'minimumWageTakeHome', { availability: 'stale' })
		});
		expect(of(stale, 'ross', 'spendingVsMinimumWage')).toEqual([]);
		expect(of(stale, 'ross', 'lineVsMinimumWage')).toEqual([]);
	});

	it('an anchor whose units are not the template’s is never compared', () => {
		const ctx = context();
		const f = highlightFacts({
			...ctx,
			anchors: anchor(ctx.anchors, 'medianHouseholdIncome', { units: 'gross individual' })
		});
		expect(of(f, 'larkspur', 'breakEvenVsMedian')).toEqual([]);
		expect(of(f, 'larkspur', 'earnerVsTeacher')).toHaveLength(1);
	});

	it('shows a ratio at its threshold and not below it', () => {
		const ctx = context();
		const lark = ctx.budgets.find((b) => b.town === 'larkspur')!;
		const at = (median: number) =>
			highlightFacts({
				...ctx,
				anchors: anchor(ctx.anchors, 'medianHouseholdIncome', { value: median })
			});
		const be = lark.breakEven!.gross;
		expect(of(at(be / THRESHOLDS.breakEvenVsMedian), 'larkspur', 'breakEvenVsMedian')).toHaveLength(
			1
		);
		expect(
			of(at(be / (THRESHOLDS.breakEvenVsMedian - 0.01)), 'larkspur', 'breakEvenVsMedian')
		).toEqual([]);
	});

	it('picks the biggest line outside housing at a full minimum-wage take-home or more', () => {
		const f = highlightFacts(context());
		expect(one(f, 'larkspur', 'lineVsMinimumWage').lineId).toBe('larkspur.biz');
		expect(one(f, 'ross', 'lineVsMinimumWage').lineId).toBe('ross.kids.tuition');
		// Mill Valley's biggest line outside housing (groceries) is under one take-home.
		expect(of(f, 'millvalley', 'lineVsMinimumWage')).toEqual([]);
	});

	it('a line exactly at one take-home a year counts; a cent under does not', () => {
		const ctx = context();
		const takeHome = ctx.anchors.find((a) => a.id === 'minimumWageTakeHome')!.value;
		const mv = (monthly: number) =>
			highlightFacts({
				...ctx,
				budgets: ctx.budgets.map((b) =>
					b.town === 'millvalley' ? withLine(b, 'millvalley.food.groceries', monthly) : b
				)
			});
		expect(one(mv(takeHome / 12), 'millvalley', 'lineVsMinimumWage').lineId).toBe(
			'millvalley.food.groceries'
		);
		expect(of(mv(takeHome / 12 - 0.01), 'millvalley', 'lineVsMinimumWage')).toEqual([]);
	});

	it('ties between lines go to the stable line id, and a line not ok is never picked', () => {
		const ctx = context();
		const ross = ctx.budgets.find((b) => b.town === 'ross')!;
		const school = ross.lines.find((l) => l.id === 'ross.kids.tuition')!.monthly!;
		const tied = withLine(ross, 'ross.help.manager', school);
		const f = highlightFacts({ ...ctx, budgets: ctx.budgets.map((b) => (b === ross ? tied : b)) });
		// 'ross.help.manager' sorts before 'ross.kids.tuition'.
		expect(one(f, 'ross', 'lineVsMinimumWage').lineId).toBe('ross.help.manager');

		const stale = withLine(ross, 'ross.kids.tuition', school, { availability: 'stale' });
		const g = highlightFacts({ ...ctx, budgets: ctx.budgets.map((b) => (b === ross ? stale : b)) });
		expect(one(g, 'ross', 'lineVsMinimumWage').lineId).toBe('ross.help.manager');
	});
});

describe('the modelled marker', () => {
	it('marks a comparison whose line has a persona input, and only then', () => {
		const f = highlightFacts(context());
		// The shop is all persona; the day school is two cited tuitions.
		expect(one(f, 'larkspur', 'lineVsMinimumWage').modelled).toBe(true);
		expect(one(f, 'ross', 'lineVsMinimumWage').modelled).toBe(false);
		// The break-even rests on persona inputs somewhere in the budget.
		expect(one(f, 'ross', 'breakEvenVsMedian').modelled).toBe(true);
	});

	it('marks a rank whose section has a persona input', () => {
		const f = highlightFacts(context());
		expect(one(f, 'larkspur', 'rank')).toMatchObject({ section: 'business', modelled: true });
	});

	it('names each comparison’s sources: the anchor’s and the line’s', () => {
		const f = highlightFacts(context());
		expect(one(f, 'ross', 'lineVsMinimumWage').sources).toEqual(
			expect.arrayContaining(['dir.ca.gov'])
		);
		// A whole-budget comparison names only its anchor's source.
		expect(one(f, 'larkspur', 'breakEvenVsMedian').sources).toEqual(['data.census.gov']);
	});
});

describe('rank across the households', () => {
	it('names each household’s widest lead, against the runner-up', () => {
		const f = highlightFacts(context());
		expect(one(f, 'larkspur', 'rank')).toMatchObject({ section: 'business', compared: 3 });
		expect(one(f, 'millvalley', 'rank')).toMatchObject({
			section: 'wellness',
			runnerUp: { town: 'ross' }
		});
		expect(one(f, 'ross', 'rank').section).toBe('giving');
	});

	it('a lead under the threshold is no rank; one at it is', () => {
		const ctx = context();
		// Make wellness Mill Valley's only possible lead, then set it to the threshold exactly.
		const mvOnlyWellness = (ratio: number) => {
			const ross = ctx.budgets.find((b) => b.town === 'ross')!;
			const rossWellness = ross.sections.wellness!;
			return ctx.budgets.map((b) =>
				b.town === 'millvalley'
					? { ...b, sections: { ...b.sections, wellness: rossWellness * ratio } }
					: b
			);
		};
		const at = highlightFacts({ ...ctx, budgets: mvOnlyWellness(THRESHOLDS.rankLead) });
		expect(one(at, 'millvalley', 'rank').section).toBe('wellness');
		const under = highlightFacts({ ...ctx, budgets: mvOnlyWellness(THRESHOLDS.rankLead - 0.01) });
		expect(of(under, 'millvalley', 'rank')).toEqual([]);
	});

	it('a tie for first is no one’s lead', () => {
		const ctx = context();
		const lark = ctx.budgets.find((b) => b.town === 'larkspur')!.sections.business!;
		const f = highlightFacts({
			...ctx,
			budgets: ctx.budgets.map((b) =>
				b.town === 'millvalley' ? { ...b, sections: { ...b.sections, business: lark } } : b
			)
		});
		expect(of(f, 'larkspur', 'rank').map((r) => (r as { section: string }).section)).not.toContain(
			'business'
		);
		expect(
			of(f, 'millvalley', 'rank').map((r) => (r as { section: string }).section)
		).not.toContain('business');
		// Larkspur's next-widest lead stands instead.
		expect(one(f, 'larkspur', 'rank').section).toBe('housing');
	});

	it('a household alone in spending on a section has no runner-up', () => {
		const ctx = context();
		const f = highlightFacts({
			...ctx,
			budgets: ctx.budgets.map((b) =>
				b.town === 'millvalley' ? { ...b, sections: { ...b.sections, business: 0 } } : b
			)
		});
		expect(one(f, 'larkspur', 'rank')).toMatchObject({ section: 'business', runnerUp: null });
	});

	it('skips a section with a line that is not ok in any household', () => {
		const ctx = context();
		// A stale line in Ross's wellness, not Mill Valley's, still blocks Mill Valley's wellness lead.
		const f = highlightFacts({
			...ctx,
			budgets: ctx.budgets.map((b) =>
				b.town === 'ross'
					? {
							...b,
							lines: b.lines.map((l) =>
								l.id === 'ross.well.tennis' ? { ...l, availability: 'stale' as const } : l
							)
						}
					: b
			)
		});
		expect(of(f, 'millvalley', 'rank')).toEqual([]);
		expect(one(f, 'ross', 'rank').section).toBe('giving');
	});
});

describe('an incomplete household', () => {
	const live = reads({
		'grocery.silverOak': { availability: 'unavailable', value: null, reason: 'no read' }
	});

	it('has no highlights, and leaves the rank to the households priced in full', () => {
		// Silver Oak is Larkspur's and Ross's wine: both are incomplete without it.
		const ctx = context({ budgets: budgets(live) });
		const f = highlightFacts(ctx);
		expect(ctx.budgets.filter((b) => !b.complete).map((b) => b.town)).toEqual(['larkspur', 'ross']);
		expect(f.larkspur ?? []).toEqual([]);
		expect(f.ross ?? []).toEqual([]);
		// One complete household is no ranking at all.
		expect(of(f, 'millvalley', 'rank')).toEqual([]);
		expect(of(f, 'millvalley', 'breakEvenVsMedian')).toHaveLength(1);
	});
});

describe('movers', () => {
	const earlier = new Date('2026-10-19T14:30:00.000Z');
	const readEarlier = (gas: number) =>
		reads(
			Object.fromEntries(
				Object.keys(LIVE).map((k) => [
					k,
					{ observedAt: '2026-10-19T10:00:00.000Z', ...(k === 'gas.regular' ? { value: gas } : {}) }
				])
			)
		);
	const before = budgets(readEarlier(5.8), earlier);
	const history = (current: readonly PricedBudget[], prior: readonly PricedBudget[], run = RUN) => [
		...current.map((b) => historyEntry(b, run)),
		...prior.map((b) => historyEntry(b, '2026-10-19'))
	];

	it('names a like-for-like line move and the input that moved', () => {
		const now = budgets();
		const f = highlightFacts(context({ budgets: now, history: history(now, before) }));
		const m = of(f, 'ross', 'mover') as Extract<Fact, { template: 'mover' }>[];
		expect(m.map((x) => x.lineId)).toEqual(['ross.car.rangeRover.fuel']);
		expect(m[0].change).toBeGreaterThan(THRESHOLDS.moverMonthly);
		expect(m[0].since).toBe(earlier.toISOString());
		expect(m[0].inputs).toEqual([
			{ label: expect.any(String), class: 'live', before: 5.8, after: 6.179 }
		]);
		expect(m[0].modelled).toBe(true);
	});

	it('a move under the threshold is a quiet week, not a mover', () => {
		const now = budgets();
		const near = budgets(readEarlier(6.17), earlier);
		const f = highlightFacts(context({ budgets: now, history: history(now, near) }));
		expect(of(f, 'ross', 'mover')).toEqual([]);
		expect(one(f, 'ross', 'moversQuiet')).toMatchObject({
			since: earlier.toISOString(),
			compared: now.find((b) => b.town === 'ross')!.lines.length,
			of: now.find((b) => b.town === 'ross')!.lines.length
		});
	});

	it('a quiet week names how many lines it could compare', () => {
		const now = budgets();
		const near = budgets(readEarlier(6.17), earlier);
		const hist = history(now, near).map((e) =>
			e.runId === '2026-10-19' && e.town === 'ross'
				? { ...e, quantities: { ...e.quantities, 'ross.food.dining': '[["n",99]]' } }
				: e
		);
		const f = highlightFacts(context({ budgets: now, history: hist }));
		// One line could not be compared: the quiet week says how many were.
		const q = one(f, 'ross', 'moversQuiet');
		expect(q.of - q.compared).toBe(1);
		expect(q.compared).toBeGreaterThan(0);
	});

	it('ties between moves go to the stable line id, and at most two show', () => {
		const prior = (id: string) =>
			before.find((b) => b.town === 'ross')!.lines.find((l) => l.id === id)!.monthly!;
		// Club dining and dinners out each move +$10; gas moves +$13.27.
		const now = budgets().map((b) =>
			b.town === 'ross'
				? withLine(
						withLine(b, 'ross.food.dining', prior('ross.food.dining') + 10),
						'ross.food.club',
						prior('ross.food.club') + 10
					)
				: b
		);
		const f = highlightFacts(context({ budgets: now, history: history(now, before) }));
		const ids = (of(f, 'ross', 'mover') as Extract<Fact, { template: 'mover' }>[]).map(
			(m) => m.lineId
		);
		expect(ids).toEqual(['ross.car.rangeRover.fuel', 'ross.food.club']);
	});

	it('a different method version is not comparable history', () => {
		const now = budgets();
		const prior = before.map((b) => ({ ...b, methodVersion: 'lifestyle-method-0' }));
		const f = highlightFacts(context({ budgets: now, history: history(now, prior) }));
		expect(of(f, 'ross', 'mover')).toEqual([]);
		expect(of(f, 'ross', 'moversNotComparable')).toHaveLength(1);
	});

	it('a first run, or a run missing from history, is not comparable history', () => {
		const f = highlightFacts(context());
		expect(of(f, 'ross', 'moversNotComparable')).toHaveLength(1);
		const now = budgets();
		const g = highlightFacts(context({ budgets: now, history: history(now, before, 'other') }));
		expect(of(g, 'ross', 'moversNotComparable')).toHaveLength(1);
	});

	it('an unreadable history says nothing about movers at all', () => {
		const f = highlightFacts(context({ history: null }));
		const movers = Object.values(f)
			.flat()
			.filter((x) => x.template.startsWith('mover'));
		expect(movers).toEqual([]);
		expect(one(f, 'ross', 'breakEvenVsMedian')).toBeTruthy();
	});

	it('never names a line that is not ok now', () => {
		const now = budgets().map((b) =>
			b.town === 'ross'
				? {
						...b,
						lines: b.lines.map((l) =>
							l.id === 'ross.car.rangeRover.fuel' ? { ...l, availability: 'stale' as const } : l
						)
					}
				: b
		);
		const hist: HistoryEntry[] = history(now, before);
		const f = highlightFacts(context({ budgets: now, history: hist }));
		expect(of(f, 'ross', 'mover')).toEqual([]);
		expect(of(f, 'larkspur', 'mover').length).toBeGreaterThan(0);
	});
});
