/**
 * Every highlight's words, in one file (LIFE3). The rules in highlights.ts
 * decide what to say; this says it, in a straight voice: the numbers carry
 * the joke.
 */
import { PACIFIC } from '$lib/dashboard/pacific-time';
import { THRESHOLDS, type Fact } from './highlights';
import type { Section } from './model';

export interface Highlight {
	/** Stable within a household's list: the template, and its line or section. */
	readonly key: string;
	readonly rule: 'comparison' | 'rank' | 'mover';
	readonly template: Fact['template'];
	/** The "For scale" box's big figure ("6.1×", "17.2 years", "+$13/mo"); null when there is none. */
	readonly figure: string | null;
	readonly text: string;
	readonly modelled: boolean;
	readonly sources: readonly string[];
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
/** A price as read: cents under $100 ($6.18), whole dollars above ($1,449). */
const price = (n: number | null) =>
	n === null ? 'nothing' : Math.abs(n) < 100 ? `$${n.toFixed(2)}` : usd(n);
const times = (r: number) => r.toFixed(1);
const day = (iso: string) =>
	new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: PACIFIC });
/**
 * A live input's short name from its source label: a grocery read by its item
 * ("Instacart, cheapest Marin store (silver-oak-cabernet)" → "silver oak cabernet"),
 * anything else up to its first comma ("Marin average regular, 42 station prices …").
 */
const short = (label: string) => {
	const item = /^Instacart\b.*\(([^)]+)\)\s*$/.exec(label);
	return item ? item[1].replace(/-/g, ' ') : label.split(',')[0].trim();
};
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
const count = (n: number) => COUNT[n] ?? String(n);

/** What a household does in a section: "spend the most on the kids", "give the most". */
const ON: Readonly<Record<Section, string>> = {
	housing: 'on housing',
	utilities: 'on utilities',
	health: 'on health',
	cars: 'on cars',
	food: 'on food',
	kids: 'on the kids',
	help: 'on help',
	wellness: 'on wellness',
	travel: 'on getting away',
	belonging: 'on belonging',
	giving: '',
	business: 'on the business'
};
const most = (s: Section) => (s === 'giving' ? 'give the most' : `spend the most ${ON[s]}`);
const anything = (s: Section) => (s === 'giving' ? 'give anything' : `spend anything ${ON[s]}`);

function words(f: Fact): string {
	switch (f.template) {
		case 'lineVsMinimumWage':
			return `${f.label}, alone: ${usd(f.value)} a year, or ${times(f.ratio)} full-time CA minimum-wage take-homes (${usd(f.anchor.value)} a year each, after tax).`;
		case 'rank': {
			const among =
				f.compared === f.of
					? `Of our ${count(f.of)} households`
					: `Of the ${count(f.compared)} households priced in full this week`;
			return f.runnerUp
				? `${among}, the ${f.name} ${most(f.section)}: ${usd(f.monthly)} a month, ${times(f.monthly / f.runnerUp.monthly)}× the ${f.runnerUp.name}.`
				: `${among}, only the ${f.name} ${anything(f.section)}: ${usd(f.monthly)} a month.`;
		}
		case 'mover': {
			const way = f.change > 0 ? 'up' : 'down';
			// One price is named, shortly; several are counted (their sources are the highlight's).
			const live = f.inputs.filter((i) => i.class === 'live');
			const why =
				f.inputs.length === 1 && live.length === 1
					? `, as ${short(live[0].label)} went from ${price(live[0].before)} to ${price(live[0].after)}`
					: live.length === f.inputs.length && live.length > 1
						? `, as ${live.length} of its prices moved`
						: f.inputs.length > 0 && live.length === 0
							? ', on a revised published figure'
							: f.inputs.length > 0
								? ', as its inputs moved'
								: '';
			return `${f.label}: ${way} ${usd(Math.abs(f.change))} a month since ${day(f.since)}${why}.`;
		}
		case 'moversQuiet':
			return f.compared === f.of
				? `No line moved by ${usd(THRESHOLDS.moverMonthly)} a month or more since ${day(f.since)}.`
				: `None of the ${f.compared} comparable lines moved by ${usd(THRESHOLDS.moverMonthly)} a month or more since ${day(f.since)}.`;
		case 'moversNotComparable':
			return 'Movers: not enough comparable history yet.';
		case 'breakEvenVsMedian':
			return `To break even, the ${f.name} need ${times(f.ratio)}× ${f.anchor.label} (${usd(f.anchor.value)} a year, before tax).`;
		case 'earnerVsTeacher':
			return `The main earner would need ${usd(f.value)} a year before tax (${Math.round(f.share * 100)}% of the wages): ${times(f.ratio)}× ${f.anchor.label} (${usd(f.anchor.value)} a year, before tax).`;
		case 'spendingVsMinimumWage':
			return `It takes ${times(f.ratio)} years of ${f.anchor.label} (${usd(f.anchor.value)} a year, after tax) to fund one year of the ${f.name}.`;
	}
}

function figure(f: Fact): string | null {
	switch (f.template) {
		case 'lineVsMinimumWage':
		case 'breakEvenVsMedian':
		case 'earnerVsTeacher':
			return `${times(f.ratio)}×`;
		case 'spendingVsMinimumWage':
			return `${times(f.ratio)} years`;
		case 'rank':
			return f.runnerUp ? `${times(f.monthly / f.runnerUp.monthly)}×` : 'only';
		case 'mover':
			return `${f.change > 0 ? '+' : '−'}${usd(Math.abs(f.change))}/mo`;
		case 'moversQuiet':
		case 'moversNotComparable':
			return null;
	}
}

const RULE: Readonly<Record<Fact['template'], Highlight['rule']>> = {
	lineVsMinimumWage: 'comparison',
	breakEvenVsMedian: 'comparison',
	earnerVsTeacher: 'comparison',
	spendingVsMinimumWage: 'comparison',
	rank: 'rank',
	mover: 'mover',
	moversQuiet: 'mover',
	moversNotComparable: 'mover'
};

export function renderHighlight(f: Fact): Highlight {
	const which = 'lineId' in f ? f.lineId : 'section' in f ? f.section : '';
	return {
		key: which ? `${f.template}:${which}` : f.template,
		rule: RULE[f.template],
		template: f.template,
		figure: figure(f),
		text: words(f),
		modelled: f.modelled,
		sources: f.sources
	};
}
