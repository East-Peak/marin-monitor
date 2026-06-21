/**
 * Marin Coffee Index store -- shared between the coffee panel and map layer.
 */

import { derived, writable } from 'svelte/store';
import type { CoffeeIndexData } from '$lib/types/coffee';

export const coffeeIndexStore = writable<CoffeeIndexData>({ current: null, history: [] });

export const currentCoffeeShops = derived(coffeeIndexStore, ($data) => $data.current?.shops ?? []);
