/**
 * Cappuccino price store -- shared between CappuccinoPanel and MapDataLayer
 */

import { writable, derived } from 'svelte/store';
import type { CoffeeData } from '$lib/types/coffee';

export const cappuccinoStore = writable<CoffeeData>({ current: null, history: [] });

export const currentCoffeeShops = derived(
	cappuccinoStore,
	($d) => $d.current?.shops ?? []
);
