import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareHouseholds } from '$lib/lifestyle/compare';
import type { Highlight } from '$lib/lifestyle/highlight-copy';
import type { PricedBudget } from '$lib/lifestyle/model';
import { SHEETS } from '$lib/lifestyle/sheets';
import { householdPage, pricedSoFar, townSlug } from '$lib/lifestyle/view';
import Page from './+page.svelte';

const seed = JSON.parse(readFileSync('tests/e2e/fixtures/lifestyle-index.json', 'utf8')) as {
	current: { budgets: PricedBudget[] };
};
const RANK: Highlight = {
	key: 'rank:business',
	rule: 'rank',
	template: 'rank',
	figure: '26.4×',
	text: 'Of the two households priced in full this week, the Larkspur strivers spend the most on the business.',
	modelled: true,
	sources: []
};

function view(stale = false) {
	const columns = SHEETS.map((sheet) => {
		const b = seed.current.budgets.find((x) => x.town === sheet.id)!;
		return { sheet, page: householdPage(b, sheet) };
	});
	return render(Page, {
		data: {
			households: columns.map(({ sheet, page }) => ({
				id: sheet.id,
				slug: townSlug(sheet.town),
				town: sheet.town,
				name: sheet.name,
				who: sheet.who,
				read: true,
				burnMonthly: page.summary.burnMonthly,
				soFar: pricedSoFar(page.summary),
				complete: page.summary.complete,
				breakEven: page.summary.breakEven,
				missing: page.summary.missing
			})),
			comparison: compareHouseholds(
				columns.map((c) => ({ id: c.sheet.id, page: c.page })),
				{ larkspur: [RANK] },
				{ stale }
			),
			read: true,
			computedAt: null,
			stale
		} as never
	}).container;
}

describe('/cost', () => {
	it('shows a comparable row’s rank fact as a comparison highlight, in its own words (R4)', () => {
		const c = view();
		const hl = c.querySelector('[data-compare-section="business"] [data-comparison-highlight]');
		expect(hl?.textContent).toContain('Comparison highlight');
		expect(hl?.textContent).toContain(RANK.text);
		expect(c.querySelectorAll('[data-comparison-highlight]')).toHaveLength(1);
		expect(c.textContent).not.toMatch(/widest/i);
	});

	it('shows none while the snapshot is out of date', () => {
		expect(view(true).querySelectorAll('[data-comparison-highlight]')).toHaveLength(0);
	});

	it('labels every bar with its household and amount, partial apart', () => {
		const c = view();
		const food = c.querySelector('[data-compare-section="food"] [data-cell="ross"]')!;
		expect(food.querySelector('.cell-town')?.textContent).toBe('Ross');
		expect(food.querySelector('[data-amount]')?.textContent).toMatch(/^\$[\d,]+ so far$/);
		expect(food.querySelector('[data-bar]')?.classList).toContain('partial');
		const util = c.querySelector('[data-compare-section="utilities"] [data-cell="mill-valley"]')!;
		expect(util.querySelector('[data-amount]')?.textContent).toMatch(/^\$[\d,]+ · stale$/);
	});
});
