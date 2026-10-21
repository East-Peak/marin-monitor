/**
 * The Lifestyle Index's vocabulary: a household sheet (pure config, the only
 * place quantities live), the inputs its lines are priced from, and the
 * priced budget the engine returns.
 *
 * Provenance is per input: `live` is our own read with its upstream
 * observation time, `cited` a published figure with its source and check
 * date, `persona` a stated assumption about this household. Availability is
 * separate: a fallback or default is never `ok`.
 */
import type { CitedId } from './sources';
import type { FilingStatus, TaxResult } from './tax';

export type InputClass = 'live' | 'cited' | 'persona';
export type Availability = 'ok' | 'stale' | 'unavailable';

export const SECTIONS = [
	'housing',
	'utilities',
	'health',
	'cars',
	'food',
	'kids',
	'help',
	'wellness',
	'travel',
	'belonging',
	'giving',
	'business'
] as const;
export type Section = (typeof SECTIONS)[number];

/** Decision 3: every sheet answers each item. */
export const COVERAGE_ITEMS = [
	'housing',
	'utilities',
	'health',
	'cars',
	'food',
	'kids.school',
	'kids.activities',
	'kids.camp',
	'kids.childcare',
	'help',
	'wellness',
	'travel',
	'belonging',
	'giving',
	'business',
	'savings'
] as const;
export type CoverageItem = (typeof COVERAGE_ITEMS)[number];
export interface CoverageAnswer {
	readonly answer: 'priced' | 'persona' | 'excluded';
	readonly where: string;
}

/** A published figure, read on the publisher's own page, PDF or dataset. */
export interface CitedSource {
	readonly figure: number;
	readonly label: string;
	readonly url: string;
	readonly period: string;
	readonly scope: string;
	/** When we last read the figure there (YYYY-MM-DD). */
	readonly checkedAt: string;
	/** Re-check cadence: stale once this many days pass after checkedAt. */
	readonly recheckDays: number;
	/** An offer's or schedule's own end date (YYYY-MM-DD): stale after it. */
	readonly validUntil?: string;
}

export type LiveKey =
	| 'gas.regular'
	| 'coffee.cappuccino'
	| 'grocery.collagen'
	| 'grocery.manuka'
	| 'grocery.kombucha'
	| 'grocery.oatMilk'
	| 'grocery.silverOak'
	| 'ikon.adult'
	| 'rivian.lease';

/** One live value as read from our own data, with its own observation time. */
export interface LiveRead {
	readonly availability: Availability;
	readonly value: number | null;
	/** Upstream observation time (our last successful read), never a blob write time. */
	readonly observedAt: string | null;
	readonly source: string;
	/** Why it is not `ok`, when it isn't. */
	readonly reason?: string;
}
export type LiveReads = Readonly<Record<LiveKey, LiveRead>>;

export type InputSpec =
	| { readonly class: 'persona'; readonly label: string; readonly value: number }
	| {
			readonly class: 'cited';
			readonly label?: string;
			readonly cite: CitedId;
			/** A frozen fact's figure, written on the sheet: a catalogue revision must not move it. */
			readonly pinned?: number;
	  }
	| { readonly class: 'live'; readonly label?: string; readonly live: LiveKey };

/** Input names local to one line. */
export type Inputs = Readonly<Record<string, InputSpec>>;

/**
 * One additive piece of a line, in dollars:
 * - `product`: sign × Π factors ÷ Π divide, per month or per year;
 * - `grow`: base × (1 + rate)^years × Π times, per year (a Prop 13 assessed value);
 * - `employer`: a W-2 household employee's all-in annual cost;
 * - `water`: MMWD's tiered bimonthly bill;
 * - `mortgage`: the sheet's frozen purchase facts, amortised.
 * `gift` marks a term whose annual amount is a deductible cash gift.
 */
export type Term = (
	| {
			readonly kind: 'product';
			readonly per: 'month' | 'year';
			readonly factors: readonly string[];
			readonly divide?: readonly string[];
			readonly sign?: 1 | -1;
	  }
	| {
			readonly kind: 'grow';
			readonly base: string;
			readonly rate: string;
			readonly years: string;
			readonly times: readonly string[];
	  }
	| {
			readonly kind: 'employer';
			/** The pay rate, and the hours it covers (1 for an hourly rate). */
			readonly rate: string;
			readonly rateHours?: string;
			readonly hoursPerWeek: string;
	  }
	| { readonly kind: 'water'; readonly unitsBimonthly: string }
	| { readonly kind: 'mortgage' }
) & { readonly gift?: true };

export interface LineSpec {
	/** Stable across sheet versions: history and movers key on it. */
	readonly id: string;
	readonly section: Section;
	readonly label: string;
	readonly inputs: Inputs;
	readonly terms: readonly Term[];
	/** A required line that cannot be priced makes the budget incomplete. */
	readonly required: boolean;
	/** Counts toward property tax on the tax return. */
	readonly propertyTax?: true;
	readonly note?: string;
}

/**
 * Frozen at purchase: never moves with today's market. The dates live here;
 * the price, loan-to-value, rate and term are the mortgage line's own inputs
 * (`price`, `loanToValue`, `ratePct`, `termYears`, and `refiRatePct`,
 * `refiTermYears` after a refinance), and none of them may be live.
 */
export interface PurchaseFacts {
	/** Month of the first payment (YYYY-MM). */
	readonly firstPayment: string;
	/** A refinance: its first payment month. The old loan's last payment is the month before that. */
	readonly refiFirstPayment?: string;
	readonly paidOff?: true;
}

export interface HouseholdSheet {
	readonly id: string;
	readonly version: string;
	readonly name: string;
	readonly town: string;
	readonly who: string;
	readonly status: FilingStatus;
	/** Each earner's share of W-2 wages. */
	readonly split: readonly number[];
	/** Pre-tax 401(k) per earner, per year. */
	readonly deferrals: readonly number[];
	readonly children: number;
	/** After-tax savings per year (529s): outside the burn, inside the need. */
	readonly afterTaxSavings: number;
	readonly savingsNote: string;
	readonly purchase: PurchaseFacts;
	/** Today's town median: context only, never a purchase price. */
	readonly marketTracker: InputSpec;
	readonly coverage: Readonly<Record<CoverageItem, CoverageAnswer>>;
	readonly lines: readonly LineSpec[];
	/** Listed on the page as not modelled. */
	readonly notModelled: readonly string[];
}

export interface PricedInput {
	readonly name: string;
	readonly label: string;
	readonly class: InputClass;
	readonly value: number | null;
	readonly availability: Availability;
	/** Live: upstream observation time. Cited: the check date. */
	readonly asOf: string | null;
	readonly source: string | null;
	readonly reason?: string;
}

export interface PricedLine {
	readonly id: string;
	readonly section: Section;
	readonly label: string;
	readonly required: boolean;
	/** null when an input is unavailable: never a substituted value. */
	readonly monthly: number | null;
	readonly availability: Availability;
	/** The inputs' classes, in input order, e.g. ['persona', 'live']. */
	readonly classes: readonly InputClass[];
	readonly inputs: readonly PricedInput[];
	readonly note?: string;
	/** Why the line could not be priced from available inputs. */
	readonly reason?: string;
}

export interface BreakEven {
	readonly gross: number;
	/** burn × 12 + after-tax savings. */
	readonly need: number;
	readonly taxes: TaxResult;
}

export interface PricedBudget {
	readonly town: string;
	readonly sheetVersion: string;
	readonly methodVersion: string;
	readonly taxYear: number;
	readonly pricedAt: string;
	readonly lines: readonly PricedLine[];
	readonly sections: Readonly<Partial<Record<Section, number>>>;
	/** Sum of the priced lines. Calculated, mixed provenance. */
	readonly burnMonthly: number;
	/** false when a required line is unavailable: break-even is then suppressed. */
	readonly complete: boolean;
	readonly breakEven: BreakEven | null;
	readonly marketTracker: PricedInput;
	/** The tax return's inputs from the sheet, for the method note. */
	readonly taxInputs: {
		readonly propertyTax: number;
		readonly mortgageInterest: number;
		readonly mortgageAverageBalance: number;
		readonly gifts: number;
	};
	/** Share of burn in lines whose inputs are all persona / include a persona input. */
	readonly personaShare: { readonly only: number; readonly any: number };
}
