/**
 * The anchors a household is compared against (Decision 5), pre-assigned and
 * each with its units, so a comparison never mixes gross with net or a
 * household with an individual.
 */
import type { Availability, LiveReads, PricedInput } from './model';
import { priceInput } from './price';
import { cite, persona } from './sheet-kit';
import { computeTaxes, TAX_2026, type TaxParameters } from './tax';

export type AnchorUnits = 'gross household' | 'net individual' | 'gross individual';

export interface Anchor {
	readonly id: 'medianHouseholdIncome' | 'minimumWageTakeHome' | 'teacherSalary';
	readonly label: string;
	readonly units: AnchorUnits;
	/** Per year. */
	readonly value: number;
	readonly availability: Availability;
	readonly inputs: readonly PricedInput[];
}

/** Anchors read no live data. */
const NO_LIVE = {} as LiveReads;

const worst = (inputs: readonly PricedInput[]): Availability =>
	inputs.some((i) => i.availability === 'unavailable')
		? 'unavailable'
		: inputs.some((i) => i.availability === 'stale')
			? 'stale'
			: 'ok';

export function priceAnchors(now: Date, tax: TaxParameters = TAX_2026): Anchor[] {
	const one = (
		id: Anchor['id'],
		label: string,
		units: AnchorUnits,
		inputs: PricedInput[],
		value: number
	): Anchor => ({ id, label, units, value, availability: worst(inputs), inputs });

	const median = priceInput('median', cite('census.marinMedianIncome'), NO_LIVE, now);
	const hourly = priceInput('hourly', cite('dir.minimumWage'), NO_LIVE, now);
	const hours = priceInput('hours', persona(2080, 'full time: 40 h × 52 weeks'), NO_LIVE, now);
	const wage = (hourly.value as number) * (hours.value as number);
	const takeHome = computeTaxes(
		{
			status: 'single',
			wages: [wage],
			deferrals: [0],
			children: 0,
			propertyTax: 0,
			mortgageInterest: 0,
			mortgageAverageBalance: 0,
			gifts: 0
		},
		tax
	).takeHome;
	const teacher = priceInput('salary', cite('cde.millValleyTeacher'), NO_LIVE, now);

	return [
		one(
			'medianHouseholdIncome',
			'Marin’s median household income',
			'gross household',
			[median],
			median.value as number
		),
		one(
			'minimumWageTakeHome',
			'a full-time CA minimum-wage take-home',
			'net individual',
			[hourly, hours],
			takeHome
		),
		one(
			'teacherSalary',
			'a Mill Valley SD teacher at step 10',
			'gross individual',
			[teacher],
			teacher.value as number
		)
	];
}
