import { describe, expect, it } from 'vitest';
import { BASKET_ITEMS } from '$lib/config/grocery-basket';
import type { BasketItemPrices, GrocerySnapshot } from '$lib/types/grocery';
import { frozenBasket } from './grocery-frozen';

const item = (itemId: string, cheapest: number, cheapestStore: string): BasketItemPrices => ({
	itemId,
	itemName: itemId,
	cheapest,
	cheapestStore,
	mostExpensive: cheapest,
	mostExpensiveStore: cheapestStore,
	storePrices: []
});
const snap = (timestamp: string, items: BasketItemPrices[]): GrocerySnapshot => ({
	timestamp,
	lastSuccessfulScrapeAt: timestamp,
	totalCheapest: Math.round(items.reduce((s, i) => s + (i.cheapest ?? 0), 0) * 100) / 100,
	totalExpensive: null,
	itemsFound: items.length,
	items
});
/** A blocked run: every item at its reference price under its plain reference store. */
const reference = (timestamp: string) =>
	snap(
		timestamp,
		BASKET_ITEMS.map((b) => item(b.id, b.referencePrice, b.referenceStore))
	);
const read = (timestamp: string, kombucha = item('marin-kombucha', 4.69, 'Safeway')) =>
	snap(timestamp, [item('vital-farms-eggs', 6.57, 'Walmart'), kombucha]);

describe('frozenBasket (COSTDATA Q1: the Instacart scrape is stopped)', () => {
	it('keeps the last real read as current, marked no longer updated', () => {
		const latest = read('2026-11-01T17:11:00.558Z');
		const out = frozenBasket({
			current: latest,
			history: [latest, read('2026-10-25T16:11:00.000Z')]
		});
		expect(out.current).toEqual(latest);
		expect(out.frozen).toEqual({ asOf: '2026-11-01T17:11:00.558Z', noLongerUpdated: true });
	});

	it('drops every snapshot holding a reference price, labelled or not', () => {
		const labelled = read(
			'2026-10-18T16:11:03.844Z',
			item('marin-kombucha', 4.79, "Driver's Market (ref)")
		);
		const blocked = reference('2026-09-06T12:32:56.002Z');
		const good = read('2026-10-11T16:11:08.990Z');
		const out = frozenBasket({ current: labelled, history: [labelled, good, blocked] });
		expect(out.history.map((h) => h.timestamp)).toEqual(['2026-10-11T16:11:08.990Z']);
		expect(out.current?.timestamp).toBe('2026-10-11T16:11:08.990Z');
	});

	it('shows nothing rather than a reference basket when no real read exists', () => {
		const blocked = reference('2026-09-06T12:32:56.002Z');
		const out = frozenBasket({ current: blocked, history: [blocked] });
		expect(out.current).toBeNull();
		expect(out.history).toEqual([]);
		expect(out.frozen).toEqual({ asOf: null, noLongerUpdated: true });
	});

	it('reads garbage as empty', () => {
		expect(frozenBasket(null)).toEqual({
			current: null,
			history: [],
			frozen: { asOf: null, noLongerUpdated: true }
		});
	});
});
