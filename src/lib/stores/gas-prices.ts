/**
 * Gas price store — shared between GasPricesPanel and MapDataLayer
 */

import { writable, derived } from 'svelte/store';
import type { GasPriceData } from '$lib/types/gas';

export const gasPriceStore = writable<GasPriceData>({ current: null, history: [] });

export const currentGasStations = derived(gasPriceStore, ($d) => $d.current?.stations ?? []);
