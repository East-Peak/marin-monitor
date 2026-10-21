import { describe, expect, it } from 'vitest';
import { computeTaxes, solveBreakEven, TAX_2026, type TaxCase } from './tax';

/**
 * The reference cases, hand-worked from the published 2026 IRS and FTB
 * schedules (Rev. Proc. 2025-32; FTB's October 2026 indexing). Each tax line
 * must land within $5; take-home within $5 too.
 */
interface Expected {
	fed: number;
	ca: number;
	ss: number;
	medicare: number;
	sdi: number;
	net: number;
}

const mfj = (wages: number[], rest: Partial<TaxCase> = {}): TaxCase => ({
	status: 'mfj',
	wages,
	deferrals: wages.map(() => 0),
	children: 0,
	propertyTax: 0,
	mortgageInterest: 0,
	mortgageAverageBalance: 0,
	gifts: 0,
	...rest
});

const single = (wage: number, rest: Partial<TaxCase> = {}): TaxCase => ({
	...mfj([wage], rest),
	status: 'single'
});

const CASES: [string, TaxCase, Expected][] = [
	[
		'A: Larkspur strivers at break-even (itemised both sides, SALT floor, §68, Additional Medicare)',
		mfj([767262.7, 135399.3], {
			deferrals: [24500, 24500],
			children: 2,
			propertyTax: 31077.79,
			mortgageInterest: 136981.24,
			mortgageAverageBalance: 1959674.35,
			gifts: 4396
		}),
		{ fed: 216126.0, ca: 64079.05, ss: 19833.76, medicare: 18962.56, sdi: 11734.61, net: 522926.04 }
	],
	[
		'B: Mill Valley wellness at break-even (full $40,400 SALT cap, CA credits in full)',
		mfj([463051.1, 81714.9], {
			deferrals: [24500, 24500],
			children: 2,
			propertyTax: 25603.41,
			mortgageInterest: 33479.95,
			mortgageAverageBalance: 1217452.82,
			gifts: 6200
		}),
		{ fed: 90838.35, ca: 31928.14, ss: 16505.32, medicare: 10552.0, sdi: 7081.96, net: 338860.23 }
	],
	[
		'C: Ross old money at break-even (CA 1% surcharge, no mortgage)',
		mfj([976739.4, 418602.6], { children: 2, propertyTax: 42696.64, gifts: 37000 }),
		{
			fed: 424432.89,
			ca: 134007.28,
			ss: 22878.0,
			medicare: 30540.54,
			sdi: 18139.45,
			net: 765343.85
		}
	],
	[
		'D: single, CA minimum wage, full time',
		single(35152),
		{ fed: 2038.24, ca: 354.38, ss: 2179.42, medicare: 509.7, sdi: 456.98, net: 29613.28 }
	],
	[
		'E: MFJ renters, $250,000, 2 kids (standard both sides, full CTC)',
		mfj([150000, 100000], { children: 2 }),
		{ fed: 33068.0, ca: 13489.72, ss: 15500.0, medicare: 3625.0, sdi: 3250.0, net: 181067.28 }
	],
	[
		'F: MFJ owners, $250,000, $1.2M mortgage (itemised both sides, $750k vs $1M limits)',
		mfj([150000, 100000], {
			children: 2,
			propertyTax: 14000,
			mortgageInterest: 72000,
			mortgageAverageBalance: 1200000,
			gifts: 3000
		}),
		{ fed: 24310.25, ca: 7426.12, ss: 15500.0, medicare: 3625.0, sdi: 3250.0, net: 195888.63 }
	],
	[
		'G: MFJ $555,000, inside the SALT phase-down (CA credits partly phased out)',
		mfj([400000, 155000], {
			children: 2,
			propertyTax: 24000,
			mortgageInterest: 30000,
			mortgageAverageBalance: 900000,
			gifts: 5000
		}),
		{ fed: 113672.0, ca: 37987.71, ss: 21049.0, medicare: 10792.5, sdi: 7215.0, net: 364283.79 }
	],
	[
		'H: single $1,075,000, the CA 1% surcharge boundary',
		single(1075000, {
			propertyTax: 20000,
			mortgageInterest: 40000,
			mortgageAverageBalance: 1000000,
			gifts: 10000
		}),
		{
			fed: 338088.5,
			ca: 110347.56,
			ss: 11439.0,
			medicare: 23462.5,
			sdi: 13975.0,
			net: 577687.44
		}
	],
	[
		'I: MFJ $262,000 split 60/40, the Additional Medicare threshold',
		mfj([157200, 104800]),
		{ fed: 40348.0, ca: 15587.72, ss: 16244.0, medicare: 3907.0, sdi: 3406.0, net: 182507.28 }
	],
	[
		'J: MFJ $420,000, 2 kids, CTC partly phased out (federal itemises on SALT alone)',
		mfj([300000, 120000], { children: 2 }),
		{ fed: 74253.67, ca: 29299.72, ss: 18879.0, medicare: 7620.0, sdi: 5460.0, net: 284487.61 }
	]
];

const TOLERANCE = 5;

describe('computeTaxes: the 2026 reference cases', () => {
	it.each(CASES)('%s', (_name, input, expected) => {
		const t = computeTaxes(input, TAX_2026);
		const got = {
			fed: t.federal.tax,
			ca: t.california.tax,
			ss: t.payroll.socialSecurity,
			medicare: t.payroll.medicare,
			sdi: t.payroll.sdi,
			net: t.takeHome
		};
		for (const key of Object.keys(expected) as (keyof Expected)[]) {
			expect(
				Math.abs(got[key] - expected[key]),
				`${key}: ${got[key]} vs ${expected[key]}`
			).toBeLessThanOrEqual(TOLERANCE);
		}
	});

	it('records which deduction each side took', () => {
		const a = computeTaxes(CASES[0][1], TAX_2026);
		expect([a.federal.deduction.kind, a.california.deduction.kind]).toEqual([
			'itemized',
			'itemized'
		]);
		const e = computeTaxes(CASES[4][1], TAX_2026);
		expect([e.federal.deduction.kind, e.california.deduction.kind]).toEqual([
			'standard',
			'standard'
		]);
		const j = computeTaxes(CASES[9][1], TAX_2026);
		expect([j.federal.deduction.kind, j.california.deduction.kind]).toEqual([
			'itemized',
			'standard'
		]);
	});

	it('takes pre-tax deferrals off income tax but not off FICA or SDI', () => {
		const without = computeTaxes(mfj([300000, 100000]), TAX_2026);
		const withK = computeTaxes(mfj([300000, 100000], { deferrals: [24500, 24500] }), TAX_2026);
		expect(withK.payroll).toEqual(without.payroll);
		expect(withK.federal.tax).toBeLessThan(without.federal.tax);
		expect(withK.california.tax).toBeLessThan(without.california.tax);
	});

	it('rejects a deferral list that does not match the earners', () => {
		expect(() => computeTaxes(mfj([100000, 50000], { deferrals: [1000] }), TAX_2026)).toThrow(
			/earner/
		);
	});

	it('rejects a deferral over the earner’s wages or the $24,500 limit', () => {
		expect(() => computeTaxes(mfj([10000], { deferrals: [24500] }), TAX_2026)).toThrow(/deferral/);
		expect(() => computeTaxes(mfj([300000], { deferrals: [30000] }), TAX_2026)).toThrow(/deferral/);
		expect(() => computeTaxes(mfj([300000, 0], { deferrals: [0, 1] }), TAX_2026)).toThrow(
			/deferral/
		);
	});

	it('rejects amounts that are not finite and non-negative, and fractional children', () => {
		expect(() => computeTaxes(mfj([-1]), TAX_2026)).toThrow(/amount/);
		expect(() => computeTaxes(mfj([NaN]), TAX_2026)).toThrow(/amount/);
		expect(() => computeTaxes(mfj([1000], { gifts: Infinity }), TAX_2026)).toThrow(/amount/);
		expect(() => computeTaxes(mfj([1000], { children: 1.5 }), TAX_2026)).toThrow(/children/);
	});

	it('lets a standard-deduction filer deduct cash gifts up to $2,000 MFJ / $1,000 single (§170(p))', () => {
		const base = computeTaxes(mfj([150000, 100000], { children: 2 }), TAX_2026);
		const gave = computeTaxes(mfj([150000, 100000], { children: 2, gifts: 5000 }), TAX_2026);
		expect(gave.federal.deduction).toEqual({ kind: 'standard', amount: 34200 });
		expect(base.federal.tax - gave.federal.tax).toBeCloseTo(2000 * 0.24, 2);
		const one = computeTaxes(single(35152, { gifts: 500 }), TAX_2026);
		expect(one.federal.deduction.amount).toBe(16600);
	});

	it('caps Social Security per earner, not per household', () => {
		const t = computeTaxes(mfj([200000, 200000]), TAX_2026);
		expect(t.payroll.socialSecurity).toBeCloseTo(2 * 184500 * 0.062, 2);
	});

	it('applies the 1% CA surcharge only above $1,000,000 of CA taxable income', () => {
		// Single, standard $5,900: taxable income = wages − $5,900.
		const at = computeTaxes(single(1005900), TAX_2026);
		expect(at.california.taxableIncome).toBe(1000000);
		expect(at.california.behavioralHealthTax).toBe(0);
		const over = computeTaxes(single(1006900), TAX_2026);
		expect(over.california.behavioralHealthTax).toBeCloseTo(10, 6);
	});

	it('starts the CTC phase-out on the first dollar over $400,000 MFJ', () => {
		const at = computeTaxes(mfj([400000], { children: 2 }), TAX_2026);
		expect(at.federal.childTaxCredit).toBe(4400);
		const over = computeTaxes(mfj([400001], { children: 2 }), TAX_2026);
		expect(over.federal.childTaxCredit).toBe(4350);
	});

	it('phases the SALT cap down from $505,000 to its $10,000 floor', () => {
		const salt = (wage: number) =>
			computeTaxes(mfj([wage], { propertyTax: 60000, mortgageInterest: 1 }), TAX_2026).federal
				.saltAllowed;
		expect(salt(505000)).toBe(40400);
		expect(salt(555000)).toBeCloseTo(25400, 6);
		expect(salt(606333.34)).toBeCloseTo(10000, 1);
		expect(salt(700000)).toBe(10000);
	});

	it('taxes nothing on no wages', () => {
		const t = computeTaxes(mfj([0, 0]), TAX_2026);
		expect([t.federal.tax, t.california.tax, t.takeHome]).toEqual([0, 0, 0]);
	});

	it('pins the tax year and marks the estimated CA thresholds', () => {
		expect(TAX_2026.year).toBe(2026);
		expect(TAX_2026.estimates.join(' ')).toMatch(/California.*AGI thresholds/);
	});
});

describe('solveBreakEven', () => {
	// The household mapping defers up to the limit, never past an earner's wages.
	const larkspur = (gross: number) =>
		mfj([gross * 0.85, gross * 0.15], {
			deferrals: [Math.min(24500, gross * 0.85), Math.min(24500, gross * 0.15)],
			children: 2,
			propertyTax: 31077.79,
			mortgageInterest: 136981.24,
			mortgageAverageBalance: 1959674.35,
			gifts: 4396
		});

	it('finds the W-2 gross whose take-home funds the need, to $1', () => {
		const need = 522926.04;
		const { gross, taxes } = solveBreakEven(larkspur, need, TAX_2026);
		expect(Math.abs(gross - 902662)).toBeLessThanOrEqual(1);
		expect(taxes.takeHome - need).toBeGreaterThanOrEqual(0);
		expect(taxes.takeHome - need).toBeLessThanOrEqual(1);
	});

	it('is the smallest such gross: $1 less falls short', () => {
		const need = 200000;
		const { gross } = solveBreakEven((g) => mfj([g]), need, TAX_2026);
		expect(computeTaxes(mfj([gross]), TAX_2026).takeHome).toBeGreaterThanOrEqual(need);
		expect(computeTaxes(mfj([gross - 1]), TAX_2026).takeHome).toBeLessThan(need);
	});

	it('finds the smallest gross even where a phase-out step lowers take-home (Codex 1a repro)', () => {
		const kids = (g: number) => mfj([g], { children: 2 });
		const need = 279807.81432;
		const { gross } = solveBreakEven(kids, need, TAX_2026);
		expect(gross).toBeLessThanOrEqual(400000);
		expect(computeTaxes(kids(gross), TAX_2026).takeHome).toBeGreaterThanOrEqual(need);
		expect(computeTaxes(kids(gross - 1), TAX_2026).takeHome).toBeLessThan(need);
	});

	it('is the smallest across the CA exemption-credit steps too', () => {
		const kids = (g: number) => mfj([g], { children: 2 });
		// Just under the take-home at the top of one $2,500 CA step.
		const top = 521561 + 2500 * 3;
		const need = computeTaxes(kids(top), TAX_2026).takeHome - 0.01;
		const { gross } = solveBreakEven(kids, need, TAX_2026);
		for (let g = Math.floor(gross) - 1; g > gross - 3000; g -= 7) {
			expect(computeTaxes(kids(g), TAX_2026).takeHome).toBeLessThan(need);
		}
	});

	it('needs no wages for a zero need', () => {
		expect(solveBreakEven((g) => mfj([g]), 0, TAX_2026).gross).toBe(0);
	});

	it('refuses a need that is not a finite amount, or beyond its search range', () => {
		expect(() => solveBreakEven((g) => mfj([g]), NaN, TAX_2026)).toThrow(/finite/);
		expect(() => solveBreakEven((g) => mfj([g]), -1, TAX_2026)).toThrow(/finite/);
		expect(() => solveBreakEven((g) => mfj([g]), 1e9, TAX_2026)).toThrow(/range/);
	});
});
