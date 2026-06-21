/**
 * Wine index store -- shared state for WineIndexPanel
 */

import { writable, derived } from 'svelte/store';
import type { WineIndexData } from '$lib/types/wine';

export const wineIndexStore = writable<WineIndexData>({ current: null, history: [] });

export const currentWineCategories = derived(wineIndexStore, ($d) => $d.current?.categories ?? []);

export const currentStaffPicks = derived(wineIndexStore, ($d) => $d.current?.staffPicks ?? []);

export const currentAllocatedWines = derived(
	wineIndexStore,
	($d) => $d.current?.allocatedWines ?? []
);
