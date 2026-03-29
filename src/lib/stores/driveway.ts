/**
 * Driveway index store -- shared state for DrivewayPanel
 */

import { writable, derived } from 'svelte/store';
import type { DrivewayData } from '$lib/types/driveway';

export const drivewayStore = writable<DrivewayData>({ current: null, history: [] });

export const currentDrivewaySnapshot = derived(
	drivewayStore,
	($d) => $d.current
);

export const drivewayTopMakes = derived(
	drivewayStore,
	($d) => $d.current?.topMakes ?? []
);
