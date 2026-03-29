/**
 * Grocery basket store -- holds the current Bare Essentials data
 */

import { writable, derived } from 'svelte/store';
import type { GroceryBasketData } from '$lib/types/grocery';

export const groceryBasketStore = writable<GroceryBasketData>({
	current: null,
	history: []
});

export const currentBasketTotal = derived(
	groceryBasketStore,
	($d) => $d.current?.totalCheapest ?? null
);

export const currentBasketItems = derived(
	groceryBasketStore,
	($d) => $d.current?.items ?? []
);
