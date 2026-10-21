import { describe, expect, it } from 'vitest';
import type { CoverageItem, HouseholdSheet, LineSpec, LiveKey, LiveRead, LiveReads } from './model';
import { COVERAGE_ITEMS } from './model';
import { defineSheet, priceSheet, METHOD_VERSION } from './price';
import {
	asGift,
	cite,
	employerTaxInputs,
	less,
	live,
	monthly,
	persona,
	spread,
	waterInputs,
	yearly
} from './sheet-kit';
import { computeTaxes, TAX_2026 } from './tax';

const NOW = new Date('2026-10-20T18:00:00.000Z');

const read = (value: number, availability: LiveRead['availability'] = 'ok'): LiveRead => ({
	availability,
	value: availability === 'unavailable' ? null : value,
	observedAt: availability === 'unavailable' ? null : '2026-10-19T10:40:39.208Z',
	maxAgeDays: 10,
	source: 'test'
});
const LIVE_VALUES: Record<LiveKey, number> = {
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
const liveReads = (overrides: Partial<Record<LiveKey, LiveRead>> = {}): LiveReads =>
	({
		...Object.fromEntries(Object.entries(LIVE_VALUES).map(([k, v]) => [k, read(v)])),
		...overrides
	}) as LiveReads;

const coverage = Object.fromEntries(
	COVERAGE_ITEMS.map((item) => [item, { answer: 'priced', where: 'test' }])
) as Record<CoverageItem, { answer: 'priced'; where: string }>;

const LINES: LineSpec[] = [
	{
		id: 't.home.pi',
		section: 'housing',
		label: 'Mortgage (P&I)',
		required: true,
		inputs: {
			price: cite('redfin.larkspur.2024', undefined, 2501250),
			loanToValue: persona(0.8, '20% down'),
			ratePct: persona(6.99, 'rate'),
			termYears: persona(30, '30-yr')
		},
		terms: [{ kind: 'mortgage' }]
	},
	{
		id: 't.home.tax',
		section: 'housing',
		label: 'Property tax',
		required: true,
		propertyTax: true,
		inputs: {
			price: cite('redfin.larkspur.2024'),
			growth: persona(0.02, '2%/yr'),
			years: persona(2, 'years since purchase'),
			base: cite('prop13.baseRate'),
			parcels: persona(1906, 'parcel taxes')
		},
		terms: [
			{ kind: 'grow', base: 'price', rate: 'growth', years: 'years', times: ['base'] },
			yearly('parcels')
		]
	},
	{
		id: 't.util.water',
		section: 'utilities',
		label: 'Water',
		required: true,
		inputs: { units: persona(22, 'units per 2 mo'), ...waterInputs() },
		terms: [{ kind: 'water', unitsBimonthly: 'units' }]
	},
	{
		id: 't.food.coffee',
		section: 'food',
		label: 'Coffee out',
		required: true,
		inputs: { cups: persona(44, '2 adults × 22 workdays'), price: live('coffee.cappuccino') },
		terms: [monthly('cups', 'price')]
	},
	{
		id: 't.cars.lease',
		section: 'cars',
		label: 'Range Rover lease',
		required: true,
		inputs: {
			pay: cite('rangeRover.lease'),
			due: cite('rangeRover.dueAtSigning'),
			months: persona(24, 'lease months')
		},
		terms: [monthly('pay'), spread(['due'], ['months'])]
	},
	{
		id: 't.help.nanny',
		section: 'help',
		label: 'Nanny (employer cost)',
		required: true,
		inputs: {
			rate: cite('careCom.nanny'),
			hours: persona(25, 'h/wk'),
			...employerTaxInputs()
		},
		terms: [{ kind: 'employer', rate: 'rate', hoursPerWeek: 'hours' }]
	},
	{
		id: 't.give',
		section: 'giving',
		label: 'Public media + giving',
		required: true,
		inputs: { kqed: cite('kqed.memberPlus'), other: persona(1000, 'other giving') },
		terms: [asGift(yearly('kqed')), asGift(yearly('other'))]
	},
	{
		id: 't.biz',
		section: 'business',
		label: 'The Business',
		required: false,
		inputs: {
			rent: persona(4000, 'rent'),
			sales: persona(8000, 'sales'),
			wine: live('grocery.silverOak')
		},
		terms: [monthly('rent'), less('sales'), monthly('wine')]
	}
];

type Draft = { -readonly [K in keyof HouseholdSheet]: HouseholdSheet[K] };
const base = (): Draft => ({
	id: 'testtown',
	version: '2026-10-20',
	name: 'Test strivers',
	town: 'Testtown',
	who: '2 adults, 2 kids',
	status: 'mfj',
	split: [0.85, 0.15],
	deferrals: [24500, 24500],
	children: 2,
	afterTaxSavings: 12000,
	savingsNote: 'test',
	purchase: { firstPayment: '2024-07' },
	marketTracker: cite('redfin.larkspur.latest'),
	coverage,
	lines: LINES,
	notModelled: ['clothing']
});

const line = (budget: ReturnType<typeof priceSheet>, id: string) => {
	const found = budget.lines.find((l) => l.id === id);
	if (!found) throw new Error(id);
	return found;
};

/** The textbook amortisation, written out independently of the engine. */
function amortise(principal: number, ratePct: number, years: number) {
	const r = ratePct / 100 / 12;
	const payment = (principal * r) / (1 - (1 + r) ** -(years * 12));
	let balance = principal;
	const rows: { opening: number; interest: number }[] = [];
	for (let i = 0; i < years * 12; i++) {
		const interest = balance * r;
		rows.push({ opening: balance, interest });
		balance -= payment - interest;
	}
	return { payment, rows };
}

describe('priceSheet', () => {
	const sheet = defineSheet(base());

	it('prices each line from its own inputs, with classes in input order', () => {
		const b = priceSheet(sheet, liveReads(), NOW);
		const coffee = line(b, 't.food.coffee');
		expect(coffee.monthly).toBeCloseTo(44 * 5, 6);
		expect(coffee.classes).toEqual(['persona', 'live']);
		expect(coffee.inputs.find((i) => i.name === 'price')).toMatchObject({
			class: 'live',
			value: 5,
			asOf: '2026-10-19T10:40:39.208Z'
		});
		expect(line(b, 't.home.pi').classes).toEqual(['cited', 'persona']);
		expect(line(b, 't.util.water').monthly).toBeCloseTo(
			(15 * 10.86 + 7 * 14.19 + 22 * 0.66 + 92.08) / 2,
			6
		);
		expect(line(b, 't.cars.lease').monthly).toBeCloseTo(999 + 8995 / 24, 6);
		expect(line(b, 't.home.tax').monthly).toBeCloseTo((2501250 * 1.02 ** 2 * 0.01 + 1906) / 12, 6);
		expect(line(b, 't.biz').monthly).toBeCloseTo(4000 - 8000 + 83.49, 6);
	});

	it('prices a household employee at employer cost: wage + FICA + FUTA + CA UI/ETT', () => {
		const wage = 33.62 * 25 * 52;
		const cost = wage + wage * (0.062 + 0.0145) + 7000 * (0.006 + 0.012) + 7000 * (0.034 + 0.001);
		const b = priceSheet(sheet, liveReads(), NOW);
		expect(line(b, 't.help.nanny').monthly).toBeCloseTo(cost / 12, 6);
	});

	it('stamps the town, sheet version, method version and tax year', () => {
		const b = priceSheet(sheet, liveReads(), NOW);
		expect(b).toMatchObject({
			town: 'testtown',
			sheetVersion: '2026-10-20',
			methodVersion: METHOD_VERSION,
			taxYear: 2026,
			pricedAt: NOW.toISOString()
		});
	});

	it('totals the burn and its sections, and the persona shares of it', () => {
		const b = priceSheet(sheet, liveReads(), NOW);
		const sum = b.lines.reduce((s, l) => s + (l.monthly ?? 0), 0);
		expect(b.burnMonthly).toBeCloseTo(sum, 6);
		expect(b.sections.housing).toBeCloseTo(
			line(b, 't.home.pi').monthly! + line(b, 't.home.tax').monthly!,
			6
		);
		// Only the business line is all persona... except its wine is live: so nothing is persona-only.
		expect(b.personaShare.only).toBe(0);
		expect(b.personaShare.any).toBeGreaterThan(0.5);
	});
});

describe('quantities live only on the sheet', () => {
	it('moves a line when, and only when, its sheet quantity moves', () => {
		const more = base();
		more.lines = LINES.map((l) =>
			l.id === 't.food.coffee'
				? { ...l, inputs: { ...l.inputs, cups: persona(88, '2 adults × 44') } }
				: l
		);
		const a = priceSheet(defineSheet(base()), liveReads(), NOW);
		const b = priceSheet(defineSheet(more), liveReads(), NOW);
		expect(line(b, 't.food.coffee').monthly).toBeCloseTo(2 * line(a, 't.food.coffee').monthly!, 6);
		expect(line(b, 't.home.pi').monthly).toBe(line(a, 't.home.pi').monthly);
	});

	it('refuses a term that names an input the line does not declare', () => {
		const bad = base();
		bad.lines = [{ ...LINES[3], terms: [monthly('cups', 'price', 'multiplier')] }];
		expect(() => defineSheet(bad)).toThrow(/multiplier/);
	});

	it('refuses an input no term reads', () => {
		const bad = base();
		bad.lines = [{ ...LINES[3], inputs: { ...LINES[3].inputs, spare: persona(4.3, 'x') } }];
		expect(() => defineSheet(bad)).toThrow(/spare/);
	});

	it('refuses a cited id the catalogue does not have, and duplicate line ids', () => {
		const bad = base();
		bad.lines = [
			{
				...LINES[6],
				inputs: { ...LINES[6].inputs, kqed: { class: 'cited', cite: 'kqed.nope' as never } }
			}
		];
		expect(() => defineSheet(bad)).toThrow(/kqed\.nope/);
		const dup = base();
		dup.lines = [LINES[3], LINES[3]];
		expect(() => defineSheet(dup)).toThrow(/duplicate/);
	});

	it('refuses a sheet that leaves a coverage item unanswered', () => {
		const bad = base();
		const { savings: _drop, ...rest } = coverage;
		bad.coverage = rest as never;
		expect(() => defineSheet(bad)).toThrow(/savings/);
	});

	it('refuses wage shares that do not sum to 1 or do not match the deferrals', () => {
		expect(() => defineSheet({ ...base(), split: [0.8, 0.15] })).toThrow(/split/);
		expect(() => defineSheet({ ...base(), deferrals: [24500] })).toThrow(/deferral/);
	});
});

describe('availability: a fallback is never ok', () => {
	it('carries a stale live input to its line as stale, still priced', () => {
		const b = priceSheet(
			defineSheet(base()),
			liveReads({ 'coffee.cappuccino': read(5, 'stale') }),
			NOW
		);
		expect(line(b, 't.food.coffee')).toMatchObject({ availability: 'stale', monthly: 220 });
		expect(b.complete).toBe(true);
	});

	it('marks a budget incomplete, with break-even suppressed, when a required line is unavailable', () => {
		const b = priceSheet(
			defineSheet(base()),
			liveReads({ 'coffee.cappuccino': read(0, 'unavailable') }),
			NOW
		);
		const coffee = line(b, 't.food.coffee');
		expect(coffee).toMatchObject({ availability: 'unavailable', monthly: null });
		expect(b.complete).toBe(false);
		expect(b.breakEven).toBeNull();
		// The burn still shows, from the lines that are priced; nothing is substituted.
		expect(b.burnMonthly).toBeCloseTo(
			b.lines.filter((l) => l.monthly !== null).reduce((s, l) => s + l.monthly!, 0),
			6
		);
	});

	it('keeps a budget complete when only an optional line is unavailable', () => {
		const b = priceSheet(
			defineSheet(base()),
			liveReads({ 'grocery.silverOak': read(0, 'unavailable') }),
			NOW
		);
		expect(line(b, 't.biz').monthly).toBeNull();
		expect(b.complete).toBe(true);
		expect(b.breakEven).not.toBeNull();
	});

	it('reads a cited figure stale once its offer ends or its re-check lapses, still priced', () => {
		const sheet = defineSheet(base());
		expect(line(priceSheet(sheet, liveReads(), NOW), 't.cars.lease').availability).toBe('ok');
		const afterOffer = priceSheet(sheet, liveReads(), new Date('2026-11-03T08:00:00Z'));
		const lease = line(afterOffer, 't.cars.lease');
		expect(lease.availability).toBe('stale');
		expect(lease.monthly).toBeCloseTo(999 + 8995 / 24, 6);
		expect(lease.inputs.find((i) => i.name === 'pay')).toMatchObject({
			availability: 'stale',
			asOf: '2026-10-20'
		});
		const nanny = (at: string) =>
			line(priceSheet(sheet, liveReads(), new Date(at)), 't.help.nanny');
		// Care.com's rate is re-checked every 90 days, and 2026 payroll rates end with the year.
		expect(nanny('2026-12-30T12:00:00Z').availability).toBe('ok');
		expect(nanny('2027-01-02T12:00:00Z').availability).toBe('stale');
		expect(nanny('2027-01-02T12:00:00Z').inputs.find((i) => i.name === 'ssRate')?.reason).toBe(
			'past 2026-12-31'
		);
	});
});

describe('purchase facts are frozen', () => {
	it('freezes the whole sheet', () => {
		const sheet = defineSheet(base());
		expect(Object.isFrozen(sheet)).toBe(true);
		expect(Object.isFrozen(sheet.lines[0].inputs.price)).toBe(true);
		expect(Object.isFrozen(sheet.purchase)).toBe(true);
	});

	it('refuses a live input on the mortgage line', () => {
		const bad = base();
		bad.lines = [{ ...LINES[0], inputs: { ...LINES[0].inputs, price: live('rivian.lease') } }];
		expect(() => defineSheet(bad)).toThrow(/frozen/);
	});

	it('amortises the frozen loan, and takes 2026’s interest and average balance from it', () => {
		const b = priceSheet(defineSheet(base()), liveReads(), NOW);
		const { payment, rows } = amortise(2501250 * 0.8, 6.99, 30);
		expect(line(b, 't.home.pi').monthly).toBeCloseTo(payment, 6);
		// First payment Jul 2024: payments 19–30 fall in Jan–Dec 2026.
		const year = rows.slice(18, 30);
		expect(b.taxInputs.mortgageInterest).toBeCloseTo(
			year.reduce((s, r) => s + r.interest, 0),
			4
		);
		expect(b.taxInputs.mortgageAverageBalance).toBeCloseTo(
			year.reduce((s, r) => s + r.opening, 0) / 12,
			4
		);
	});

	it('amortises a refinance from the old loan’s balance', () => {
		const mv = base();
		mv.purchase = { firstPayment: '2019-07', refiFirstPayment: '2021-03' };
		mv.lines = [
			{
				...LINES[0],
				inputs: {
					price: cite('redfin.millValley.2019', undefined, 1790000),
					loanToValue: persona(0.8, '20% down'),
					ratePct: persona(3.82, 'rate'),
					termYears: persona(30, '30-yr'),
					refiRatePct: persona(2.75, 'refi rate'),
					refiTermYears: persona(30, '30-yr refi')
				}
			}
		];
		const b = priceSheet(defineSheet(mv), liveReads(), NOW);
		// 19 payments on the old loan (Jul 2019 – Jan 2021), then a new 30-year loan.
		const balance = amortise(1790000 * 0.8, 3.82, 30).rows[19].opening;
		const refi = amortise(balance, 2.75, 30);
		expect(line(b, 't.home.pi').monthly).toBeCloseTo(refi.payment, 6);
		// First refi payment Mar 2021: Jan 2026 is payment 59 (index 58).
		const year = refi.rows.slice(58, 70);
		expect(b.taxInputs.mortgageInterest).toBeCloseTo(
			year.reduce((s, r) => s + r.interest, 0),
			4
		);
	});

	it('charges a paid-off house nothing and deducts no interest', () => {
		const ross = base();
		ross.purchase = { firstPayment: '1998-07', paidOff: true };
		ross.lines = [{ ...LINES[0], inputs: {}, terms: [{ kind: 'mortgage' }] }, ...LINES.slice(1)];
		const b = priceSheet(defineSheet(ross), liveReads(), NOW);
		expect(line(b, 't.home.pi').monthly).toBe(0);
		expect(b.taxInputs.mortgageInterest).toBe(0);
	});

	it('shows today’s town median as context, outside the burn', () => {
		const b = priceSheet(defineSheet(base()), liveReads(), NOW);
		expect(b.marketTracker).toMatchObject({ class: 'cited', value: 3695000 });
		expect(b.lines.some((l) => l.inputs.some((i) => i.value === 3695000))).toBe(false);
	});
});

describe('break-even', () => {
	it('solves the W-2 gross whose take-home funds burn × 12 + after-tax savings', () => {
		const b = priceSheet(defineSheet(base()), liveReads(), NOW);
		expect(b.breakEven).not.toBeNull();
		const { gross, need, taxes } = b.breakEven!;
		expect(need).toBeCloseTo(b.burnMonthly * 12 + 12000, 6);
		expect(taxes.takeHome - need).toBeGreaterThanOrEqual(0);
		expect(taxes.takeHome - need).toBeLessThanOrEqual(1);
		expect(taxes.gross).toBeCloseTo(gross, 6);
	});

	it('files the sheet’s gifts and property tax, and the mortgage’s interest', () => {
		const b = priceSheet(defineSheet(base()), liveReads(), NOW);
		expect(b.taxInputs.gifts).toBeCloseTo(96 + 1000, 6);
		expect(b.taxInputs.propertyTax).toBeCloseTo(line(b, 't.home.tax').monthly! * 12, 6);
		const t = computeTaxes(
			{
				status: 'mfj',
				wages: [b.breakEven!.gross * 0.85, b.breakEven!.gross * 0.15],
				deferrals: [24500, 24500],
				children: 2,
				...b.taxInputs
			},
			TAX_2026
		);
		expect(t.takeHome).toBeCloseTo(b.breakEven!.taxes.takeHome, 6);
	});
});

describe('Codex 1b-i: the mortgage timeline', () => {
	const refiSheet = (purchase: Draft['purchase'], ratePct = 3.82, refiRatePct = 2.75) => {
		const s = base();
		s.purchase = purchase;
		s.lines = [
			{
				...LINES[0],
				inputs: {
					price: cite('redfin.millValley.2019', undefined, 1790000),
					loanToValue: persona(0.8, '20% down'),
					ratePct: persona(ratePct, 'rate'),
					termYears: persona(30, '30-yr'),
					...(purchase.refiFirstPayment
						? {
								refiRatePct: persona(refiRatePct, 'refi rate'),
								refiTermYears: persona(30, '30-yr refi')
							}
						: {})
				}
			}
		];
		return defineSheet(s);
	};

	it('refinances the balance the approved sheet froze: $1,390,344 after 19 payments', () => {
		const b = priceSheet(
			refiSheet({ firstPayment: '2019-07', refiFirstPayment: '2021-03' }),
			liveReads(),
			NOW
		);
		const refi = amortise(1390343.68, 2.75, 30);
		expect(line(b, 't.home.pi').monthly).toBeCloseTo(refi.payment, 1);
		expect(b.taxInputs.mortgageAverageBalance).toBeCloseTo(
			refi.rows.slice(58, 70).reduce((s, r) => s + r.opening, 0) / 12,
			-1
		);
	});

	it('counts both loans in a year with a refinance in it', () => {
		const s = refiSheet({ firstPayment: '2019-07', refiFirstPayment: '2026-07' });
		const b = priceSheet(s, liveReads(), NOW);
		const old = amortise(1790000 * 0.8, 3.82, 30);
		// Jan–May 2026 on the old loan (payments 79–83), June's closing-month interest on it, then the refi.
		const oldPart = old.rows.slice(78, 83).reduce((t, r) => t + r.interest, 0);
		const closingMonth = (old.rows[83].opening * 3.82) / 100 / 12;
		const refi = amortise(old.rows[83].opening, 2.75, 30);
		const newPart = refi.rows.slice(0, 6).reduce((t, r) => t + r.interest, 0);
		expect(b.taxInputs.mortgageInterest).toBeCloseTo(oldPart + closingMonth + newPart, 2);
		// In Oct 2026 the refi is the loan being paid.
		expect(line(b, 't.home.pi').monthly).toBeCloseTo(refi.payment, 6);
	});

	it('pays the original loan until a future refinance starts', () => {
		const s = refiSheet({ firstPayment: '2019-07', refiFirstPayment: '2027-03' });
		const b = priceSheet(s, liveReads(), NOW);
		expect(line(b, 't.home.pi').monthly).toBeCloseTo(amortise(1790000 * 0.8, 3.82, 30).payment, 6);
		expect(b.taxInputs.mortgageInterest).toBeGreaterThan(0);
	});

	it('charges nothing before the first payment or after the loan matures', () => {
		const early = priceSheet(refiSheet({ firstPayment: '2027-01' }), liveReads(), NOW);
		expect(line(early, 't.home.pi').monthly).toBe(0);
		const matured = priceSheet(refiSheet({ firstPayment: '1990-01' }), liveReads(), NOW);
		expect(line(matured, 't.home.pi').monthly).toBe(0);
		expect(matured.taxInputs.mortgageInterest).toBe(0);
	});

	it('amortises a zero-rate loan in a straight line', () => {
		const b = priceSheet(refiSheet({ firstPayment: '2024-07' }, 0), liveReads(), NOW);
		expect(line(b, 't.home.pi').monthly).toBeCloseTo((1790000 * 0.8) / 360, 6);
		expect(b.taxInputs.mortgageInterest).toBe(0);
	});

	it('refuses a mortgage figure that no longer matches the pinned purchase fact', () => {
		const s = base();
		s.lines = [
			{
				...LINES[0],
				inputs: { ...LINES[0].inputs, price: cite('redfin.larkspur.2024', undefined, 2500000) }
			}
		];
		expect(() => defineSheet(s)).toThrow(/pinned/);
		const unpinned = base();
		unpinned.lines = [
			{ ...LINES[0], inputs: { ...LINES[0].inputs, price: cite('redfin.larkspur.2024') } }
		];
		expect(() => defineSheet(unpinned)).toThrow(/pinned/);
	});

	it('refuses a second mortgage term', () => {
		const s = base();
		s.lines = [LINES[0], { ...LINES[0], id: 't.home.pi2' }];
		expect(() => defineSheet(s)).toThrow(/one mortgage/);
	});
});

describe('Codex 1b-i: inputs the engine cannot vouch for', () => {
	it('never prices an ok-looking live read that has no observation time', () => {
		const b = priceSheet(
			defineSheet(base()),
			liveReads({
				'coffee.cappuccino': {
					availability: 'ok',
					value: 5,
					observedAt: null,
					maxAgeDays: 10,
					source: 'x'
				}
			}),
			NOW
		);
		expect(line(b, 't.food.coffee')).toMatchObject({ availability: 'unavailable', monthly: null });
		expect(b.complete).toBe(false);
	});

	it('marks non-finite live values and results unavailable, never NaN in a total', () => {
		const b = priceSheet(
			defineSheet(base()),
			liveReads({ 'coffee.cappuccino': read(Number.NaN) }),
			NOW
		);
		expect(line(b, 't.food.coffee').monthly).toBeNull();
		expect(Number.isFinite(b.burnMonthly)).toBe(true);
		const zero = base();
		zero.lines = [{ ...LINES[4], inputs: { ...LINES[4].inputs, months: persona(0, 'zero') } }];
		const z = priceSheet(defineSheet(zero), liveReads(), NOW);
		expect(line(z, 't.cars.lease')).toMatchObject({ availability: 'unavailable', monthly: null });
	});

	it('refuses a non-finite persona value, an empty factor list and a line with no terms', () => {
		const nan = base();
		nan.lines = [{ ...LINES[3], inputs: { ...LINES[3].inputs, cups: persona(Number.NaN, 'x') } }];
		expect(() => defineSheet(nan)).toThrow(/finite/);
		const empty = base();
		empty.lines = [{ ...LINES[3], terms: [...LINES[3].terms, monthly()] }];
		expect(() => defineSheet(empty)).toThrow(/factor/);
		const none = base();
		none.lines = [{ ...LINES[7], inputs: {}, terms: [] }];
		expect(() => defineSheet(none)).toThrow(/no terms/);
	});

	it('takes persona shares over spending, so a net-income line cannot push them outside 0–1', () => {
		const s = base();
		s.lines = [
			{
				...LINES[7],
				inputs: { rent: persona(100, 'r'), sales: persona(400, 's') },
				terms: [monthly('rent'), less('sales')]
			},
			LINES[3]
		];
		const b = priceSheet(defineSheet(s), liveReads(), NOW);
		expect(b.personaShare).toEqual({ only: 0, any: 1 });
	});

	it('solves a surplus budget to no salary at all', () => {
		const s = base();
		s.afterTaxSavings = 0;
		s.lines = [
			{
				...LINES[7],
				required: true,
				inputs: {
					rent: persona(100, 'r'),
					sales: persona(9000, 's'),
					wine: live('grocery.silverOak')
				}
			}
		];
		const b = priceSheet(defineSheet(s), liveReads(), NOW);
		expect(b.burnMonthly).toBeLessThan(0);
		expect(b.breakEven?.gross).toBe(0);
	});

	it('reads a cited figure stale once its re-check cadence lapses, with no end date involved', () => {
		const b = priceSheet(defineSheet(base()), liveReads(), new Date('2027-01-19T12:00:00Z'));
		// Care.com is re-checked every 90 days and has no end date of its own.
		expect(line(b, 't.help.nanny').inputs.find((i) => i.name === 'rate')).toMatchObject({
			availability: 'stale',
			reason: 're-check due'
		});
	});

	it('caps each earner’s deferral at their wages while solving', () => {
		const s = base();
		s.split = [1, 0];
		const b = priceSheet(defineSheet(s), liveReads(), NOW);
		expect(b.breakEven).not.toBeNull();
		expect(b.breakEven!.taxes.agi).toBeCloseTo(b.breakEven!.gross - 24500, 4);
	});
});

describe('Codex 1b-i re-check', () => {
	it('prices a frozen fact from its pinned figure, whatever the catalogue says', () => {
		const s = base();
		s.lines = [
			{
				...LINES[0],
				inputs: { ...LINES[0].inputs, price: cite('redfin.larkspur.2024', undefined, 1000000) }
			}
		];
		// Bypasses defineSheet (which would refuse the mismatch) to show pricing never reads the catalogue for it.
		const b = priceSheet(s as HouseholdSheet, liveReads(), NOW);
		expect(line(b, 't.home.pi').monthly).toBeCloseTo(amortise(800000, 6.99, 30).payment, 6);
		expect(line(b, 't.home.pi').inputs[0]).toMatchObject({ value: 1000000, class: 'cited' });
	});

	it('re-checks a live read’s age against its own max age: an old "ok" is stale', () => {
		const old: LiveRead = {
			availability: 'ok',
			value: 5,
			observedAt: '2026-10-01T00:00:00.000Z',
			maxAgeDays: 10,
			source: 'x'
		};
		const b = priceSheet(defineSheet(base()), liveReads({ 'coffee.cappuccino': old }), NOW);
		expect(line(b, 't.food.coffee').availability).toBe('stale');
		const future = { ...old, observedAt: '2026-10-21T00:00:00.000Z' };
		const f = priceSheet(defineSheet(base()), liveReads({ 'coffee.cappuccino': future }), NOW);
		expect(line(f, 't.food.coffee').availability).toBe('unavailable');
	});

	it('refuses household numbers outside their domains', () => {
		expect(() => defineSheet({ ...base(), afterTaxSavings: Number.NaN })).toThrow(/savings/);
		expect(() => defineSheet({ ...base(), split: [1.2, -0.2] })).toThrow(/split/);
		expect(() => defineSheet({ ...base(), deferrals: [-1, 0] })).toThrow(/deferral/);
		expect(() => defineSheet({ ...base(), children: 1.5 })).toThrow(/children/);
	});

	it('refuses a mortgage with no term, no price or an impossible loan-to-value', () => {
		const withInput = (name: string, value: number) => {
			const s = base();
			s.lines = [{ ...LINES[0], inputs: { ...LINES[0].inputs, [name]: persona(value, name) } }];
			return s;
		};
		expect(() => defineSheet(withInput('termYears', 0))).toThrow(/termYears/);
		expect(() => defineSheet(withInput('loanToValue', 1.5))).toThrow(/loanToValue/);
		expect(() => defineSheet(withInput('ratePct', -1))).toThrow(/ratePct/);
	});

	it('isolates a defined sheet from later edits to its source', () => {
		const draft = base();
		const sheet = defineSheet(draft);
		(draft.lines[3].inputs.cups as { value: number }).value = 1000;
		expect(line(priceSheet(sheet, liveReads(), NOW), 't.food.coffee').monthly).toBeCloseTo(220, 6);
	});

	it('reports an incomplete budget when every required line is unavailable', () => {
		const s = base();
		s.lines = [LINES[3]];
		const b = priceSheet(
			defineSheet(s),
			liveReads({ 'coffee.cappuccino': read(0, 'unavailable') }),
			NOW
		);
		expect(b).toMatchObject({ complete: false, breakEven: null, burnMonthly: 0 });
	});

	it('needs no salary for a zero burn and no savings, and some for savings alone', () => {
		const s = base();
		s.lines = [
			{
				...LINES[7],
				required: true,
				inputs: { rent: persona(0, 'r'), sales: persona(0, 's'), wine: persona(0, 'w') }
			}
		];
		s.afterTaxSavings = 0;
		expect(priceSheet(defineSheet(s), liveReads(), NOW).breakEven?.gross).toBe(0);
		s.afterTaxSavings = 12000;
		expect(priceSheet(defineSheet(s), liveReads(), NOW).breakEven!.gross).toBeGreaterThan(12000);
	});

	it('keeps the debt in the closing month: its balance and interest count, and the new payment shows', () => {
		const s = base();
		s.purchase = { firstPayment: '2019-07', refiFirstPayment: '2026-07' };
		s.lines = [
			{
				...LINES[0],
				inputs: {
					price: cite('redfin.millValley.2019', undefined, 1790000),
					loanToValue: persona(0.8, 'ltv'),
					ratePct: persona(3.82, 'rate'),
					termYears: persona(30, 'term'),
					refiRatePct: persona(2.75, 'refi'),
					refiTermYears: persona(30, 'refi term')
				}
			}
		];
		const sheet = defineSheet(s);
		const old = amortise(1790000 * 0.8, 3.82, 30);
		const closing = old.rows[83].opening; // owed through June, paid off at closing
		const refi = amortise(closing, 2.75, 30);
		const b = priceSheet(sheet, liveReads(), NOW);
		const openings = [
			...old.rows.slice(78, 83).map((r) => r.opening),
			closing,
			...refi.rows.slice(0, 6).map((r) => r.opening)
		];
		expect(b.taxInputs.mortgageAverageBalance).toBeCloseTo(
			openings.reduce((t, x) => t + x, 0) / 12,
			2
		);
		const interest =
			old.rows.slice(78, 83).reduce((t, r) => t + r.interest, 0) +
			(closing * 3.82) / 100 / 12 +
			refi.rows.slice(0, 6).reduce((t, r) => t + r.interest, 0);
		expect(b.taxInputs.mortgageInterest).toBeCloseTo(interest, 2);
		const june = priceSheet(sheet, liveReads(), new Date('2026-06-15T12:00:00Z'));
		expect(line(june, 't.home.pi').monthly).toBeCloseTo(refi.payment, 6);
	});

	it('refinances from a zero-rate loan', () => {
		const s = base();
		s.purchase = { firstPayment: '2024-01', refiFirstPayment: '2025-01' };
		s.lines = [
			{
				...LINES[0],
				inputs: {
					price: cite('redfin.larkspur.2024', undefined, 2501250),
					loanToValue: persona(0.8, 'ltv'),
					ratePct: persona(0, 'zero'),
					termYears: persona(30, 'term'),
					refiRatePct: persona(6, 'refi'),
					refiTermYears: persona(30, 'refi term')
				}
			}
		];
		const b = priceSheet(defineSheet(s), liveReads(), NOW);
		const principal = 2501250 * 0.8 - ((2501250 * 0.8) / 360) * 11;
		expect(line(b, 't.home.pi').monthly).toBeCloseTo(amortise(principal, 6, 30).payment, 6);
	});
});
