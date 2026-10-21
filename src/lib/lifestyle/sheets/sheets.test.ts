import { describe, expect, it } from 'vitest';
import type { LiveKey, LiveRead, LiveReads } from '../model';
import { COVERAGE_ITEMS } from '../model';
import { priceSheet } from '../price';
import { SHEETS } from './index';

const NOW = new Date('2026-10-20T18:00:00.000Z');

/** The live values the approved sheets were priced with (LIFE0, 2026-10-20). */
const LIFE0_LIVE: Record<LiveKey, number> = {
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
const reads = Object.fromEntries(
	Object.entries(LIFE0_LIVE).map(([k, value]): [string, LiveRead] => [
		k,
		{
			availability: 'ok',
			value,
			observedAt: '2026-10-20T12:00:00.000Z',
			maxAgeDays: 10,
			source: 'LIFE0'
		}
	])
) as LiveReads;

/** Each approved line's monthly figure, from the sheets Stuart approved on 2026-10-20. */
const APPROVED: Record<string, Record<string, number>> = {
	larkspur: {
		'home.pi': 13299.27,
		'home.tax': 2589.82,
		'home.ins': 700,
		'home.upkeep': 2084.38,
		'util.electric': 210.2,
		'util.gas': 111.68,
		'util.water': 184.41,
		'util.garbage': 48.46,
		'util.net': 240,
		'health.prem': 570.83,
		'health.oop': 333.33,
		'car.rivian.lease': 1420.22,
		'car.rivian.charge': 82.8,
		'car.rivian.reg': 84.77,
		'car.rivian.ins': 203.33,
		'car.rivian.maint': 54,
		'car.suv.fuel': 217.25,
		'car.suv.reg': 26.33,
		'car.suv.ins': 203.33,
		'car.suv.maint': 77,
		'food.groceries': 1681.8,
		'food.coffee': 220,
		'food.dining': 1000,
		'food.wine': 166.98,
		'kids.foundation': 275,
		'kids.soccer': 397.92,
		'kids.math': 499,
		'kids.robotics': 450,
		'kids.bike': 45.5,
		'kids.camp': 726.67,
		'kids.parties': 83.33,
		'help.nanny': 3951.71,
		'help.cleaner': 238.33,
		'well.pilates': 189,
		'travel.ikon': 338,
		'travel.skiweek': 483.33,
		'travel.summer': 1000,
		'belong.kqed': 8,
		give: 292.67,
		biz: 7788.5
	}
};

/**
 * Approved burn and break-even, the latter `within` dollars: Mill Valley's
 * 2026 interest now runs Jan–Dec 2026 (LIFE0's model took Feb 2026–Jan 2027).
 * The persona-only share is the engine's: every
 * input is classed, so lines LIFE0 tagged persona-only but that carry a cited
 * figure (the shop's payroll-tax rates, upkeep's 1% of a cited price) are
 * Persona × Cited (LIFE0 showed 35% / 27% / 31%).
 */
const TOTALS = {
	larkspur: { burn: 42577.15, breakEven: 902662, within: 2, personaOnly: 0.117 }
} as const;

const priced = (id: string) => priceSheet(SHEETS.find((s) => s.id === id)!, reads, NOW);

describe('the approved household sheets', () => {
	it('are the launch towns, each answering every coverage item', () => {
		expect(SHEETS.map((s) => s.id)).toEqual(['larkspur']);
		for (const s of SHEETS) {
			expect(Object.keys(s.coverage).sort()).toEqual([...COVERAGE_ITEMS].sort());
			expect(Object.isFrozen(s)).toBe(true);
		}
	});

	it.each(Object.keys(APPROVED))(
		'%s prices every approved line to the cent, and only those lines',
		(id) => {
			const b = priced(id);
			const got = Object.fromEntries(b.lines.map((l) => [l.id.slice(id.length + 1), l.monthly]));
			expect(Object.keys(got).sort()).toEqual(Object.keys(APPROVED[id]).sort());
			for (const [line, approved] of Object.entries(APPROVED[id])) {
				// NRF's exact $627.93 replaces the sheet's rounded $628: at most 3¢ on a giving line.
				expect(Math.abs((got[line] as number) - approved), `${id}.${line}`).toBeLessThanOrEqual(
					0.05
				);
			}
		}
	);

	it.each(Object.keys(TOTALS) as (keyof typeof TOTALS)[])(
		'%s reproduces the approved burn and break-even',
		(id) => {
			const b = priced(id);
			expect(b.complete).toBe(true);
			expect(Math.abs(b.burnMonthly - TOTALS[id].burn)).toBeLessThanOrEqual(0.2);
			expect(b.personaShare.only).toBeCloseTo(TOTALS[id].personaOnly, 2);
			expect(Math.abs(b.breakEven!.gross - TOTALS[id].breakEven)).toBeLessThanOrEqual(
				TOTALS[id].within
			);
		}
	);

	it('keeps the frozen purchases frozen: no mortgage input is live, and today’s median is context only', () => {
		for (const s of SHEETS) {
			const mortgage = s.lines.find((l) => l.terms.some((t) => t.kind === 'mortgage'))!;
			expect(Object.values(mortgage.inputs).every((i) => i.class !== 'live')).toBe(true);
			const b = priced(s.id);
			expect(b.marketTracker.class).toBe('cited');
			expect(b.lines.flatMap((l) => l.inputs).some((i) => i.value === b.marketTracker.value)).toBe(
				false
			);
		}
	});

	it('names no real business: the shops are kinds of shop, never a name', () => {
		const biz = SHEETS.map((s) => s.lines.find((l) => l.section === 'business')!.label);
		expect(biz).toEqual(['The Business: a downtown tinned-fish shop']);
	});
});
