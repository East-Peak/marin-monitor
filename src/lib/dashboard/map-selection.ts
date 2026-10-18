/**
 * Selection between the in-view list and the map (MAPX2): one namespaced id names an item on
 * both sides. A pin's id comes from its own source's properties; a row's fly target is its
 * item's point. The selection lasts while the item is still in the data, in view or not.
 */
import { selectionId, type InViewItem, type InViewLayer } from './map-in-view';

/** Owned map sources and the property holding each feature's raw id. */
const SOURCES: Readonly<Record<string, { layer: InViewLayer; key: string }>> = {
	'news-pins': { layer: 'news', key: 'id' },
	'311-reports': { layer: '311', key: 'itemId' },
	earthquakes: { layer: 'quake', key: 'itemId' },
	'traffic-events': { layer: 'traffic', key: 'itemId' },
	'fire-incidents': { layer: 'fire', key: 'itemId' },
	'gas-stations': { layer: 'gas', key: 'itemId' },
	'ev-charging-stations': { layer: 'ev', key: 'itemId' },
	'coffee-shops': { layer: 'coffee', key: 'itemId' },
	'fitness-studios': { layer: 'fitness', key: 'itemId' },
	airports: { layer: 'airport', key: 'itemId' },
	cameras: { layer: 'cams', key: 'itemId' },
	'camera-wedges': { layer: 'cams', key: 'itemId' }
};

/** The map's click payload kinds that name a listed item. */
const KINDS: Readonly<Record<string, InViewLayer>> = {
	'311-report': '311',
	earthquake: 'quake',
	'traffic-event': 'traffic',
	'fire-incident': 'fire',
	'gas-station': 'gas',
	'ev-charging-station': 'ev',
	'coffee-shop': 'coffee',
	'fitness-studio': 'fitness',
	airport: 'airport',
	camera: 'cams'
};

/** A feature click's selection: its own id, namespaced by its kind (null when it names none). */
export function clickSelection(f: { kind: string; itemId?: string } | null): string | null {
	if (!f) return null;
	const layer = KINDS[f.kind];
	return layer && f.itemId ? selectionId(layer, f.itemId) : null;
}

export function featureSelection(feature: {
	source: string;
	properties: Record<string, unknown> | null;
}): string | null {
	const owner = SOURCES[feature.source];
	const raw = owner ? feature.properties?.[owner.key] : undefined;
	return raw === undefined || raw === null || raw === ''
		? null
		: selectionId(owner.layer, String(raw));
}

/** The source ids whose features can be hovered or clicked into the list. */
export const SELECTABLE_SOURCES = Object.keys(SOURCES);

export function resolveSelection(
	items: readonly InViewItem[],
	id: string | null
): InViewItem | null {
	return id === null ? null : (items.find((i) => i.id === id) ?? null);
}

export function flyTarget(items: readonly InViewItem[], id: string): [number, number] | null {
	const hit = resolveSelection(items, id);
	return hit ? [hit.lon, hit.lat] : null;
}
