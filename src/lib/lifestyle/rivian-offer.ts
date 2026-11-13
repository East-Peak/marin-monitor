/**
 * Rivian's lease offers, entered by hand (COSTDATA-2). rivian.com's terms bar
 * automated access, so nobody reads it by machine: Stuart enters each month's
 * offer from the page, dated. One record holds every part of one offer, and
 * the sheets' two Rivian figures are drawn from it together, so a payment
 * from one offer is never paired with a due-at-signing from another. Its end
 * is enforced at read time (offers.ts); until a new record is entered the
 * line reads stale, honestly.
 */

export interface RivianOffer {
	readonly trim: string;
	readonly region: string;
	/** The vehicle price the offer's disclosure states. */
	readonly vehiclePrice: number;
	readonly monthlyPayment: number;
	/** As the disclosure states it. */
	readonly dueAtSigning: number;
	/**
	 * Whether that figure already holds the first monthly payment. `null`: the
	 * record does not say, and its due is priced as stated.
	 */
	readonly dueIncludesFirstPayment: boolean | null;
	readonly termMonths: number;
	readonly milesPerYear: number;
	/** The offer's last day (YYYY-MM-DD). */
	readonly validUntil: string;
	/** The day it was read off the page (YYYY-MM-DD). */
	readonly checkedAt: string;
	readonly url: string;
	/** The offer's period as the page words it. */
	readonly period: string;
	/** The disclosure text the figures come from. */
	readonly disclosure: string;
}

/** The offer read by hand on 2026-11-03: the last one on file. It ended 2026-11-02. */
export const RIVIAN_OFFER: RivianOffer = {
	trim: '2027 R1S Premium',
	region: 'US',
	vehiclePrice: 85885,
	monthlyPayment: 1209,
	dueAtSigning: 9104,
	dueIncludesFirstPayment: null,
	termMonths: 36,
	milesPerYear: 10000,
	validUntil: '2026-11-02',
	checkedAt: '2026-11-03',
	url: 'https://rivian.com/r1s',
	period: 'example offer, orders 2026-10-01 to 11-02',
	disclosure:
		'2027 R1S Premium, $85,885 vehicle price: 36 monthly payments of $1,209 with $9,104 due at signing, 10,000 miles a year. Orders October 1 to November 2, 2026.'
};

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const dollars = (n: number) => `$${n.toLocaleString('en-US')}`;
const positive = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** What is wrong with a record as one offer; empty when it is valid. */
export function validateRivianOffer(o: RivianOffer): string[] {
	const problems: string[] = [];
	if (!o.trim.trim()) problems.push('trim is empty');
	if (!o.region.trim()) problems.push('region is empty');
	for (const k of ['vehiclePrice', 'monthlyPayment', 'dueAtSigning', 'milesPerYear'] as const)
		if (!positive(o[k])) problems.push(`${k} must be a positive amount`);
	if (!Number.isInteger(o.termMonths) || o.termMonths < 12 || o.termMonths > 60)
		problems.push('termMonths must be a whole number of months, 12 to 60');
	for (const k of ['validUntil', 'checkedAt'] as const)
		if (!DATE.test(o[k]) || Number.isNaN(Date.parse(`${o[k]}T00:00:00Z`)))
			problems.push(`${k} must be a date (YYYY-MM-DD)`);
	if (!/^https:\/\/(www\.)?rivian\.com\//.test(o.url)) problems.push('url must be on rivian.com');
	if (o.dueIncludesFirstPayment === true && o.dueAtSigning < o.monthlyPayment)
		problems.push('due at signing cannot hold a first payment larger than itself');
	// The parts are one offer only if its own disclosure states them all.
	if (!o.disclosure.includes(dollars(o.monthlyPayment)))
		problems.push(`disclosure does not state the monthly payment ${dollars(o.monthlyPayment)}`);
	if (!o.disclosure.includes(dollars(o.dueAtSigning)))
		problems.push(`disclosure does not state the due at signing ${dollars(o.dueAtSigning)}`);
	if (!new RegExp(`\\b${o.termMonths}\\b`).test(o.disclosure))
		problems.push(`disclosure does not state the ${o.termMonths}-month term`);
	return problems;
}

/**
 * The due-at-signing the sheet adds on top of the monthly payment it already
 * charges every month: a figure that holds the first payment gives it up, so
 * the first payment is never counted twice.
 */
export function rivianSheetDue(o: RivianOffer): number {
	return o.dueIncludesFirstPayment === true ? o.dueAtSigning - o.monthlyPayment : o.dueAtSigning;
}
