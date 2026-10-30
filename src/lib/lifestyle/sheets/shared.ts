/** Line builders the three sheets share; every quantity is still an argument from the sheet. */
import type { InputSpec, LineSpec } from '../model';
import type { CitedId } from '../sources';
import { asPropertyTax, cite, live, monthly, persona, spread, yearly } from '../sheet-kit';
import type { Term } from '../model';

export const NOT_MODELLED = [
	'clothing',
	'personal care and haircuts',
	'home furnishings',
	'electronics',
	'pets',
	'life, disability and umbrella insurance',
	'dental and vision beyond the plan',
	'alcohol beyond the wine line',
	'debt other than the mortgage and leases',
	'investment income',
	'business-tax treatment',
	'AMT and NIIT'
];

export function electricity(
	town: string,
	use: { kwh: number; offPeakShare: number; baseCharge: number }
): LineSpec {
	return {
		id: `${town}.util.electric`,
		section: 'utilities',
		label: 'Electricity (house, EV2-A)',
		required: true,
		inputs: {
			kwh: persona(use.kwh, 'kWh a month'),
			offShare: persona(use.offPeakShare, 'off-peak share'),
			off: cite('pge.ev2a.offPeak'),
			peakShare: persona(1 - use.offPeakShare, 'peak share'),
			peak: cite('pge.ev2a.peak'),
			baseCharge: persona(use.baseCharge, `Base Services Charge ~$${use.baseCharge}`)
		},
		terms: [
			monthly('kwh', 'offShare', 'off'),
			monthly('kwh', 'peakShare', 'peak'),
			monthly('baseCharge')
		],
		note: 'PG&E bundled; most Marin buys MCE generation (approximate).'
	};
}

/** Prop 13: each assessed base grows by `growth` a year (at most 2%); bonds on top; flat parcel taxes. */
export function propertyTax(
	town: string,
	opts: {
		label?: string;
		bases: { value: InputSpec; years: number }[];
		growth: number;
		bondRate: number;
		parcels: Record<string, number>;
		note?: string;
	}
): LineSpec {
	const inputs: Record<string, InputSpec> = {
		growth: persona(opts.growth, `${opts.growth * 100}%/yr Prop 13 factor`),
		rate: cite('prop13.baseRate'),
		bonds: persona(opts.bondRate, `+${(opts.bondRate * 100).toFixed(3)}% bonds (broker guide)`)
	};
	const terms: Term[] = [];
	opts.bases.forEach((b, i) => {
		inputs[`base${i}`] = b.value;
		inputs[`years${i}`] = persona(b.years, 'years of growth');
		for (const rate of ['rate', 'bonds']) {
			terms.push(
				asPropertyTax({
					kind: 'grow',
					base: `base${i}`,
					rate: 'growth',
					years: `years${i}`,
					times: [rate]
				})
			);
		}
	});
	Object.entries(opts.parcels).forEach(([name, amount], i) => {
		inputs[`parcel${i}`] = persona(amount, `parcel tax: ${name}`);
		terms.push(yearly(`parcel${i}`)); // paid, not deductible: never marked
	});
	return {
		id: `${town}.home.tax`,
		section: 'housing',
		label: opts.label ?? 'Property tax',
		required: true,
		inputs,
		terms,
		...(opts.note ? { note: opts.note } : {})
	};
}

const VLF_NOTE = 'VLF rate confirmed only on third-party sites, so the VLF input is persona.';

export function car(
	town: string,
	slug: string,
	label: string,
	opts: {
		lease?: { pay: InputSpec; due: InputSpec; months: number; signature?: true };
		/** Miles per kWh (EV) or per gallon (gas). */
		power: { kind: 'ev'; milesPerKwh: number } | { kind: 'gas'; mpg: number };
		value: number;
		vlfRate: number;
		tif: CitedId;
		miles: number;
		maintenancePerMile: number;
	}
): LineSpec[] {
	const id = (part: string) => `${town}.car.${slug}.${part}`;
	const ev = opts.power.kind === 'ev';
	const perMile = `${Math.round(opts.maintenancePerMile * 100)}¢ a mile`;
	const lines: LineSpec[] = [];
	if (opts.lease) {
		lines.push({
			id: id('lease'),
			...(opts.lease.signature ? { signature: true as const } : {}),
			section: 'cars',
			label: `${label} lease`,
			required: true,
			inputs: {
				pay: opts.lease.pay,
				due: opts.lease.due,
				months: persona(opts.lease.months, 'lease months')
			},
			terms: [monthly('pay'), spread(['due'], ['months'])]
		});
	}
	const { power } = opts;
	lines.push(
		power.kind === 'ev'
			? {
					id: id('charge'),
					section: 'cars',
					label: `${label} home charging`,
					required: true,
					inputs: {
						miles: persona(opts.miles, 'miles a month'),
						rate: cite('pge.ev2a.offPeak'),
						efficiency: persona(power.milesPerKwh, 'miles per kWh')
					},
					terms: [spread(['miles', 'rate'], ['efficiency'])]
				}
			: {
					id: id('fuel'),
					section: 'cars',
					label: `${label} gas`,
					required: true,
					inputs: {
						miles: persona(opts.miles, 'miles a month'),
						price: live('gas.regular'),
						mpg: persona(power.mpg, 'mpg')
					},
					terms: [spread(['miles', 'price'], ['mpg'])]
				},
		{
			id: id('reg'),
			section: 'cars',
			label: `${label} registration`,
			required: true,
			inputs: {
				value: persona(opts.value, 'vehicle value'),
				vlf: persona(opts.vlfRate, `VLF ${(opts.vlfRate * 100).toFixed(2)}%`),
				registration: cite('dmv.registration'),
				chp: cite('dmv.chp'),
				tif: cite(opts.tif),
				...(ev ? { roadFee: cite('dmv.evRoadFee') } : {})
			},
			terms: [
				yearly('value', 'vlf'),
				yearly('registration'),
				yearly('chp'),
				yearly('tif'),
				...(ev ? [yearly('roadFee')] : [])
			],
			note: VLF_NOTE
		},
		{
			id: id('ins'),
			section: 'cars',
			label: `${label} insurance`,
			required: true,
			inputs: { premium: cite('insurify.ca') },
			terms: [yearly('premium')],
			note: 'State average; no Marin figure exists.'
		},
		{
			id: id('maint'),
			section: 'cars',
			label: `${label} maintenance`,
			required: true,
			inputs: {
				miles: persona(opts.miles, 'miles a month'),
				perMile: persona(opts.maintenancePerMile, perMile)
			},
			terms: [monthly('miles', 'perMile')],
			note: 'AAA 11.04¢/mi found only in search; persona.'
		}
	);
	return lines;
}
