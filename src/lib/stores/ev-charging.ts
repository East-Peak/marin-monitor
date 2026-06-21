/**
 * EV charging store — shared between EvChargingPanel and MapDataLayer
 */

import { writable, derived } from 'svelte/store';
import type { EvChargingData } from '$lib/types/ev-charging';

export const evChargingStore = writable<EvChargingData>({ current: null, history: [] });

export const currentChargingStations = derived(evChargingStore, ($d) => $d.current?.stations ?? []);
