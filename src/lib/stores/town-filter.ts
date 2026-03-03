/**
 * Town filter store — single source of truth for the global town selection.
 *
 * Unifies the old mapStore.selectedTown (transient) and settings.locationId (persisted)
 * into one store that drives the entire dashboard.
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { TOWN_BY_SLUG } from '$lib/config/towns';
import { getLocationForTown } from '$lib/geo/proximity';
import { getLocationById } from '$lib/config/locations';
import { settings } from './settings';
import type { Town } from '$lib/types';
import type { LocationPreset } from '$lib/config/locations';

const STORAGE_KEY = 'mm_town';

function loadTown(): string | null {
	if (!browser) return null;
	const saved = localStorage.getItem(STORAGE_KEY);
	return saved && TOWN_BY_SLUG[saved] ? saved : null;
}

function createTownFilterStore() {
	const { subscribe, set } = writable<string | null>(loadTown());

	return {
		subscribe,

		/** Select a town (or null for "All of Marin") */
		select(townSlug: string | null) {
			if (browser) {
				if (townSlug) {
					localStorage.setItem(STORAGE_KEY, townSlug);
				} else {
					localStorage.removeItem(STORAGE_KEY);
				}
			}
			set(townSlug);
		},

		/** Clear the town filter (show all of Marin) */
		clear() {
			this.select(null);
		}
	};
}

export const townFilter = createTownFilterStore();

/** The full Town object for the selected town, or null for county-wide */
export const selectedTownObj = derived(townFilter, ($slug): Town | null =>
	$slug ? TOWN_BY_SLUG[$slug] ?? null : null
);

/**
 * The best LocationPreset for weather/tides based on the selected town.
 * When no town is selected, falls back to the user's settings.locationId.
 */
export const townLocation = derived(
	[townFilter, settings],
	([$slug, $settings]): LocationPreset => {
		if ($slug) {
			return getLocationForTown($slug);
		}
		return getLocationById($settings.locationId);
	}
);
