import { fireEvent, render, screen } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PricedBudget } from '$lib/lifestyle/model';
import { SHEETS } from '$lib/lifestyle/sheets';
import { householdSummary, type HouseholdSummary } from '$lib/lifestyle/view';
import LifestyleCard from './LifestyleCard.svelte';

const NOW = Date.parse('2026-10-22T19:00:00.000Z');
const seed = JSON.parse(readFileSync('tests/e2e/fixtures/lifestyle-index.json', 'utf8')) as {
	current: { budgets: PricedBudget[] };
};
const budget = (id: string) => seed.current.budgets.find((b) => b.town === id)!;
const summary = (b: PricedBudget) => householdSummary(b, SHEETS.find((s) => s.id === b.town)!);

function card(h: HouseholdSummary) {
	return render(LifestyleCard, {
		now: NOW,
		view: {
			kind: 'value',
			value: { computedAt: '', lastSuccessfulScrapeAt: null, households: [h] },
			source: 'Lifestyle Index, weekly',
			observedAt: NOW,
			retainedAfter: null
		} as never
	}).container;
}
const text = (root: Element, sel: string) => root.querySelector(sel)?.textContent?.trim() ?? null;
const row = (root: Element, id: string) => root.querySelector(`[data-line="${id}"]`)!;

/** The seed's Larkspur with one line taken out of its pricing. */
function unread(ids: readonly string[], over: Partial<PricedBudget> = {}): PricedBudget {
	const b = budget('larkspur');
	return {
		...b,
		...over,
		lines: b.lines.map((l) =>
			ids.includes(l.id) ? { ...l, monthly: null, availability: 'unavailable' as const } : l
		)
	};
}

describe('the Lifestyle card', () => {
	it('leads with the month, keeps break-even to a meta line and links both ways in', () => {
		const c = card(summary(budget('larkspur')));
		expect(text(c, '[data-burn]')).toBe('$42,560 a month');
		expect(text(c, '[data-break-even]')).toMatch(/^To break even: \$[\d,]+ a year before tax$/);
		expect(c.querySelector('[data-break-even]')?.getAttribute('data-text-role')).toBe('meta');
		expect(c.querySelector('a[data-burn]')?.getAttribute('href')).toBe('/cost/larkspur');
		const all = screen.getByRole('link', { name: 'See all 40 lines →' });
		expect(all.getAttribute('href')).toBe('/cost/larkspur');
		// The last thing in the card.
		expect(c.querySelector('[data-card="lifestyle"]')?.lastElementChild?.contains(all)).toBe(true);
	});

	it('is a receipt of signature lines: same-tab links to each line, no chips, sorted by amount', () => {
		const c = card(summary(budget('larkspur')));
		const rows = [...c.querySelectorAll<HTMLAnchorElement>('a[data-line]')];
		expect(rows).toHaveLength(6);
		expect(rows[0].getAttribute('href')).toBe('/cost/larkspur#line-larkspur-biz');
		expect(rows[0].hasAttribute('target')).toBe(false);
		expect(rows.at(-1)?.textContent).toContain('Bikes (woom, amortised 3 yr)');
		expect(c.querySelector('[data-classes]')).toBeNull();
		expect(text(c, '[data-receipt-total]')).toBe('40 lines$42,560 a month');
	});

	it('shows Ross’s mortgage at $0 with its note, and no other note', async () => {
		const c = card(summary(budget('ross')));
		const mortgage = row(c, 'ross.home.pi');
		expect(mortgage?.textContent).toContain('$0');
		expect(mortgage?.textContent).toContain('Bought 1998, paid off.');
		expect(row(c, 'ross.help.manager')?.textContent).not.toContain('Part-time');
	});

	it('says stale on a signature line priced from a stale input', () => {
		const c = card(summary(budget('millvalley')));
		expect(row(c, 'millvalley.food.clean')?.textContent).toContain('stale');
		expect(row(c, 'millvalley.biz')?.textContent).not.toContain('stale');
	});

	it('a required signature line unread: "can’t be read", so far, no break-even', () => {
		const c = card(summary(unread(['larkspur.help.nanny'], { complete: false, breakEven: null })));
		expect(row(c, 'larkspur.help.nanny')?.textContent).toContain('can’t be read');
		expect(row(c, 'larkspur.help.nanny')?.textContent).not.toContain('$');
		expect(text(c, '[data-burn]')).toMatch(/a month so far$/);
		expect(text(c, '[data-incomplete]')).toBe('incomplete');
		expect(c.querySelector('[data-break-even]')).toBeNull();
		expect(text(c, '[data-receipt-total]')).toMatch(
			/^39 of 40 lines priced\$[\d,]+ a month so far$/
		);
	});

	it('a non-signature line unread: every row priced, and the total still says so far', () => {
		const c = card(summary(budget('ross')));
		expect(c.textContent).not.toContain('can’t be read:');
		expect(text(c, '[data-burn]')).toMatch(/a month so far$/);
		expect(text(c, '[data-receipt-total]')).toMatch(/^39 of 40 lines priced/);
		expect(c.querySelector('[data-break-even]')).toBeNull();
	});

	it('an old blob without a signature line reads it as unread', () => {
		const b = budget('larkspur');
		const old = { ...b, lines: b.lines.filter((l) => l.id !== 'larkspur.kids.math') };
		const c = card(summary(old));
		expect(row(c, 'larkspur.kids.math')?.textContent).toContain('can’t be read');
		expect(text(c, '[data-receipt-total]')).toMatch(/^39 of 40 lines priced/);
	});

	it('a whole section unread never reads $0 in the bar’s key', () => {
		const b = budget('larkspur');
		const ids = b.lines.filter((l) => l.section === 'business').map((l) => l.id);
		const { business: _gone, ...sections } = b.sections;
		const c = card(summary(unread(ids, { sections, complete: false, breakEven: null })));
		expect(c.querySelector('[data-section-stack]')?.innerHTML).not.toContain('business');
		expect(c.textContent).not.toMatch(/business 0%/);
	});

	describe('the month map', () => {
		const tiles = (c: Element) =>
			[...c.querySelectorAll('a[data-tile]')].map((a) => a.getAttribute('data-tile'));
		const caption = (c: Element) => text(c, '[data-map-caption]');
		const section = (name: string) =>
			budget('larkspur')
				.lines.filter((l) => l.section === name)
				.map((l) => l.id);

		it('every tile links to its section, in words, with no caption for a whole month', () => {
			const c = card(summary(budget('larkspur')));
			const housing = c.querySelector('a[data-tile="housing"]');
			expect(housing?.getAttribute('href')).toBe('/cost/larkspur#section-housing');
			expect(housing?.getAttribute('aria-label')).toMatch(
				/^Housing · \$[\d,]+ a month · \d+% of spending$/
			);
			expect(caption(c)).toBeNull();
		});

		it('an unreadable section has no tile, and a line says so', () => {
			const { utilities: _gone, ...sections } = budget('larkspur').sections;
			const c = card(
				summary(unread(section('utilities'), { sections, complete: false, breakEven: null }))
			);
			expect(tiles(c)).not.toContain('utilities');
			expect(c.querySelector('[data-month-map]')?.textContent).not.toMatch(/utilities \$/i);
			expect(caption(c)).toBe('Spending so far. Can’t be read: utilities.');
		});

		it('a section at $0 with an unread line can’t be read either', () => {
			const b = budget('larkspur');
			const c = card(
				summary(
					unread(section('business'), {
						sections: { ...b.sections, business: 0 },
						complete: false,
						breakEven: null
					})
				)
			);
			expect(tiles(c)).not.toContain('business');
			expect(caption(c)).toContain('Can’t be read: business.');
		});

		it('an unread optional line says "so far" while the budget is complete', () => {
			const b = budget('larkspur');
			const id = b.lines.find((l) => l.section === 'kids')!.id;
			const c = card(summary(unread([id], { complete: true })));
			expect(caption(c)).toBe('Spending so far.');
			expect(c.querySelector('a[data-tile="kids"]')?.getAttribute('aria-label')).toContain(
				'a month so far'
			);
		});

		it('a business that makes money has no tile, and the caption says what’s left out', () => {
			const b = budget('larkspur');
			const c = card(summary({ ...b, sections: { ...b.sections, business: -1200 } }));
			expect(tiles(c)).not.toContain('business');
			expect(caption(c)).toBe('The business brings in $1,200 a month, not shown.');
		});

		it('with nothing priced there are no tiles, only the words', () => {
			const b = budget('larkspur');
			const c = card(
				summary(
					unread(
						b.lines.map((l) => l.id),
						{ sections: {}, complete: false, breakEven: null, burnMonthly: 0 }
					)
				)
			);
			expect(tiles(c)).toEqual([]);
			expect(caption(c)).toMatch(/^Spending so far\. Can’t be read: /);
		});
	});

	it('the picker still changes household', async () => {
		const { container } = render(LifestyleCard, {
			now: NOW,
			view: {
				kind: 'value',
				value: {
					computedAt: '',
					lastSuccessfulScrapeAt: null,
					households: [summary(budget('larkspur')), summary(budget('ross'))]
				},
				source: 's',
				observedAt: NOW,
				retainedAfter: null
			} as never
		});
		await fireEvent.click(container.querySelector('[data-town="ross"]')!);
		expect(screen.getByRole('link', { name: 'See all 40 lines →' }).getAttribute('href')).toBe(
			'/cost/ross'
		);
	});
});
