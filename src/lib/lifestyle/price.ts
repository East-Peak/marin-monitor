/**
 * Prices a household sheet: each line from its own declared inputs, each
 * input with its provenance and availability, then the burn and the W-2
 * break-even income. The engine holds no quantities: every number in a line
 * comes from the sheet, the cited catalogue or a live read (unit conversions
 * aside: 12 months, 52 weeks).
 */
import type {
	Availability,
	CitedSource,
	HouseholdSheet,
	InputClass,
	InputSpec,
	LineSpec,
	LiveReads,
	PricedBudget,
	PricedInput,
	PricedLine,
	PurchaseFacts,
	Section,
	Term
} from './model';
import { COVERAGE_ITEMS } from './model';
import { CITED } from './sources';
import { solveBreakEven, TAX_2026, type TaxCase, type TaxParameters } from './tax';

/** Bump when the pricing or tax method changes what a sheet costs. */
export const METHOD_VERSION = 'lifestyle-method-1';

const DAY_MS = 86_400_000;
/** Clock skew, not corruption. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const WEEKS_PER_YEAR = 52;

/** Inputs a term kind reads by fixed name. */
const EMPLOYER_INPUTS = [
	'ssRate',
	'ssWageBase',
	'medicareRate',
	'futaNet',
	'futaWageBase',
	'futaReduction',
	'uiRate',
	'ettRate',
	'uiWageBase'
] as const;
const WATER_INPUTS = ['tier1', 'tier2', 'tier3', 'tier1Units', 'tier2Units', 'watershed', 'fixed'];
const MORTGAGE_INPUTS = ['price', 'loanToValue', 'ratePct', 'termYears'];
const positiveYears = (x: number) => Number.isInteger(x) && x > 0;
const rate = (x: number) => Number.isFinite(x) && x >= 0;
const MORTGAGE_DOMAINS: Readonly<Record<string, (x: number) => boolean>> = {
	price: (x) => Number.isFinite(x) && x > 0,
	loanToValue: (x) => Number.isFinite(x) && x > 0 && x <= 1,
	ratePct: rate,
	termYears: positiveYears,
	refiRatePct: rate,
	refiTermYears: positiveYears
};
const REFI_INPUTS = ['refiRatePct', 'refiTermYears'];

function termReads(term: Term, purchase: PurchaseFacts): string[] {
	switch (term.kind) {
		case 'product':
			return [...term.factors, ...(term.divide ?? [])];
		case 'grow':
			return [term.base, term.rate, term.years, ...term.times];
		case 'employer':
			return [
				term.rate,
				...(term.rateHours ? [term.rateHours] : []),
				term.hoursPerWeek,
				...EMPLOYER_INPUTS
			];
		case 'water':
			return [term.unitsBimonthly, ...WATER_INPUTS];
		case 'mortgage':
			if (purchase.paidOff) return [];
			return [...MORTGAGE_INPUTS, ...(purchase.refiFirstPayment ? REFI_INPUTS : [])];
	}
}

function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
		for (const v of Object.values(value)) deepFreeze(v);
		Object.freeze(value);
	}
	return value;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Checks a sheet is whole and self-consistent, then freezes it. */
export function defineSheet(sheet: HouseholdSheet): HouseholdSheet {
	const fail = (why: string) => {
		throw new Error(`${sheet.id}: ${why}`);
	};
	for (const item of COVERAGE_ITEMS)
		if (!sheet.coverage[item]) fail(`coverage item ${item} unanswered`);
	const isShare = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1;
	if (!sheet.split.every(isShare) || Math.abs(sheet.split.reduce((a, b) => a + b, 0) - 1) > 1e-9)
		fail('wage split must be shares that sum to 1');
	if (sheet.deferrals.length !== sheet.split.length) fail('one deferral per earner');
	if (!sheet.deferrals.every((d) => Number.isFinite(d) && d >= 0))
		fail('each deferral must be a non-negative amount');
	if (!Number.isFinite(sheet.afterTaxSavings) || sheet.afterTaxSavings < 0)
		fail('after-tax savings must be a non-negative amount');
	if (!Number.isInteger(sheet.children) || sheet.children < 0) fail('children must be a count');
	const months = [sheet.purchase.firstPayment, sheet.purchase.refiFirstPayment].filter(Boolean);
	if (!months.every((m) => MONTH.test(m as string))) fail('purchase months must be YYYY-MM');

	const mortgageTerms = sheet.lines.flatMap((l) => l.terms).filter((t) => t.kind === 'mortgage');
	if (mortgageTerms.length > 1) fail('a sheet has at most one mortgage');

	const ids = new Set<string>();
	for (const line of sheet.lines) {
		if (ids.has(line.id)) fail(`duplicate line id ${line.id}`);
		ids.add(line.id);
		if (line.terms.length === 0) fail(`${line.id} has no terms: declare a zero instead`);
		for (const t of line.terms) {
			if (t.kind === 'product' && t.factors.length === 0)
				fail(`${line.id} has a term with no factor`);
		}
		const reads = new Set(line.terms.flatMap((t) => termReads(t, sheet.purchase)));
		for (const name of reads)
			if (!(name in line.inputs)) fail(`${line.id} reads undeclared input ${name}`);
		for (const [name, spec] of Object.entries(line.inputs)) {
			if (!reads.has(name)) fail(`${line.id} declares ${name}, which no term reads`);
			if (spec.class === 'cited' && !(spec.cite in CITED))
				fail(`${line.id} cites unknown ${spec.cite}`);
			if (spec.class === 'persona' && !Number.isFinite(spec.value))
				fail(`${line.id}: ${name} must be a finite number`);
		}
		if (line.terms.some((t) => t.kind === 'mortgage')) {
			for (const [name, spec] of Object.entries(line.inputs)) {
				if (spec.class === 'live')
					fail(`${line.id}: purchase facts are frozen, so ${name} may not be live`);
				if (spec.class === 'cited' && spec.pinned !== CITED[spec.cite].figure) {
					fail(
						`${line.id}: ${name} must be pinned to its frozen figure (${CITED[spec.cite].figure})`
					);
				}
			}
			for (const [name, check] of Object.entries(MORTGAGE_DOMAINS)) {
				const spec = line.inputs[name];
				if (!spec) continue;
				const value =
					spec.class === 'persona' ? spec.value : spec.class === 'cited' ? spec.pinned : NaN;
				if (value === undefined || !check(value)) fail(`${line.id}: ${name} is out of range`);
			}
		}
	}
	for (const [name, spec] of [['marketTracker', sheet.marketTracker]] as const) {
		if (spec.class === 'cited' && !(spec.cite in CITED)) fail(`${name} cites unknown ${spec.cite}`);
	}
	return deepFreeze(structuredClone(sheet));
}

const endOfDay = (date: string) => Date.parse(`${date}T23:59:59.999Z`);

export function priceInput(name: string, spec: InputSpec, live: LiveReads, now: Date): PricedInput {
	switch (spec.class) {
		case 'persona':
			return {
				name,
				label: spec.label,
				class: 'persona',
				value: spec.value,
				availability: 'ok',
				asOf: null,
				source: null
			};
		case 'cited': {
			const src: CitedSource = CITED[spec.cite];
			const lapsed = now.getTime() > endOfDay(src.checkedAt) + src.recheckDays * DAY_MS;
			const ended = src.validUntil !== undefined && now.getTime() > endOfDay(src.validUntil);
			const reason = ended ? `past ${src.validUntil}` : lapsed ? 're-check due' : undefined;
			return {
				name,
				label: spec.label ?? src.label,
				class: 'cited',
				// A frozen fact is priced from the figure written on the sheet.
				value: spec.pinned ?? src.figure,
				availability: reason ? 'stale' : 'ok',
				asOf: src.checkedAt,
				source: `${src.url} (${src.period}; ${src.scope})`,
				...(reason ? { reason } : {})
			};
		}
		case 'live': {
			const read = live[spec.live];
			// A usable read has a finite value and a real observation time, or it is not a read.
			const at = read.observedAt === null ? NaN : Date.parse(read.observedAt);
			const vouched =
				read.availability !== 'unavailable' &&
				typeof read.value === 'number' &&
				Number.isFinite(read.value) &&
				Number.isFinite(at) &&
				at <= now.getTime() + FUTURE_TOLERANCE_MS;
			const tooOld = vouched && now.getTime() - at > read.maxAgeDays * DAY_MS;
			const reason = !vouched
				? (read.reason ?? 'no valid observation')
				: tooOld
					? `older than ${read.maxAgeDays}d`
					: read.reason;
			const availability: Availability = !vouched
				? 'unavailable'
				: tooOld
					? 'stale'
					: read.availability;
			return {
				name,
				label: spec.label ?? read.source,
				class: 'live',
				value: vouched ? read.value : null,
				availability,
				asOf: vouched ? read.observedAt : null,
				source: read.source,
				...(reason ? { reason } : {})
			};
		}
	}
}

/** Months from `from` to `to` (both YYYY-MM). */
function monthsBetween(from: string, to: string): number {
	const [fy, fm] = from.split('-').map(Number);
	const [ty, tm] = to.split('-').map(Number);
	return (ty - fy) * 12 + (tm - fm);
}

const monthOf = (d: Date) =>
	`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

interface Loan {
	readonly principal: number;
	readonly ratePct: number;
	readonly firstPayment: string;
	/** Payments actually made on this loan (a refinance cuts it short). */
	readonly payments: number;
	readonly termYears: number;
}

const monthlyRate = (l: Loan) => l.ratePct / 100 / 12;

function paymentOf(l: Loan): number {
	const r = monthlyRate(l);
	const n = l.termYears * 12;
	return r === 0 ? l.principal / n : (l.principal * r) / (1 - (1 + r) ** -n);
}

/** Opening balance before payment `k` (0-based). */
function balanceBefore(l: Loan, k: number): number {
	const r = monthlyRate(l);
	if (r === 0) return l.principal - paymentOf(l) * k;
	return l.principal * (1 + r) ** k - (paymentOf(l) * ((1 + r) ** k - 1)) / r;
}

/**
 * The household's loans in date order. A refinance closes the month before
 * its first payment; the old loan's last payment is the month before closing.
 */
function loansOf(p: PurchaseFacts, v: Readonly<Record<string, number>>): Loan[] {
	if (p.paidOff) return [];
	const term = v.termYears;
	const original: Loan = {
		principal: v.price * v.loanToValue,
		ratePct: v.ratePct,
		firstPayment: p.firstPayment,
		payments: term * 12,
		termYears: term
	};
	if (!p.refiFirstPayment) return [original];
	const made = Math.min(
		term * 12,
		Math.max(0, monthsBetween(p.firstPayment, p.refiFirstPayment) - 1)
	);
	const old = { ...original, payments: made };
	return [
		old,
		{
			principal: balanceBefore(original, made),
			ratePct: v.refiRatePct,
			firstPayment: p.refiFirstPayment,
			payments: v.refiTermYears * 12,
			termYears: v.refiTermYears
		}
	];
}

/** The loan and payment index falling due in `month`, if any. */
function dueIn(loans: readonly Loan[], month: string): { loan: Loan; k: number } | null {
	for (const loan of loans) {
		const k = monthsBetween(loan.firstPayment, month);
		if (k >= 0 && k < loan.payments) return { loan, k };
	}
	return null;
}

const addMonths = (month: string, n: number) => {
	const [y, m] = month.split('-').map(Number);
	const t = y * 12 + (m - 1) + n;
	return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

/**
 * What is owed in `month`: a payment's opening balance, or in a refinance's
 * closing month (no payment due) the old loan's balance, accruing at its rate
 * until payoff, with the new loan's payment coming due.
 */
function owedIn(loans: readonly Loan[], month: string) {
	const due = dueIn(loans, month);
	if (due) {
		const { loan, k } = due;
		return { opening: balanceBefore(loan, k), rate: monthlyRate(loan), payment: paymentOf(loan) };
	}
	const [old, refi] = loans;
	if (refi && old.payments > 0 && month === addMonths(refi.firstPayment, -1)) {
		return { opening: refi.principal, rate: monthlyRate(old), payment: paymentOf(refi) };
	}
	return null;
}

/** Interest paid in the tax year and the year's average balance (Pub 936), across a refinance. */
function loanYear(loans: readonly Loan[], year: number) {
	let interest = 0;
	let balances = 0;
	for (let m = 1; m <= 12; m++) {
		const owed = owedIn(loans, `${year}-${String(m).padStart(2, '0')}`);
		if (!owed) continue;
		interest += owed.opening * owed.rate;
		balances += owed.opening;
	}
	return { interest, averageBalance: balances / 12 };
}

function employerAnnual(
	t: Extract<Term, { kind: 'employer' }>,
	v: Readonly<Record<string, number>>
) {
	const wage =
		(v[t.rate] / (t.rateHours ? v[t.rateHours] : 1)) * v[t.hoursPerWeek] * WEEKS_PER_YEAR;
	const fica = Math.min(wage, v.ssWageBase) * v.ssRate + wage * v.medicareRate;
	const futa = Math.min(wage, v.futaWageBase) * (v.futaNet + v.futaReduction);
	const ui = Math.min(wage, v.uiWageBase) * (v.uiRate + v.ettRate);
	return wage + fica + futa + ui;
}

function termMonthly(
	term: Term,
	v: Readonly<Record<string, number>>,
	purchase: PurchaseFacts,
	now: Date
): number {
	const product = (names: readonly string[]) => names.reduce((p, n) => p * v[n], 1);
	switch (term.kind) {
		case 'product': {
			const annualOrMonthly =
				((term.sign ?? 1) * product(term.factors)) / product(term.divide ?? []);
			return term.per === 'year' ? annualOrMonthly / 12 : annualOrMonthly;
		}
		case 'grow':
			return (v[term.base] * (1 + v[term.rate]) ** v[term.years] * product(term.times)) / 12;
		case 'employer':
			return employerAnnual(term, v) / 12;
		case 'water': {
			const u = v[term.unitsBimonthly];
			const bimonthly =
				Math.min(u, v.tier1Units) * v.tier1 +
				Math.max(0, Math.min(u, v.tier2Units) - v.tier1Units) * v.tier2 +
				Math.max(0, u - v.tier2Units) * v.tier3 +
				u * v.watershed +
				v.fixed;
			return bimonthly / 2;
		}
		case 'mortgage':
			return owedIn(loansOf(purchase, v), monthOf(now))?.payment ?? 0;
	}
}

const WORST: readonly Availability[] = ['unavailable', 'stale', 'ok'];
const worst = (xs: readonly Availability[]): Availability =>
	WORST.find((a) => xs.includes(a)) ?? 'ok';

interface Priced {
	readonly line: PricedLine;
	/** Deductible cash gifts in this line, per year. */
	readonly gifts: number;
	readonly values: Readonly<Record<string, number>> | null;
}

function priceLine(spec: LineSpec, sheet: HouseholdSheet, live: LiveReads, now: Date): Priced {
	const inputs = Object.entries(spec.inputs).map(([name, s]) => priceInput(name, s, live, now));
	const classes = [...new Set(inputs.map((i) => i.class))] as InputClass[];
	const availability = worst(inputs.map((i) => i.availability));
	const base = {
		id: spec.id,
		section: spec.section,
		label: spec.label,
		required: spec.required,
		availability,
		classes: classes.length ? classes : (['persona'] as InputClass[]),
		inputs,
		...(spec.note ? { note: spec.note } : {})
	};
	if (availability === 'unavailable')
		return { line: { ...base, monthly: null }, gifts: 0, values: null };

	const values = Object.fromEntries(inputs.map((i) => [i.name, i.value as number]));
	const term = (t: Term) => termMonthly(t, values, sheet.purchase, now);
	const monthly = spec.terms.reduce((s, t) => s + term(t), 0);
	if (!Number.isFinite(monthly)) {
		const line = {
			...base,
			availability: 'unavailable' as const,
			monthly: null,
			reason: 'not computable'
		};
		return { line, gifts: 0, values: null };
	}
	const gifts = spec.terms.filter((t) => t.gift).reduce((s, t) => s + 12 * term(t), 0);
	return { line: { ...base, monthly }, gifts, values };
}

export function priceSheet(
	sheet: HouseholdSheet,
	live: LiveReads,
	now: Date,
	tax: TaxParameters = TAX_2026
): PricedBudget {
	const priced = sheet.lines.map((spec) => priceLine(spec, sheet, live, now));
	const lines = priced.map((p) => p.line);
	const counted = lines.filter((l) => l.monthly !== null);
	const burnMonthly = counted.reduce((s, l) => s + (l.monthly as number), 0);
	const complete = lines.every((l) => !l.required || l.monthly !== null);

	const sections: Partial<Record<Section, number>> = {};
	for (const l of counted) sections[l.section] = (sections[l.section] ?? 0) + (l.monthly as number);

	// Shares of spending: a net-income line (a profitable business) is not spending.
	const spending = counted.filter((l) => (l.monthly as number) > 0);
	const spent = (ls: readonly PricedLine[]) => ls.reduce((s, l) => s + (l.monthly as number), 0);
	const share = (keep: (l: PricedLine) => boolean) =>
		spent(spending) > 0 ? spent(spending.filter(keep)) / spent(spending) : 0;
	const personaShare = {
		only: share((l) => l.classes.length === 1 && l.classes[0] === 'persona'),
		any: share((l) => l.classes.includes('persona'))
	};

	const mortgage = priced.find((p) =>
		sheet.lines.find((s) => s.id === p.line.id)!.terms.some((t) => t.kind === 'mortgage')
	);
	const loans = mortgage?.values ? loansOf(sheet.purchase, mortgage.values) : [];
	const { interest, averageBalance } = loanYear(loans, tax.year);
	const taxInputs = {
		propertyTax: sheet.lines.reduce(
			(s, spec, i) => s + (spec.propertyTax ? 12 * (lines[i].monthly ?? 0) : 0),
			0
		),
		mortgageInterest: interest,
		mortgageAverageBalance: averageBalance,
		gifts: priced.reduce((s, p) => s + p.gifts, 0)
	};

	const caseFor = (gross: number): TaxCase => ({
		status: sheet.status,
		wages: sheet.split.map((share) => gross * share),
		deferrals: sheet.split.map((share, i) => Math.min(sheet.deferrals[i], gross * share)),
		children: sheet.children,
		...taxInputs
	});
	const need = burnMonthly * 12 + sheet.afterTaxSavings;
	// A surplus (net income beyond spending) needs no salary at all.
	const breakEven = complete ? { need, ...solveBreakEven(caseFor, Math.max(0, need), tax) } : null;

	return {
		town: sheet.id,
		sheetVersion: sheet.version,
		methodVersion: METHOD_VERSION,
		taxYear: tax.year,
		pricedAt: now.toISOString(),
		lines,
		sections,
		burnMonthly,
		complete,
		breakEven,
		marketTracker: priceInput('marketTracker', sheet.marketTracker, live, now),
		taxInputs,
		personaShare
	};
}
