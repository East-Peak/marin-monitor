/** Small constructors for writing household sheets as plain data. */
import type { CitedId } from './sources';
import type { InputSpec, LiveKey, Term } from './model';

export const persona = (value: number, label: string): InputSpec => ({
	class: 'persona',
	label,
	value
});
export const cite = (id: CitedId, label?: string, pinned?: number): InputSpec => ({
	class: 'cited',
	cite: id,
	...(label ? { label } : {}),
	...(pinned !== undefined ? { pinned } : {})
});
export const live = (key: LiveKey, label?: string): InputSpec => ({
	class: 'live',
	live: key,
	...(label ? { label } : {})
});

export const monthly = (...factors: string[]): Term => ({ kind: 'product', per: 'month', factors });
export const yearly = (...factors: string[]): Term => ({ kind: 'product', per: 'year', factors });
/** Π factors ÷ Π divide, per month (e.g. due-at-signing over the lease's months). */
export const spread = (factors: string[], divide: string[]): Term => ({
	kind: 'product',
	per: 'month',
	factors,
	divide
});
export const less = (...factors: string[]): Term => ({
	kind: 'product',
	per: 'month',
	factors,
	sign: -1
});
export const asGift = (term: Term): Term => ({ ...term, gift: true });

/** The cited employer-tax inputs an `employer` term reads, plus CA's FUTA credit reduction. */
export const employerTaxInputs = (): Record<string, InputSpec> => ({
	ssRate: cite('payroll.ssRate'),
	ssWageBase: cite('payroll.ssWageBase'),
	medicareRate: cite('payroll.medicareRate'),
	futaNet: cite('payroll.futaNet'),
	futaWageBase: cite('payroll.futaWageBase'),
	futaReduction: persona(
		0.012,
		'FUTA credit reduction 1.2% (CA’s 2025 rate; DOL sets 2026’s after Nov 10)'
	),
	uiRate: cite('edd.uiNewEmployer'),
	ettRate: cite('edd.ett'),
	uiWageBase: cite('edd.uiWageBase')
});

/** MMWD's cited tier table, which a `water` term reads. */
export const waterInputs = (): Record<string, InputSpec> => ({
	tier1: cite('mmwd.tier1'),
	tier2: cite('mmwd.tier2'),
	tier3: cite('mmwd.tier3'),
	tier1Units: cite('mmwd.tier1Units'),
	tier2Units: cite('mmwd.tier2Units'),
	watershed: cite('mmwd.watershed'),
	fixed: cite('mmwd.fixed')
});
