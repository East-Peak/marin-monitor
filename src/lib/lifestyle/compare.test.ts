import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Highlight } from './highlight-copy';
import type { PricedBudget, PricedLine } from './model';
import { SHEETS } from './sheets';
import { barSpan, compareHouseholds, sharedDomain, type CompareColumn } from './compare';
import { householdPage } from './view';

const seed = JSON.parse(readFileSync('tests/e2e/fixtures/lifestyle-index.json', 'utf8')) as {
	current: { budgets: PricedBudget[] };
};
const budget = (id: string) => seed.current.budgets.find((b) => b.town === id)!;
const column = (id: string, b: PricedBudget | null = budget(id)): CompareColumn => {
	const sheet = SHEETS.find((s) => s.id === id)!;
	return { id, page: b ? householdPage(b, sheet) : null };
};
const seeded = () => SHEETS.map((s) => column(s.id));
const rank = (section: string, text = `rank ${section}`): Highlight => ({
	key: `rank:${section}`,
	rule: 'rank',
	template: 'rank',
	figure: '2.0×',
	text,
	modelled: false,
	sources: []
});
/** A budget with one section's lines replaced, its section total kept equal to their sum. */
function withSection(b: PricedBudget, section: string, lines: Partial<PricedLine>[]): PricedBudget {
	const base = b.lines.find((l) => l.section === section)!;
	const own: PricedLine[] = lines.map((l, i) => ({
		...base,
		id: i === 0 ? base.id : `${base.id}.${i}`,
		...l
	}));
	const sum = own.reduce((s, l) => s + (l.monthly ?? 0), 0);
	return {
		...b,
		lines: [...b.lines.filter((l) => l.section !== section), ...own],
		sections: { ...b.sections, [section]: sum }
	};
}

describe('the shared dollar domain (R7)', () => {
	it('runs from zero to the largest amount when nothing is negative', () => {
		expect(sharedDomain([0, 120, 4000, null])).toEqual({ min: 0, max: 4000 });
	});

	it('takes in a negative amount, zero always inside it', () => {
		expect(sharedDomain([-500, 1500])).toEqual({ min: -500, max: 1500 });
	});

	it('is never degenerate', () => {
		expect(sharedDomain([])).toEqual({ min: 0, max: 1 });
		expect(sharedDomain([0, null])).toEqual({ min: 0, max: 1 });
	});

	it('draws a bar from the zero baseline to the value, with no minimum width', () => {
		const d = { min: 0, max: 1000 };
		expect(barSpan(500, d)).toEqual({ from: 0, to: 50 });
		// $1 of $1,000 is a tenth of a percent: never inflated.
		expect(barSpan(1, d)).toEqual({ from: 0, to: 0.1 });
		expect(barSpan(0, d)).toBeNull();
		expect(barSpan(null, d)).toBeNull();
	});

	it('draws a negative value left of the baseline', () => {
		const d = { min: -500, max: 1500 };
		expect(barSpan(-500, d)).toEqual({ from: 0, to: 25 });
		expect(barSpan(1500, d)).toEqual({ from: 25, to: 100 });
	});
});

describe('compareHouseholds', () => {
	it('one row per section, each with a cell per household in sheet order', () => {
		const c = compareHouseholds(seeded(), null);
		expect(c.rows.length).toBe(12);
		for (const r of c.rows)
			expect(r.cells.map((x) => x.id)).toEqual(['larkspur', 'millvalley', 'ross']);
	});

	it('orders the sections by the largest household amount in each', () => {
		const c = compareHouseholds(seeded(), null);
		const peak = c.rows.map((r) => Math.max(...r.cells.map((x) => x.monthly ?? -Infinity)));
		expect(peak).toEqual([...peak].sort((a, z) => z - a));
		// Ross's help, $19,964 a month in the seed, leads the page.
		expect(c.rows[0].section).toBe('help');
	});

	it('every bar sits on one domain, the largest amount on the page at full width (never per household)', () => {
		const c = compareHouseholds(seeded(), null);
		const all = c.rows.flatMap((r) => r.cells);
		const max = Math.max(...all.map((x) => x.monthly ?? 0));
		expect(c.domain).toEqual({ min: 0, max });
		const widest = all.find((x) => x.monthly === max)!;
		expect(widest.bar).toEqual({ from: 0, to: 100 });
		// Larkspur's housing is its own biggest section, but not the page's: short of full width.
		const housing = c.rows.find((r) => r.section === 'housing')!.cells[0];
		expect(housing.bar!.to).toBeCloseTo((100 * housing.monthly!) / max, 9);
		expect(housing.bar!.to).toBeLessThan(100);
	});

	it('uses SectionShare semantics: an actual $0 is zero, drawn as no bar', () => {
		const c = compareHouseholds(seeded(), null);
		const ross = c.rows.find((r) => r.section === 'business')!.cells[2];
		expect(ross).toMatchObject({ state: 'zero', monthly: 0, bar: null });
	});

	it('a section with an unread line is partial, "so far", and makes no comparative claim (R2)', () => {
		const c = compareHouseholds(seeded(), { larkspur: [rank('food')] });
		const food = c.rows.find((r) => r.section === 'food')!;
		const ross = food.cells[2];
		expect(ross.state).toBe('partial');
		expect(ross.monthly).toBe(budget('ross').sections.food);
		expect(ross.bar).not.toBeNull();
		expect(food.comparable).toBe(false);
		expect(food.highlight).toBeNull();
	});

	it('a section none of whose lines can be read is unknown, never $0', () => {
		const b = withSection(budget('larkspur'), 'giving', [
			{ monthly: null, availability: 'unavailable' }
		]);
		const c = compareHouseholds([column('larkspur', b), column('millvalley')], null);
		const giving = c.rows.find((r) => r.section === 'giving')!;
		expect(giving.cells[0]).toMatchObject({ state: 'unknown', monthly: null, bar: null });
		expect(giving.comparable).toBe(false);
		// Sorted last: it has no amount to sort by in that household.
		expect(c.rows.at(-1)?.section).not.toBe('housing');
	});

	it('a section with a stale line is marked stale and makes no comparative claim', () => {
		// Mill Valley's seeded utilities include a stale garbage line.
		const c = compareHouseholds(seeded(), { larkspur: [rank('utilities')] });
		const util = c.rows.find((r) => r.section === 'utilities')!;
		expect(util.cells[1].stale).toBe(true);
		expect(util.comparable).toBe(false);
		expect(util.highlight).toBeNull();
	});

	it('shows an existing rank fact as the row’s comparison highlight, only where comparable (R4)', () => {
		const c = compareHouseholds(seeded(), {
			larkspur: [rank('business', 'Of the two households priced in full this week, …')]
		});
		const biz = c.rows.find((r) => r.section === 'business')!;
		expect(biz.comparable).toBe(true);
		expect(biz.highlight?.text).toBe('Of the two households priced in full this week, …');
		expect(c.rows.filter((r) => r.highlight).map((r) => r.section)).toEqual(['business']);
	});

	it('compares nothing while the whole snapshot is out of date (Codex)', () => {
		const c = compareHouseholds(seeded(), { larkspur: [rank('business')] }, { stale: true });
		expect(c.rows.every((r) => !r.comparable && r.highlight === null)).toBe(true);
	});

	it('takes only rank facts as highlights, never another rule', () => {
		const comparison = {
			...rank('housing'),
			key: 'lineVsMinimumWage:larkspur.biz',
			rule: 'comparison' as const
		};
		const c = compareHouseholds(seeded(), { larkspur: [comparison] });
		expect(c.rows.every((r) => r.highlight === null)).toBe(true);
	});

	it('keeps each household’s own lines under its own cell, with their own labels, never paired (R1)', () => {
		const c = compareHouseholds(seeded(), null);
		const giving = c.rows.find((r) => r.section === 'giving')!;
		for (const [i, s] of SHEETS.entries()) {
			const own = budget(s.id).lines.filter((l) => l.section === 'giving');
			expect(giving.cells[i].lines.map((l) => l.id).sort()).toEqual(own.map((l) => l.id).sort());
			expect(giving.cells[i].lines.every((l) => l.id.startsWith(`${s.id}.`))).toBe(true);
		}
		// The lines are sorted by amount, as on the household page.
		const m = giving.cells[2].lines.map((l) => l.monthly ?? -Infinity);
		expect(m).toEqual([...m].sort((a, z) => z - a));
	});

	it('a signature line the stored budget lacks reads unread, as on the household page', () => {
		const b = budget('larkspur');
		const sig = SHEETS[0].lines.find((l) => l.signature)!;
		const without = { ...b, lines: b.lines.filter((l) => l.id !== sig.id) };
		const c = compareHouseholds([column('larkspur', without), column('millvalley')], null);
		const cell = c.rows.find((r) => r.section === sig.section)!.cells[0];
		const line = cell.lines.find((l) => l.id === sig.id)!;
		expect(line.monthly).toBeNull();
		expect(cell.state).toBe('partial');
	});

	it('a household whose budget can’t be read is unknown in every section, and nothing is compared', () => {
		const c = compareHouseholds([column('larkspur'), column('millvalley'), column('ross', null)], {
			larkspur: [rank('business')]
		});
		for (const r of c.rows) {
			expect(r.cells[2]).toMatchObject({ state: 'unread', monthly: null, bar: null, lines: [] });
			expect(r.comparable).toBe(false);
			expect(r.highlight).toBeNull();
		}
	});

	it('handles a net-income section: negative, drawn left of zero, and the domain takes it in', () => {
		const b = withSection(budget('millvalley'), 'business', [
			{ monthly: -2000, availability: 'ok' }
		]);
		const c = compareHouseholds([column('larkspur'), column('millvalley', b)], null);
		expect(c.domain.min).toBe(-2000);
		const biz = c.rows.find((r) => r.section === 'business')!.cells[1];
		expect(biz.state).toBe('value');
		expect(biz.monthly).toBe(-2000);
		expect(biz.bar!.from).toBe(0);
		expect(biz.bar!.to).toBeCloseTo(c.zeroPct, 9);
		expect(c.zeroPct).toBeGreaterThan(0);
	});
});
