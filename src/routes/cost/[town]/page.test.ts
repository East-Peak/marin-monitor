import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Highlight } from '$lib/lifestyle/highlight-copy';
import type { PricedBudget } from '$lib/lifestyle/model';
import { SHEETS } from '$lib/lifestyle/sheets';
import { householdPage, lineAnchor } from '$lib/lifestyle/view';

vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn() }));
const { default: Page } = await import('./+page.svelte');

const seed = JSON.parse(readFileSync('tests/e2e/fixtures/lifestyle-index.json', 'utf8')) as {
	current: { budgets: PricedBudget[] };
};
const budget = (id: string) => seed.current.budgets.find((b) => b.town === id)!;
function page(b: PricedBudget, highlights: Highlight[] | null = null) {
	const sheet = SHEETS.find((s) => s.id === b.town)!;
	return render(Page, {
		data: {
			town: sheet.town,
			page: householdPage(b, sheet),
			highlights,
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
		expect(text(c, '[data-burn]')).toBe('$42,581 a month');
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
		expect(text(c, '[data-line="ross.food.groceries"] summary')).toContain('can’t be read');
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

	it('sets each line’s provenance in one quiet column of its own, the classes unchanged (R3)', () => {
		const c = page(budget('larkspur'));
		const pi = c.querySelector('[data-line="larkspur.home.pi"] summary')!;
		const prov = pi.querySelector(':scope > [data-provenance] [data-classes]');
		expect(prov?.getAttribute('data-classes')).toBe('cited persona');
		expect(prov?.classList).toContain('quiet');
		expect(prov?.getAttribute('aria-label')).toBe('Inputs: cited, persona');
		// Not inside the label any more.
		expect(pi.querySelector('.lab [data-classes]')).toBeNull();
		// The legend stays.
		expect(c.textContent).toContain('Persona: an assumption about this family');
	});

	it('splits the town median into a number and a short qualifier, its facts kept', () => {
		const c = page(budget('larkspur'));
		const t = c.querySelector('[data-market-tracker]')!;
		expect(t.querySelector('[data-tracker-value]')?.textContent?.trim()).toMatch(/^\$[\d,]+$/);
		expect(t.querySelector('[data-tracker-qualifier]')?.textContent?.trim()).toBe(
			'Context only: it never reprices this household’s home.'
		);
		expect(t.querySelector('[data-tracker-source]')?.textContent).toMatch(
			/^all residential, Redfin · read /
		);
	});

	it('lists the comparisons as a number and a sentence; the movers sit under the month (R9)', () => {
		const h = (key: string, rule: Highlight['rule'], figure: string | null, text: string) =>
			({
				key,
				rule,
				template: key.split(':')[0],
				figure,
				text,
				modelled: rule === 'comparison',
				sources: ['dir.ca.gov']
			}) as Highlight;
		const c = page(budget('larkspur'), [
			h('lineVsMinimumWage:larkspur.biz', 'comparison', '3.2×', 'The Business, alone: …'),
			h('rank:business', 'rank', '26.4×', 'Of the two households …'),
			h(
				'mover:larkspur.car.suv.fuel',
				'mover',
				'+$10/mo',
				'Gas SUV gas: up $10 a month since Oct 13.'
			),
			h('moversNotComparable', 'mover', null, 'Movers: not enough comparable history yet.')
		]);
		const scale = c.querySelector('[data-highlights]')!;
		expect(
			[...scale.querySelectorAll('[data-highlight]')].map((x) => x.getAttribute('data-highlight'))
		).toEqual(['lineVsMinimumWage:larkspur.biz', 'rank:business']);
		const line = scale.querySelector('[data-highlight="lineVsMinimumWage:larkspur.biz"]')!;
		expect(line.querySelector('[data-figure]')?.textContent).toBe('3.2×');
		expect(line.querySelector('[data-sources]')?.textContent).toContain('dir.ca.gov');
		const movers = c.querySelector('[data-movers]')!;
		expect(movers.querySelector('h2')?.textContent).toBe('Since the previous comparable run');
		expect(
			movers.querySelector('[data-highlight="mover:larkspur.car.suv.fuel"]')?.textContent
		).toContain('up $10 a month since Oct 13');
		expect(movers.querySelector('[data-highlight="moversNotComparable"]')?.textContent).toContain(
			'not enough comparable history yet'
		);
		// Under the month: after the burn in the document.
		const burn = c.querySelector('[data-burn]')!;
		expect(burn.compareDocumentPosition(movers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(movers.compareDocumentPosition(scale) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
