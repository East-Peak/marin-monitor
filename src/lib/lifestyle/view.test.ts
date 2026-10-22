import { describe, expect, it } from 'vitest';
import type { LiveKey, LiveRead, LiveReads, PricedBudget } from './model';
import { priceSheet } from './price';
import { SHEETS } from './sheets';
import {
	dailySlug,
	formatInput,
	householdPage,
	householdSummary,
	sheetForSlug,
	sourceLink,
	townSlug
} from './view';

const NOW = new Date('2026-10-20T18:00:00.000Z');
const LIVE: Record<LiveKey, number> = {
	'gas.regular': 6.207,
	'coffee.cappuccino': 5,
	'grocery.collagen': 13.47,
	'grocery.manuka': 10.99,
	'grocery.kombucha': 4.79,
	'grocery.oatMilk': 3.99,
	'grocery.silverOak': 83.49,
	'ikon.adult': 1529,
	'rivian.lease': 1209
};
const reads = (over: Partial<Record<LiveKey, Partial<LiveRead>>> = {}) =>
	Object.fromEntries(
		Object.entries(LIVE).map(([k, value]): [string, LiveRead] => [
			k,
			{
				availability: 'ok',
				value,
				observedAt: '2026-10-20T12:00:00.000Z',
				maxAgeDays: 10,
				source: 'test',
				...over[k as LiveKey]
			}
		])
	) as LiveReads;
const sheet = (id: string) => SHEETS.find((s) => s.id === id)!;
const priced = (id: string, live = reads()): PricedBudget => priceSheet(sheet(id), live, NOW);

describe('town slugs', () => {
	it('are the town in lower case with hyphens, and find their sheet', () => {
		expect(SHEETS.map((s) => townSlug(s.town))).toEqual(['larkspur', 'mill-valley', 'ross']);
		expect(sheetForSlug(SHEETS, 'mill-valley')?.id).toBe('millvalley');
		expect(sheetForSlug(SHEETS, 'millvalley')).toBeNull();
		expect(sheetForSlug(SHEETS, 'constructor')).toBeNull();
	});
});

describe('the daily default household', () => {
	const slugs = ['larkspur', 'mill-valley', 'ross'];
	it('turns over at Pacific midnight, not UTC midnight', () => {
		// 2026-10-20 23:30 Pacific is 06:30 UTC on the 21st: still the 20th's household.
		const lateOn20th = Date.parse('2026-10-21T06:30:00.000Z');
		const earlyOn20th = Date.parse('2026-10-20T08:00:00.000Z');
		const on21st = Date.parse('2026-10-21T08:00:00.000Z');
		expect(dailySlug(slugs, lateOn20th)).toBe(dailySlug(slugs, earlyOn20th));
		expect(dailySlug(slugs, on21st)).not.toBe(dailySlug(slugs, earlyOn20th));
	});
	it('visits every household in turn', () => {
		const day = 86_400_000;
		const start = Date.parse('2026-10-20T20:00:00.000Z');
		const seen = [0, 1, 2].map((i) => dailySlug(slugs, start + i * day));
		expect(new Set(seen)).toEqual(new Set(slugs));
	});
});

describe('the card summary', () => {
	it('carries break-even, burn, the sections by size and the three biggest lines', () => {
		const b = priced('larkspur');
		const s = householdSummary(b, sheet('larkspur'));
		expect(s).toMatchObject({
			slug: 'larkspur',
			town: 'Larkspur',
			name: 'Larkspur strivers',
			complete: true,
			missing: [],
			stale: 0
		});
		expect(s.breakEven).toBe(b.breakEven!.gross);
		expect(s.burnMonthly).toBe(b.burnMonthly);
		const monthly = s.sections.map((x) => x.monthly);
		expect(monthly).toEqual([...monthly].sort((a, z) => z - a));
		expect(s.sections[0]).toMatchObject({ section: 'housing' });
		expect(s.sections.reduce((t, x) => t + x.share, 0)).toBeCloseTo(1, 6);
		expect(s.top.map((l) => l.label)).toEqual([
			'Mortgage (P&I)',
			'The Business: a downtown tinned-fish shop',
			'Nanny, 25 h/wk (employer cost)'
		]);
		expect(s.top[0].classes).toEqual(['cited', 'persona']);
	});

	it('counts every input by class, and the persona-only share of spending', () => {
		const b = priced('larkspur');
		const s = householdSummary(b, sheet('larkspur'));
		const all = b.lines.flatMap((l) => l.inputs);
		expect(s.inputs.live + s.inputs.cited + s.inputs.persona).toBe(all.length);
		expect(s.inputs.live).toBe(all.filter((i) => i.class === 'live').length);
		expect(s.personaOnly).toBe(b.personaShare.only);
	});

	it('counts the lines priced from a stale input', () => {
		const b = priced('millvalley', reads({ 'grocery.kombucha': { availability: 'stale' } }));
		const s = householdSummary(b, sheet('millvalley'));
		expect(s.stale).toBe(b.lines.filter((l) => l.availability === 'stale').length);
		expect(s.stale).toBeGreaterThanOrEqual(1);
		expect(s.complete).toBe(true);
	});

	it('suppresses break-even when a required line is unavailable, and names the line', () => {
		const b = priced('larkspur', reads({ 'gas.regular': { availability: 'unavailable' } }));
		const s = householdSummary(b, sheet('larkspur'));
		expect(s.complete).toBe(false);
		expect(s.breakEven).toBeNull();
		expect(s.missing).toEqual(['Gas SUV gas']);
	});
});

describe('the household page', () => {
	it('works the break-even back to the budget: wages less taxes and deferrals is take-home', () => {
		const b = priced('larkspur');
		const p = householdPage(b, sheet('larkspur'));
		const eq = p.equation!;
		const t = b.breakEven!.taxes;
		expect(eq.gross).toBe(b.breakEven!.gross);
		expect(eq.rows.map((r) => r.label)).toEqual([
			'Federal income tax',
			'California income tax',
			'Social Security + Medicare',
			'California SDI',
			'401(k) deferrals, pre-tax'
		]);
		const out = eq.rows.reduce((s, r) => s + r.amount, 0);
		expect(eq.gross - out).toBeCloseTo(t.takeHome, 6);
		expect(eq.takeHome).toBe(t.takeHome);
		expect(eq.spending).toBeCloseTo(b.burnMonthly * 12, 6);
		expect(eq.afterTaxSavings).toBe(sheet('larkspur').afterTaxSavings);
		expect(eq.split).toBe('85/15');
	});

	it('has no equation when the budget is incomplete', () => {
		const b = priced('larkspur', reads({ 'gas.regular': { availability: 'unavailable' } }));
		expect(householdPage(b, sheet('larkspur')).equation).toBeNull();
	});

	it('leaves out the deferral row for a household that defers nothing', () => {
		const p = householdPage(priced('ross'), sheet('ross'));
		expect(p.equation!.rows.map((r) => r.label)).not.toContain('401(k) deferrals, pre-tax');
	});

	it('lists every priced line once, in sections by size, biggest line first', () => {
		const b = priced('millvalley');
		const p = householdPage(b, sheet('millvalley'));
		const ids = p.sections.flatMap((s) => s.lines.map((l) => l.id));
		expect(ids.sort()).toEqual(b.lines.map((l) => l.id).sort());
		for (const s of p.sections) {
			const m = s.lines.map((l) => l.monthly ?? 0);
			expect(m).toEqual([...m].sort((a, z) => z - a));
		}
		expect(p.sections[0].widthPct).toBe(100);
	});

	it('keeps a section whose every line is unavailable, with its lines and no spending', () => {
		const b = priced('larkspur', reads({ 'ikon.adult': { availability: 'unavailable' } }));
		const travel = b.lines.filter((l) => l.section === 'travel');
		const gone = { ...b, sections: { ...b.sections, travel: undefined } } as PricedBudget;
		delete (gone.sections as Record<string, unknown>).travel;
		const p = householdPage(
			{
				...gone,
				lines: b.lines.map((l) => (l.section === 'travel' ? { ...l, monthly: null } : l))
			},
			sheet('larkspur')
		);
		const sec = p.sections.find((s) => s.section === 'travel')!;
		expect(sec.lines.map((l) => l.id).sort()).toEqual(travel.map((l) => l.id).sort());
		expect(sec.monthly).toBe(0);
		expect(sec.widthPct).toBe(0);
	});
});

describe('an input as shown', () => {
	it('shows a value only where its label does not already say it', () => {
		expect(formatInput({ label: '20% down', class: 'persona', value: 0.8 })).toBe('20% down');
		expect(formatInput({ label: 'kombuchas a month', class: 'persona', value: 16 })).toBe(
			'kombuchas a month · 16'
		);
		expect(formatInput({ label: '2024 Larkspur SFR median', class: 'cited', value: 2501250 })).toBe(
			'2024 Larkspur SFR median · 2,501,250'
		);
		expect(formatInput({ label: 'Marin average regular', class: 'live', value: 6.178837 })).toBe(
			'Marin average regular · 6.179'
		);
		expect(formatInput({ label: 'x', class: 'live', value: null })).toBe('x');
		// Codex LIFE2-1: a digit in the label is not the value.
		expect(formatInput({ label: 'units per 2 months', class: 'persona', value: 22 })).toBe(
			'units per 2 months · 22'
		);
		expect(
			formatInput({ label: 'remodel reassessed 2022', class: 'persona', value: 1500000 })
		).toBe('remodel reassessed 2022 · 1,500,000');
		expect(formatInput({ label: '2%/yr Prop 13 factor', class: 'persona', value: 0.02 })).toBe(
			'2%/yr Prop 13 factor'
		);
		expect(formatInput({ label: '+0.121% bonds', class: 'persona', value: 0.00121 })).toBe(
			'+0.121% bonds'
		);
		expect(formatInput({ label: 'rate 6.99%', class: 'persona', value: 6.99 })).toBe('rate 6.99%');
		expect(formatInput({ label: '$1,800/mo (unpublished)', class: 'persona', value: 1800 })).toBe(
			'$1,800/mo (unpublished)'
		);
	});

	it('links a cited source by its host and keeps its period and scope', () => {
		expect(
			sourceLink(
				'https://www.millvalleyrefuse.com/rates/2025.pdf (FY 2025-26; Mill Valley, flat area)'
			)
		).toEqual({
			href: 'https://www.millvalleyrefuse.com/rates/2025.pdf',
			host: 'millvalleyrefuse.com',
			detail: 'FY 2025-26; Mill Valley, flat area'
		});
		expect(sourceLink('Ikon Pass adult, ikonpass.com')).toBeNull();
		expect(sourceLink('javascript:alert(1) (x)')).toBeNull();
	});
});
