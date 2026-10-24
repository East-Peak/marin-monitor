import { describe, expect, it } from 'vitest';
import { renderHighlight } from './highlight-copy';
import type { AnchorRef, Fact } from './highlights';

const base = { name: 'Ross old money', modelled: false, sources: ['example.org'] };
const takeHome: AnchorRef = {
	id: 'minimumWageTakeHome',
	label: 'a full-time CA minimum-wage take-home',
	units: 'net individual',
	value: 29613.276
};
const text = (f: Fact) => renderHighlight(f).text;

describe('the highlight templates', () => {
	it('a line against the minimum-wage take-home', () => {
		expect(
			text({
				template: 'lineVsMinimumWage',
				...base,
				anchor: takeHome,
				value: 123048,
				ratio: 123048 / takeHome.value,
				lineId: 'ross.kids.tuition',
				label: 'Private day school ×2'
			})
		).toBe(
			'Private day school ×2, alone: $123,048 a year, or 4.2 full-time CA minimum-wage take-homes ($29,613 a year each, after tax).'
		);
	});

	it('a rank, with a runner-up, alone, and among fewer than all the households', () => {
		const rank = {
			template: 'rank' as const,
			...base,
			section: 'giving' as const,
			monthly: 3209.4,
			compared: 3,
			of: 3,
			runnerUp: { town: 'millvalley', name: 'Mill Valley wellness', monthly: 376 }
		};
		expect(text(rank)).toBe(
			'Of our three households, the Ross old money give the most: $3,209 a month, 8.5× the Mill Valley wellness.'
		);
		expect(text({ ...rank, section: 'help', runnerUp: null })).toBe(
			'Of our three households, only the Ross old money spend anything on help: $3,209 a month.'
		);
		expect(text({ ...rank, section: 'help', compared: 2 })).toBe(
			'Of the two households priced in full this week, the Ross old money spend the most on help: $3,209 a month, 8.5× the Mill Valley wellness.'
		);
	});

	it('a mover, a quiet week and no comparable history', () => {
		const since = '2026-10-19T14:30:00.000Z';
		expect(
			text({
				template: 'mover',
				...base,
				lineId: 'ross.car.rangeRover.fuel',
				label: 'Range Rover Sport gas',
				before: 203,
				after: 216.27,
				change: 13.27,
				since,
				inputs: [
					{
						label: 'Marin average regular, 42 station prices (Google Places)',
						class: 'live',
						before: 5.8,
						after: 6.179
					}
				]
			})
		).toBe(
			'Range Rover Sport gas: up $13 a month since Oct 19, as Marin average regular went from $5.80 to $6.18.'
		);
		expect(
			text({
				template: 'mover',
				...base,
				lineId: 'ross.travel.ikon',
				label: 'Ikon passes',
				before: 443,
				after: 436,
				change: -7,
				since,
				inputs: [
					{ label: 'Ikon Pass adult, ikonpass.com', class: 'live', before: 1529, after: 1449 }
				]
			})
		).toBe(
			'Ikon passes: down $7 a month since Oct 19, as Ikon Pass adult went from $1,529 to $1,449.'
		);
		expect(text({ template: 'moversQuiet', ...base, since, compared: 44, of: 44 })).toBe(
			'No line moved by $5 a month or more since Oct 19.'
		);
		// Lines that read stale in either run are not compared, and the claim says so.
		expect(text({ template: 'moversQuiet', ...base, since, compared: 42, of: 44 })).toBe(
			'None of the 42 comparable lines moved by $5 a month or more since Oct 19.'
		);
		const two = [
			{ label: 'a', class: 'live' as const, before: 1, after: 2 },
			{ label: 'b', class: 'live' as const, before: 3, after: 4 }
		];
		expect(
			text({
				template: 'mover',
				...base,
				lineId: 'x',
				label: 'The clean extras',
				before: 150,
				after: 157,
				change: 7,
				since,
				inputs: two
			})
		).toBe('The clean extras: up $7 a month since Oct 19, as 2 of its prices moved.');
		const wine = {
			label: 'Instacart, cheapest Marin store (silver-oak-cabernet)',
			class: 'live' as const,
			before: 83.49,
			after: 79.99
		};
		expect(
			text({
				template: 'mover',
				...base,
				lineId: 'x',
				label: 'Wine',
				before: 668,
				after: 640,
				change: -28,
				since,
				inputs: [wine]
			})
		).toBe(
			'Wine: down $28 a month since Oct 19, as silver oak cabernet went from $83.49 to $79.99.'
		);
		expect(
			text({
				template: 'mover',
				...base,
				lineId: 'x',
				label: 'Garbage',
				before: 60,
				after: 66,
				change: 6,
				since,
				inputs: [{ label: 'cart', class: 'cited', before: 60, after: 66 }]
			})
		).toBe('Garbage: up $6 a month since Oct 19, on a revised published figure.');
		expect(text({ template: 'moversNotComparable', ...base })).toBe(
			'Movers: not enough comparable history yet.'
		);
	});

	it('the whole-budget comparisons', () => {
		expect(
			text({
				template: 'breakEvenVsMedian',
				...base,
				anchor: {
					id: 'medianHouseholdIncome',
					label: 'Marin’s median household income',
					units: 'gross household',
					value: 147017
				},
				value: 1393833,
				ratio: 1393833 / 147017
			})
		).toBe(
			'To break even, the Ross old money need 9.5× Marin’s median household income ($147,017 a year, before tax).'
		);
		expect(
			text({
				template: 'earnerVsTeacher',
				...base,
				anchor: {
					id: 'teacherSalary',
					label: 'a Mill Valley SD teacher at step 10',
					units: 'gross individual',
					value: 113029
				},
				value: 975683,
				ratio: 975683 / 113029,
				share: 0.7
			})
		).toBe(
			'The main earner would need $975,683 a year before tax (70% of the wages): 8.6× a Mill Valley SD teacher at step 10 ($113,029 a year, before tax).'
		);
		expect(
			text({
				template: 'spendingVsMinimumWage',
				...base,
				anchor: takeHome,
				value: 765120,
				ratio: 765120 / takeHome.value
			})
		).toBe(
			'It takes 25.8 years of a full-time CA minimum-wage take-home ($29,613 a year, after tax) to fund one year of the Ross old money.'
		);
	});

	it('gives each its figure, as the "For scale" boxes show it', () => {
		const figure = (f: Fact) => renderHighlight(f).figure;
		const cmp = { ...base, anchor: takeHome, value: 1, lineId: 'x', label: 'x' };
		expect(figure({ template: 'lineVsMinimumWage', ...cmp, ratio: 4.155 })).toBe('4.2×');
		expect(figure({ template: 'spendingVsMinimumWage', ...cmp, ratio: 25.84 })).toBe('25.8 years');
		const rank = {
			template: 'rank' as const,
			...base,
			section: 'giving' as const,
			monthly: 3209,
			compared: 3,
			of: 3,
			runnerUp: { town: 'millvalley', name: 'Mill Valley wellness', monthly: 376 }
		};
		expect(figure(rank)).toBe('8.5×');
		expect(figure({ ...rank, runnerUp: null })).toBe('only');
		const mover = {
			template: 'mover' as const,
			...base,
			lineId: 'x',
			label: 'x',
			before: 203,
			after: 216.27,
			change: 13.27,
			since: '2026-10-19',
			inputs: []
		};
		expect(figure(mover)).toBe('+$13/mo');
		expect(figure({ ...mover, change: -7.4 })).toBe('−$7/mo');
		expect(
			figure({ template: 'moversQuiet', ...base, since: '2026-10-19', compared: 1, of: 1 })
		).toBeNull();
		expect(figure({ template: 'moversNotComparable', ...base })).toBeNull();
	});

	it('carries the rule, the modelled marker and the sources through', () => {
		expect(
			renderHighlight({
				template: 'moversQuiet',
				...base,
				modelled: true,
				since: '2026-10-19',
				compared: 1,
				of: 1
			})
		).toMatchObject({ rule: 'mover', modelled: true, sources: ['example.org'] });
	});
});
