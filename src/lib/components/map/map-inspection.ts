import type { NewsItem } from '$lib/types';
/**
 * What a map click means. Only an explicit town choice changes the global town;
 * inspecting a pin opens the inspector and never does (spec §2.4, §4).
 */
export type InspectorState =
	| { mode: 'town'; townSlug: string }
	| { mode: 'pin'; itemId: string; townSlug: string | null };

export interface MapClickOutcome {
	inspector: InspectorState | null;
	/** Present only when the click is an explicit town choice. */
	selectTown?: string | null;
}

export function townClickOutcome(currentTown: string | null, clickedTown: string): MapClickOutcome {
	const next = currentTown === clickedTown ? null : clickedTown;
	return { inspector: next ? { mode: 'town', townSlug: next } : null, selectTown: next };
}

export function pinClickOutcome(item: { id: string; townSlug?: string }): MapClickOutcome {
	return { inspector: { mode: 'pin', itemId: item.id, townSlug: item.townSlug ?? null } };
}

interface InspectorModel {
	mode: 'town' | 'pin';
	townSlug: string | null;
	townName: string | null;
	items: NewsItem[];
	selectedItemId: string | null;
	pinnedCount: number;
	townOnlyCount: number;
}

const isPinned = (item: NewsItem) => typeof item.lat === 'number' && typeof item.lon === 'number';

/** What the inspector shows for a click (MapPanel's derivation, shared with the v2 map). */
export function inspectorModel(
	state: InspectorState | null,
	items: readonly NewsItem[],
	townName: (slug: string) => string
): InspectorModel | null {
	if (!state) return null;
	if (state.mode === 'town') {
		const inTown = items.filter((item) => item.townSlug === state.townSlug);
		const pinnedCount = inTown.filter(isPinned).length;
		return {
			mode: 'town',
			townSlug: state.townSlug,
			townName: townName(state.townSlug),
			items: inTown,
			selectedItemId: null,
			pinnedCount,
			townOnlyCount: Math.max(0, inTown.length - pinnedCount)
		};
	}
	const selected = items.find((item) => item.id === state.itemId);
	if (!selected) return null;
	const townSlug = selected.townSlug ?? state.townSlug ?? null;
	const related = townSlug
		? items.filter((item) => item.townSlug === townSlug && item.id !== selected.id)
		: [];
	const shown = [selected, ...related];
	const pinnedCount = shown.filter(isPinned).length;
	return {
		mode: 'pin',
		townSlug,
		townName: townSlug ? townName(townSlug) : (selected.town ?? null),
		items: shown,
		selectedItemId: selected.id,
		pinnedCount,
		townOnlyCount: Math.max(0, shown.length - pinnedCount)
	};
}
