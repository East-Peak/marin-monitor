/**
 * The Grocery Basket since its Instacart scrape stopped (COSTDATA Q1,
 * 2026-11-03: Instacart's terms bar automated access). What is shown is the
 * last real read, labelled as no longer updated, and never a reference price
 * passed off as a read: a snapshot holding one, labelled "(ref)" or written by
 * a blocked run under the plain reference store, is dropped whole, because its
 * total includes it.
 */
import { BASKET_ITEMS } from '$lib/config/grocery-basket';
import type { BasketItemPrices, GroceryBasketData, GrocerySnapshot } from '$lib/types/grocery';

const REFERENCE = new Map(BASKET_ITEMS.map((b) => [b.id, b]));

function isReference(item: BasketItemPrices): boolean {
	const store = item.cheapestStore ?? '';
	if (store.endsWith('(ref)')) return true;
	const ref = REFERENCE.get(item.itemId);
	return ref !== undefined && item.cheapest === ref.referencePrice && store === ref.referenceStore;
}

const isSnapshot = (s: unknown): s is GrocerySnapshot =>
	typeof s === 'object' &&
	s !== null &&
	typeof (s as GrocerySnapshot).timestamp === 'string' &&
	Array.isArray((s as GrocerySnapshot).items);

const isRealRead = (s: GrocerySnapshot) => s.items.length > 0 && !s.items.some(isReference);

export function frozenBasket(raw: unknown): Required<GroceryBasketData> {
	const doc = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<GroceryBasketData>;
	const history = (Array.isArray(doc.history) ? doc.history : [])
		.filter(isSnapshot)
		.filter(isRealRead);
	const candidates = [doc.current, ...history].filter(isSnapshot).filter(isRealRead);
	const current =
		candidates.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0] ?? null;
	return {
		current,
		history,
		frozen: { asOf: current?.timestamp ?? null, noLongerUpdated: true }
	};
}
