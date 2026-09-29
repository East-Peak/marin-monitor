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
import { safeGetItem, safeRemoveItem, safeSetItem } from '$lib/utils/safe-storage';
import type { Town } from '$lib/types';
import type { LocationPreset } from '$lib/config/locations';

const STORAGE_KEY = 'mm_town';

function loadTown(): string | null {
	if (!browser) return null;
	const saved = safeGetItem(STORAGE_KEY);
	return saved && TOWN_BY_SLUG[saved] ? saved : null;
}

function createTownFilterStore() {
	/** The dashboard's selection for this page view. Storage is only a best-effort copy. */
	let dashboardTown: string | null = loadTown();
	const { subscribe, set } = writable<string | null>(dashboardTown);
	/** While a transient scope (e.g. TV) is active, the dashboard selection and storage are untouched. */
	let transient = false;

	function persist(townSlug: string | null) {
		if (!browser) return;
		// Storage denied or full: the in-memory selection still holds for this page view.
		if (townSlug) safeSetItem(STORAGE_KEY, townSlug);
		else safeRemoveItem(STORAGE_KEY);
	}

	return {
		subscribe,

		/** Select a town (or null for "All of Marin") */
		select(townSlug: string | null) {
			if (!transient) {
				dashboardTown = townSlug;
				persist(townSlug);
			}
			set(townSlug);
		},

		/** Clear the town filter (show all of Marin) */
		clear() {
			this.select(null);
		},

		/**
		 * Show `townSlug` without touching the dashboard selection or storage, for views
		 * with their own scope (the TV wallboard is county-wide). Returns `end`, which
		 * restores the dashboard selection from memory (spec §13.5; Codex r1 #6).
		 */
		beginTransientScope(townSlug: string | null): () => void {
			transient = true;
			set(townSlug);
			let ended = false;
			return () => {
				if (ended) return;
				ended = true;
				transient = false;
				set(dashboardTown);
			};
		}
	};
}

export const townFilter = createTownFilterStore();

/** The full Town object for the selected town, or null for county-wide */
export const selectedTownObj = derived(townFilter, ($slug): Town | null =>
	$slug ? (TOWN_BY_SLUG[$slug] ?? null) : null
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
