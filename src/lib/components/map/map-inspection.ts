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
