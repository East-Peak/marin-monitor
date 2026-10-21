/**
 * Federal and California income tax plus payroll tax on W-2 wages, for one
 * pinned tax year, and the break-even solver built on it.
 *
 * Supported: federal standard vs itemised (SALT cap with its income
 * phase-down, the $750k mortgage-interest limit, the 0.5%-of-AGI gift floor,
 * the §68 2/37 limit), the non-itemiser gift deduction (§170(p)), the child
 * tax credit and its phase-out, Additional Medicare; California's own itemised rules (no SALT cap, property tax in
 * full, the $1M mortgage limit, no gift floor, the itemised limitation),
 * exemption credits and their phase-out, the 1% Behavioral Health Services
 * Tax over $1M, and SDI on all wages.
 *
 * Not modelled: investment or business income, AMT, NIIT, any deductible
 * business loss, estimated-payment timing (CA tax counts as paid in-year).
 */

export type FilingStatus = 'mfj' | 'single';

type Bracket = readonly [upTo: number | null, rate: number];
type ByStatus<T> = Readonly<Record<FilingStatus, T>>;

export interface TaxParameters {
	readonly year: number;
	/** Parameters that are estimates until their publisher's final release. */
	readonly estimates: readonly string[];
	readonly federal: {
		readonly brackets: ByStatus<readonly Bracket[]>;
		readonly standardDeduction: ByStatus<number>;
		readonly saltCap: number;
		readonly saltFloor: number;
		readonly saltPhaseDownStart: number;
		readonly saltPhaseDownRate: number;
		readonly mortgageDebtLimit: number;
		readonly giftFloorShareOfAgi: number;
		readonly childTaxCredit: number;
		readonly childTaxCreditPhaseOut: ByStatus<number>;
		/** §170(p): cash gifts a non-itemiser may still deduct. */
		readonly nonItemizerGiftCap: ByStatus<number>;
		/** §402(g) elective deferral limit per earner (no catch-up: every earner here is under 50). */
		readonly electiveDeferralLimit: number;
	};
	readonly california: {
		readonly brackets: ByStatus<readonly Bracket[]>;
		readonly standardDeduction: ByStatus<number>;
		readonly mortgageDebtLimit: number;
		readonly agiThreshold: ByStatus<number>;
		readonly personalCredit: number;
		readonly dependentCredit: number;
		readonly behavioralHealthThreshold: number;
		readonly behavioralHealthRate: number;
		readonly sdiRate: number;
	};
	readonly payroll: {
		readonly socialSecurityRate: number;
		readonly socialSecurityWageBase: number;
		readonly medicareRate: number;
		readonly additionalMedicareRate: number;
		readonly additionalMedicareThreshold: ByStatus<number>;
	};
}

/** California's 2026 AGI thresholds publish in late December; until then, 2025's × 1.034. */
const CA_2026_AGI_THRESHOLD = {
	mfj: Math.round(504411 * 1.034),
	single: Math.round(252203 * 1.034)
};

/** Tax year 2026: Rev. Proc. 2025-32, IRC 164(b)(7), 170(b)(1)(I), 68; FTB's October 2026 indexing. */
export const TAX_2026: TaxParameters = {
	year: 2026,
	estimates: [
		'California 2026 AGI thresholds (itemised limitation, exemption-credit phase-out): 2025 × 1.034 until FTB publishes'
	],
	federal: {
		brackets: {
			mfj: [
				[24800, 0.1],
				[100800, 0.12],
				[211400, 0.22],
				[403550, 0.24],
				[512450, 0.32],
				[768700, 0.35],
				[null, 0.37]
			],
			single: [
				[12400, 0.1],
				[50400, 0.12],
				[105700, 0.22],
				[201775, 0.24],
				[256225, 0.32],
				[640600, 0.35],
				[null, 0.37]
			]
		},
		standardDeduction: { mfj: 32200, single: 16100 },
		saltCap: 40400,
		saltFloor: 10000,
		saltPhaseDownStart: 505000,
		saltPhaseDownRate: 0.3,
		mortgageDebtLimit: 750000,
		giftFloorShareOfAgi: 0.005,
		childTaxCredit: 2200,
		childTaxCreditPhaseOut: { mfj: 400000, single: 200000 },
		nonItemizerGiftCap: { mfj: 2000, single: 1000 },
		electiveDeferralLimit: 24500
	},
	california: {
		brackets: {
			mfj: [
				[22912, 0.01],
				[54314, 0.02],
				[85722, 0.04],
				[118996, 0.06],
				[150394, 0.08],
				[768218, 0.093],
				[921854, 0.103],
				[1536426, 0.113],
				[null, 0.123]
			],
			single: [
				[11456, 0.01],
				[27157, 0.02],
				[42861, 0.04],
				[59498, 0.06],
				[75197, 0.08],
				[384109, 0.093],
				[460927, 0.103],
				[768213, 0.113],
				[null, 0.123]
			]
		},
		standardDeduction: { mfj: 11800, single: 5900 },
		mortgageDebtLimit: 1000000,
		agiThreshold: CA_2026_AGI_THRESHOLD,
		personalCredit: 158,
		dependentCredit: 491,
		behavioralHealthThreshold: 1000000,
		behavioralHealthRate: 0.01,
		sdiRate: 0.013
	},
	payroll: {
		socialSecurityRate: 0.062,
		socialSecurityWageBase: 184500,
		medicareRate: 0.0145,
		additionalMedicareRate: 0.009,
		additionalMedicareThreshold: { mfj: 250000, single: 200000 }
	}
};

export interface TaxCase {
	readonly status: FilingStatus;
	/** W-2 wages, one entry per earner. */
	readonly wages: readonly number[];
	/** Traditional 401(k) deferrals, one per earner: off income tax, not off FICA or SDI. */
	readonly deferrals: readonly number[];
	/** Qualifying children (federal CTC) and dependents (CA credit). */
	readonly children: number;
	readonly propertyTax: number;
	readonly mortgageInterest: number;
	/** Average acquisition-debt balance over the year (Pub 936 allocation). */
	readonly mortgageAverageBalance: number;
	readonly gifts: number;
}

export interface Deduction {
	readonly kind: 'standard' | 'itemized';
	readonly amount: number;
}

export interface TaxResult {
	readonly gross: number;
	readonly agi: number;
	readonly federal: {
		readonly saltAllowed: number;
		readonly deduction: Deduction;
		readonly taxableIncome: number;
		readonly childTaxCredit: number;
		readonly tax: number;
	};
	readonly california: {
		readonly deduction: Deduction;
		readonly taxableIncome: number;
		readonly exemptionCredits: number;
		readonly behavioralHealthTax: number;
		readonly tax: number;
	};
	readonly payroll: {
		readonly socialSecurity: number;
		/** Medicare including Additional Medicare. */
		readonly medicare: number;
		readonly sdi: number;
	};
	/** gross − all taxes − pre-tax deferrals. */
	readonly takeHome: number;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function bracketTax(income: number, brackets: readonly Bracket[]): number {
	let tax = 0;
	let lower = 0;
	for (const [upTo, rate] of brackets) {
		const top = upTo === null ? income : Math.min(income, upTo);
		if (top > lower) tax += (top - lower) * rate;
		if (upTo === null || income <= upTo) break;
		lower = upTo;
	}
	return tax;
}

/** Interest on acquisition debt up to `limit`, allocated by average balance. */
function deductibleInterest(c: TaxCase, limit: number): number {
	if (c.mortgageAverageBalance <= 0) return 0;
	return c.mortgageInterest * Math.min(1, limit / c.mortgageAverageBalance);
}

function deduction(standard: number, itemized: number): Deduction {
	return itemized > standard
		? { kind: 'itemized', amount: itemized }
		: { kind: 'standard', amount: standard };
}

function california(c: TaxCase, agi: number, p: TaxParameters['california']) {
	const threshold = p.agiThreshold[c.status];
	const itemized = c.propertyTax + deductibleInterest(c, p.mortgageDebtLimit) + c.gifts;
	const limited =
		agi > threshold ? itemized - Math.min(0.06 * (agi - threshold), 0.8 * itemized) : itemized;
	const ded = deduction(p.standardDeduction[c.status], limited);
	const taxableIncome = Math.max(0, agi - ded.amount);

	// $6 off each credit per $2,500 (or part) of AGI over the threshold.
	const cut = 6 * Math.ceil(Math.max(0, agi - threshold) / 2500);
	const personal = (c.status === 'mfj' ? 2 : 1) * Math.max(0, p.personalCredit - cut);
	const dependent = c.children * Math.max(0, p.dependentCredit - cut);
	const exemptionCredits = personal + dependent;

	const behavioralHealthTax =
		Math.max(0, taxableIncome - p.behavioralHealthThreshold) * p.behavioralHealthRate;
	const tax =
		Math.max(0, bracketTax(taxableIncome, p.brackets[c.status]) - exemptionCredits) +
		behavioralHealthTax;
	return { deduction: ded, taxableIncome, exemptionCredits, behavioralHealthTax, tax };
}

function federal(c: TaxCase, agi: number, stateIncomeTax: number, p: TaxParameters['federal']) {
	const brackets = p.brackets[c.status];
	const cap = Math.max(
		p.saltFloor,
		p.saltCap - p.saltPhaseDownRate * Math.max(0, agi - p.saltPhaseDownStart)
	);
	const saltAllowed = Math.min(stateIncomeTax + c.propertyTax, cap);
	const gifts = Math.max(0, c.gifts - p.giftFloorShareOfAgi * agi);
	const itemized = saltAllowed + deductibleInterest(c, p.mortgageDebtLimit) + gifts;

	// §68: 2/37 of the lesser of itemised deductions or income over the 37% bracket's start.
	// With no other deductions, "taxable income plus itemised deductions" is AGI.
	const top37Start = brackets[brackets.length - 2][0] as number;
	const standard = p.standardDeduction[c.status];
	const reduction =
		itemized > standard ? (2 / 37) * Math.min(itemized, Math.max(0, agi - top37Start)) : 0;
	const nonItemizerGifts = Math.min(c.gifts, p.nonItemizerGiftCap[c.status]);
	const ded = deduction(standard + nonItemizerGifts, itemized - reduction);
	const taxableIncome = Math.max(0, agi - ded.amount);

	const phaseOut = 50 * Math.ceil(Math.max(0, agi - p.childTaxCreditPhaseOut[c.status]) / 1000);
	const childTaxCredit = Math.max(0, c.children * p.childTaxCredit - phaseOut);
	const tax = Math.max(0, bracketTax(taxableIncome, brackets) - childTaxCredit);
	return { saltAllowed, deduction: ded, taxableIncome, childTaxCredit, tax };
}

const isAmount = (x: number) => Number.isFinite(x) && x >= 0;

function validate(c: TaxCase, p: TaxParameters): void {
	if (c.deferrals.length !== c.wages.length) {
		throw new Error(`${c.wages.length} earner(s) but ${c.deferrals.length} deferral(s)`);
	}
	const amounts = [
		...c.wages,
		c.propertyTax,
		c.mortgageInterest,
		c.mortgageAverageBalance,
		c.gifts
	];
	if (!amounts.every(isAmount))
		throw new Error('every amount must be a finite, non-negative number');
	if (!Number.isInteger(c.children) || c.children < 0) throw new Error('children must be a count');
	c.deferrals.forEach((d, i) => {
		if (!isAmount(d) || d > c.wages[i] || d > p.federal.electiveDeferralLimit) {
			throw new Error(`earner ${i + 1}'s deferral must be within their wages and the limit`);
		}
	});
}

export function computeTaxes(c: TaxCase, p: TaxParameters): TaxResult {
	validate(c, p);
	const gross = sum(c.wages);
	const agi = gross - sum(c.deferrals);

	const pay = p.payroll;
	const socialSecurity = sum(
		c.wages.map((w) => Math.min(w, pay.socialSecurityWageBase) * pay.socialSecurityRate)
	);
	const medicare =
		gross * pay.medicareRate +
		Math.max(0, gross - pay.additionalMedicareThreshold[c.status]) * pay.additionalMedicareRate;
	const sdi = gross * p.california.sdiRate;

	const ca = california(c, agi, p.california);
	// CA income tax and SDI are state income taxes paid in the year.
	const fed = federal(c, agi, ca.tax + sdi, p.federal);

	const takeHome = gross - fed.tax - ca.tax - socialSecurity - medicare - sdi - sum(c.deferrals);
	return {
		gross,
		agi,
		federal: fed,
		california: ca,
		payroll: { socialSecurity, medicare, sdi },
		takeHome
	};
}

const SEARCH_CEILING = 20_000_000;

/**
 * AGIs just above which take-home drops: each $1,000 step of the CTC
 * phase-out and each $2,500 step of the CA exemption-credit phase-out.
 * Between them take-home rises with gross (no marginal rate reaches 100%).
 */
function takeHomeDrops(c: TaxCase, p: TaxParameters): number[] {
	const steps = (start: number, width: number, count: number) =>
		Array.from({ length: count }, (_, k) => start + k * width);
	const ctc = c.children * p.federal.childTaxCredit;
	const caCredit = Math.max(
		p.california.personalCredit,
		c.children > 0 ? p.california.dependentCredit : 0
	);
	return [
		...steps(p.federal.childTaxCreditPhaseOut[c.status], 1000, Math.ceil(ctc / 50)),
		...steps(p.california.agiThreshold[c.status], 2500, Math.ceil(caCredit / 6))
	];
}

/** The largest gross (to $0.001) whose AGI does not pass `agi`; AGI rises with gross. */
function grossAtAgi(caseFor: (gross: number) => TaxCase, agi: number): number {
	const agiOf = (g: number) => {
		const c = caseFor(g);
		return sum(c.wages) - sum(c.deferrals);
	};
	let lo = 0;
	let hi = SEARCH_CEILING;
	if (agiOf(hi) <= agi) return hi;
	while (hi - lo > 0.001) {
		const mid = (lo + hi) / 2;
		if (agiOf(mid) <= agi) lo = mid;
		else hi = mid;
	}
	return lo;
}

/**
 * The smallest W-2 gross (to $1) whose take-home covers `need`: the cash-flow
 * equation gross − taxes − deferrals = burn + after-tax savings.
 *
 * Take-home is not monotonic in gross (the phase-outs step down), so the range
 * is cut at every drop; the first piece whose top end funds the need holds the
 * answer, and take-home rises within it, so bisection finds it to $1.
 */
export function solveBreakEven(
	caseFor: (gross: number) => TaxCase,
	need: number,
	p: TaxParameters
): { gross: number; taxes: TaxResult } {
	if (!isAmount(need)) throw new Error('need must be a finite, non-negative amount');
	const takeHome = (g: number) => computeTaxes(caseFor(g), p).takeHome;
	const done = (g: number) => ({ gross: g, taxes: computeTaxes(caseFor(g), p) });
	if (takeHome(0) >= need) return done(0);

	const sample = caseFor(SEARCH_CEILING);
	const tops = [...new Set(takeHomeDrops(sample, p).map((agi) => grossAtAgi(caseFor, agi)))].sort(
		(a, b) => a - b
	);
	tops.push(SEARCH_CEILING);

	let lo = 0;
	for (const top of tops) {
		if (top <= lo) continue;
		if (takeHome(top) < need) {
			lo = top;
			continue;
		}
		let hi = top;
		while (hi - lo > 1) {
			const mid = (lo + hi) / 2;
			if (takeHome(mid) >= need) hi = mid;
			else lo = mid;
		}
		return done(hi);
	}
	throw new Error(`need $${need} is beyond the $${SEARCH_CEILING} search range`);
}
