/**
 * v2 section preferences store: explicit user choices persisted under
 * mm_sections_v2. Never touches v1 keys; never throws when storage is denied
 * (safe-storage degrades to "this page view only").
 */
import { writable } from 'svelte/store';
import {
	SECTION_PREFS_KEY,
	emptySectionPrefs,
	parseSectionPrefs,
	serializeSectionPrefs,
	withLayerOn,
	withSectionOpen,
	type LayerPrefId,
	type SectionId,
	type SectionPrefs
} from '$lib/dashboard/section-prefs';
import { safeGetItem, safeRemoveItem, safeSetItem } from '$lib/utils/safe-storage';

function createSectionPrefsStore() {
	const { subscribe, update } = writable<SectionPrefs>(
		parseSectionPrefs(safeGetItem(SECTION_PREFS_KEY))
	);

	return {
		subscribe,

		/** Record an explicit user choice. Hash- or outage-driven changes must not call this. */
		setOpen(id: SectionId, open: boolean) {
			update((prefs) => {
				const next = withSectionOpen(prefs, id, open);
				safeSetItem(SECTION_PREFS_KEY, serializeSectionPrefs(next));
				return next;
			});
		},

		/** An explicit map layer switch (MAPX2b). */
		setLayer(id: LayerPrefId, on: boolean) {
			update((prefs) => {
				const next = withLayerOn(prefs, id, on);
				safeSetItem(SECTION_PREFS_KEY, serializeSectionPrefs(next));
				return next;
			});
		},

		/** "Reset sections": forget section choices only (spec §13.5); layer choices stay. */
		reset() {
			update((prefs) => {
				const next = { ...emptySectionPrefs(), layers: prefs.layers };
				if (Object.keys(next.layers).length === 0) safeRemoveItem(SECTION_PREFS_KEY);
				else safeSetItem(SECTION_PREFS_KEY, serializeSectionPrefs(next));
				return next;
			});
		}
	};
}

export const sectionPrefs = createSectionPrefsStore();
