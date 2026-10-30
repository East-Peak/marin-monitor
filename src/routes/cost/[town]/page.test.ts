import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { PricedBudget } from '$lib/lifestyle/model';
import { SHEETS } from '$lib/lifestyle/sheets';
import { householdPage, lineAnchor } from '$lib/lifestyle/view';

vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn() }));
const { default: Page } = await import('./+page.svelte');

const seed = JSON.parse(readFileSync('tests/e2e/fixtures/lifestyle-index.json', 'utf8')) as {
	current: { budgets: PricedBudget[] };
};
const budget = (id: string) => seed.current.budgets.find((b) => b.town === id)!;
function page(b: PricedBudget) {
	const sheet = SHEETS.find((s) => s.id === b.town)!;
	return render(Page, {
		data: {
			town: sheet.town,
			page: householdPage(b, sheet),
			highlights: null,
			computedAt: null,
			stale: false,
			towns: []
		} as never
	}).container;
}
const text = (root: Element, sel: string) => root.querySelector(sel)?.textContent?.trim() ?? null;
const sectionTotal = (root: Element, section: string) =>
	text(root, `[data-section="${section}"] [data-section-total]`);

describe('/cost/<town>', () => {
	it('leads with the month and keeps the equation', () => {
		const c = page(budget('larkspur'));
		expect(text(c, '[data-burn]')).toBe('$42,560 a month');
		expect(c.querySelector('[data-burn]')?.getAttribute('data-text-role')).toBe('headline');
		expect(c.querySelector('.equation [data-break-even]')).not.toBeNull();
		expect(text(c, '[data-budget-total]')).toContain('calculated, mixed provenance');
	});

	it('anchors every line and marks only the card’s', () => {
		const c = page(budget('larkspur'));
		for (const l of budget('larkspur').lines)
			expect(c.querySelector(`details#${lineAnchor(l.id)}`), l.id).not.toBeNull();
		const marked = [...c.querySelectorAll('details:has([data-on-card])')].map((d) =>
			d.getAttribute('data-line')
		);
		expect(marked).toHaveLength(6);
		expect(marked).toContain('larkspur.biz');
		expect(text(c, '[data-on-card]')).toBe('on the card');
	});

	it('a required line unread: the head, its section and the total say so far', () => {
		const c = page(budget('ross'));
		expect(text(c, '[data-burn]')).toMatch(/a month so far$/);
		expect(text(c, '[data-incomplete]')).toBe('incomplete');
		expect(sectionTotal(c, 'food')).toMatch(/\/mo so far$/);
		expect(sectionTotal(c, 'housing')).toMatch(/%$/);
		expect(text(c, '[data-budget-total]')).toMatch(/\/mo so far$/);
		expect(text(c, '[data-line="ross.food.wine"] summary')).toContain('can’t be read');
	});

	it('a non-required line unread: so far, with the break-even kept', () => {
		const b = budget('larkspur');
		const line = b.lines.find((l) => l.id === 'larkspur.util.garbage')!;
		const c = page({
			...b,
			lines: b.lines.map((l) =>
				l.id === line.id ? { ...l, monthly: null, availability: 'unavailable' as const } : l
			)
		});
		expect(text(c, '[data-burn]')).toMatch(/a month so far$/);
		expect(sectionTotal(c, line.section)).toMatch(/so far$/);
		expect(text(c, '[data-budget-total]')).toMatch(/so far$/);
	});

	it('a whole section unread says "can’t be read", never $0', () => {
		const b = budget('larkspur');
		const { business: _gone, ...sections } = b.sections;
		const c = page({
			...b,
			sections,
			complete: false,
			breakEven: null,
			lines: b.lines.map((l) =>
				l.section === 'business' ? { ...l, monthly: null, availability: 'unavailable' as const } : l
			)
		});
		expect(sectionTotal(c, 'business')).toBe('can’t be read');
		expect(text(c, '[data-budget-total]')).toMatch(/so far$/);
	});

	it('an old blob’s missing signature line is a row in its section with its anchor', () => {
		const b = budget('larkspur');
		const c = page({ ...b, lines: b.lines.filter((l) => l.id !== 'larkspur.kids.math') });
		const row = c.querySelector(`details#${lineAnchor('larkspur.kids.math')}`);
		expect(row).not.toBeNull();
		expect(row?.textContent).toContain('can’t be read');
		expect(sectionTotal(c, 'kids')).toMatch(/so far$/);
	});

	it('shows the sheet’s note, not a stored one', () => {
		const b = budget('ross');
		const c = page({
			...b,
			lines: b.lines.map((l) =>
				l.id === 'ross.help.manager' ? { ...l, note: 'Part-time on a stored ruling.' } : l
			)
		});
		expect(c.textContent).toContain('Part-time.');
		expect(c.textContent).not.toContain('ruling');
	});
});
