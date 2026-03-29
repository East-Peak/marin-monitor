/**
 * Composite index store -- shared state for CompositePanel
 */

import { writable, derived } from 'svelte/store';
import type { CompositeData } from '$lib/types/composite';

export const compositeStore = writable<CompositeData>({ current: null, history: [] });

export const currentCompositeScore = derived(
	compositeStore,
	($d) => $d.current?.compositeScore ?? null
);

export const currentMarinNumber = derived(
	compositeStore,
	($d) => $d.current?.marinNumber ?? null
);
