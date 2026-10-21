import { describe, expect, it } from 'vitest';
import { compareRuns, historyEntry, mergeHistory, type HistoryEntry } from './history';
import type { PricedBudget, PricedLine } from './model';

const pricedLine = (id: string, monthly: number | null, cups = 44, price = 5): PricedLine => ({
	id,
	section: 'food',
	label: id,
	required: true,
	monthly,
	availability: monthly === null ? 'unavailable' : 'ok',
	classes: ['persona', 'live'],
	inputs: [
		{
			name: 'cups',
			label: 'cups',
			class: 'persona',
			value: cups,
			availability: 'ok',
			asOf: null,
			source: null
		},
		{
			name: 'price',
			label: 'cappuccino',
			class: 'live',
			value: price,
			availability: 'ok',
			asOf: '2026-10-19T10:40:39.208Z',
			source: 'Toast'
		}
	]
});

const budget = (
	over: Partial<PricedBudget> = {},
	lines = [pricedLine('t.coffee', 220)]
): PricedBudget => ({
	town: 'larkspur',
	sheetVersion: '2026-10-20',
	methodVersion: 'lifestyle-method-1',
	taxYear: 2026,
	pricedAt: '2026-10-20T14:30:00.000Z',
	lines,
	sections: { food: 220 },
	burnMonthly: 220,
	complete: true,
	breakEven: null,
	marketTracker: {
		name: 'marketTracker',
		label: 'median',
		class: 'cited',
		value: 3695000,
		availability: 'ok',
		asOf: '2026-10-20',
		source: 'Redfin'
	},
	taxInputs: { propertyTax: 0, mortgageInterest: 0, mortgageAverageBalance: 0, gifts: 0 },
	personaShare: { only: 0, any: 1 },
	...over
});

describe('historyEntry', () => {
	it('keeps the model identity, stable line ids, quantities and each input’s observation time', () => {
		const e = historyEntry(budget(), '2026-10-20');
		expect(e).toMatchObject({
			runId: '2026-10-20',
			town: 'larkspur',
			sheetVersion: '2026-10-20',
			methodVersion: 'lifestyle-method-1',
			taxYear: 2026,
			burnMonthly: 220,
			complete: true,
			breakEven: null
		});
		expect(e.lines).toEqual([
			{
				id: 't.coffee',
				monthly: 220,
				inputs: { cups: [44, null], price: [5, '2026-10-19T10:40:39.208Z'] }
			}
		]);
	});
});

describe('mergeHistory', () => {
	const at = (runId: string, town = 'larkspur'): HistoryEntry => ({
		...historyEntry(budget({ town }), runId)
	});

	it('puts the new run first and replaces, not duplicates, a retried run', () => {
		const old = [at('2026-10-13'), at('2026-10-06')];
		const once = mergeHistory(old, [at('2026-10-20')], 52);
		const retried = mergeHistory(once, [at('2026-10-20')], 52);
		expect(retried.map((e) => e.runId)).toEqual(['2026-10-20', '2026-10-13', '2026-10-06']);
	});

	it('caps each town separately', () => {
		const old = [at('2026-10-13'), at('2026-10-06'), at('2026-10-13', 'ross')];
		const merged = mergeHistory(old, [at('2026-10-20'), at('2026-10-20', 'ross')], 2);
		expect(merged.filter((e) => e.town === 'larkspur').map((e) => e.runId)).toEqual([
			'2026-10-20',
			'2026-10-13'
		]);
		expect(merged.filter((e) => e.town === 'ross')).toHaveLength(2);
	});
});

describe('compareRuns: like-for-like only', () => {
	const before = historyEntry(budget(), '2026-10-13');

	it('lists line moves between two runs of the same sheet, method and tax year', () => {
		const after = historyEntry(budget({}, [pricedLine('t.coffee', 231, 44, 5.25)]), '2026-10-20');
		expect(compareRuns(before, after)).toEqual({
			comparable: true,
			moves: [{ id: 't.coffee', before: 220, after: 231, change: 11 }]
		});
	});

	it.each([
		['town', { town: 'ross' }],
		['sheet version', { sheetVersion: '2026-11-01' }],
		['method version', { methodVersion: 'lifestyle-method-2' }],
		['tax year', { taxYear: 2027 }]
	])('refuses to compare across a different %s', (_what, over) => {
		const after = historyEntry(budget(over as Partial<PricedBudget>), '2026-10-20');
		expect(compareRuns(before, after)).toEqual({
			comparable: false,
			reason: 'not enough comparable history'
		});
	});

	it('leaves out a line whose quantities changed, or that was not priced in both runs', () => {
		const after = historyEntry(
			budget({}, [pricedLine('t.coffee', 440, 88), pricedLine('t.new', 10)]),
			'2026-10-20'
		);
		// No line can be compared, so there is no comparable history (not "nothing moved").
		expect(compareRuns(before, after)).toEqual({
			comparable: false,
			reason: 'not enough comparable history'
		});
		const gone = historyEntry(budget({}, [pricedLine('t.coffee', null)]), '2026-10-20');
		expect(compareRuns(before, gone).comparable).toBe(false);
	});

	it('reports a comparable run in which nothing moved as no moves', () => {
		const same = historyEntry(budget(), '2026-10-20');
		expect(compareRuns(before, same)).toEqual({ comparable: true, moves: [] });
	});

	it('needs a previous run at all', () => {
		expect(compareRuns(null, before)).toEqual({
			comparable: false,
			reason: 'not enough comparable history'
		});
	});
});
