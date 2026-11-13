// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBlsSeries } from '../../../../scripts/shared/bls-series.mjs';
import { groceryInflation } from '$lib/grocery/inflation';
import GroceryBasketPanel from './GroceryBasketPanel.svelte';

const bls = parseBlsSeries(
	JSON.parse(readFileSync('tests/fixtures/costdata/bls-cuurs49bsaf11.json', 'utf8'))
);
const inflation = groceryInflation(
	{ current: { lastSuccessfulScrapeAt: new Date().toISOString(), url: 'u', ...bls } },
	new Date(Date.parse(bls.periodEnd) + 13 * 86_400_000)
);
const item = {
	itemId: 'a',
	itemName: 'Eggs, 12 ct',
	cheapest: 6.57,
	cheapestStore: 'Walmart',
	mostExpensive: 7.49,
	mostExpensiveStore: 'Sprouts',
	storePrices: []
};
const snap = (t: string, total: number) => ({
	timestamp: t,
	totalCheapest: total,
	totalExpensive: total + 30,
	itemsFound: 12,
	items: [item]
});
const basket = {
	current: snap('2026-11-01T17:11:00Z', 174.93),
	history: [snap('2026-11-01T17:11:00Z', 174.93), snap('2026-10-11T17:11:00Z', 174.45)],
	frozen: { asOf: '2026-11-01T17:11:00Z', noLongerUpdated: true }
};

const serve = (index: unknown, indexStatus = 200) =>
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) =>
			String(url).includes('grocery-inflation')
				? new Response(JSON.stringify(index), { status: indexStatus })
				: new Response(JSON.stringify(basket))
		)
	);

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe('the Grocery panel (COSTDATA-2)', () => {
	it('leads with SF-area grocery inflation, labelled with its own month', async () => {
		serve(inflation);
		render(GroceryBasketPanel);
		const lead = await screen.findByText('+4.4%');
		expect(lead).toBeTruthy();
		expect(screen.getByText('over the 12 months to Sep 2026')).toBeTruthy();
		expect(screen.getByText(/BLS published no Oct 2025/)).toBeTruthy();
		expect(screen.getByText('SF-area grocery inflation')).toBeTruthy();
	});

	it('keeps the Marin basket as a dated reference with no trend, movers or "vs last week"', async () => {
		serve(inflation);
		const { container } = render(GroceryBasketPanel);
		await screen.findByText('+4.4%');
		await waitFor(() => expect(container.querySelector('[data-grocery-reference]')).not.toBeNull());
		const ref = container.querySelector('[data-grocery-reference]')!;
		expect(ref.textContent).toContain('$174.93');
		expect(ref.textContent).toContain('Marin basket, prices as of Nov 1, 2026, no longer updated');
		expect(container.textContent).not.toMatch(/vs last week|Biggest Movers|Basket Cost Trend/);
	});

	it('shows no index figure at all when BLS cannot be read, and still shows the reference', async () => {
		serve({ status: 'unavailable', reason: 'x' });
		const { container } = render(GroceryBasketPanel);
		await screen.findByText("SF-area grocery prices can't be read right now");
		expect(container.querySelector('[data-grocery-lead]')).toBeNull();
		await waitFor(() => expect(container.querySelector('[data-grocery-reference]')).not.toBeNull());
	});

	it('treats a failed request as unavailable, never as an old figure', async () => {
		serve({ error: 'blob_unavailable' }, 503);
		const { container } = render(GroceryBasketPanel);
		await screen.findByText("SF-area grocery prices can't be read right now");
		expect(container.querySelector('[data-grocery-lead]')).toBeNull();
	});
});
