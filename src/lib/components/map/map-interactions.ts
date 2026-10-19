/**
 * Map interaction helpers: hover state management and click/hover binding.
 *
 * These functions wire MapLibre layer events to hover-state feedback and
 * click handlers.  They are stateful (they mutate the hoveredFeatureIds map
 * and set cursor styles) but contain no rendering logic.
 */

import type { Map as MapLibreMap, MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl';

// ---------------------------------------------------------------------------
// Hover expression helpers  (used by layer paint definitions)
// ---------------------------------------------------------------------------

/** A MapLibre expression that evaluates to `true` when a feature is hovered. */
const HOVER_STATE = ['boolean', ['feature-state', 'hover'], false] as const;

/**
 * MapLibre style expression — a JSON array representing a data-driven property.
 * Typed as `any` because MapLibre's ExpressionSpecification is a 30+ member
 * discriminated union that cannot be satisfied by dynamically constructed arrays.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StyleExpression = any;

/** Return `hoverValue` when hovered, `baseValue` otherwise. */
export function hoverCase(hoverValue: unknown, baseValue: unknown): StyleExpression {
	return ['case', HOVER_STATE, hoverValue, baseValue];
}

/** Add `amount` to a numeric `baseValue` on hover. */
export function hoverAdd(baseValue: unknown, amount: number): StyleExpression {
	return hoverCase(['+', baseValue, amount], baseValue);
}

// ---------------------------------------------------------------------------
// Feature-state bookkeeping
// ---------------------------------------------------------------------------

/** Per-source tracking of the currently hovered feature id. */
export const hoveredFeatureIds = new Map<string, string | number | null>();

export type HoveredMapFeature = NonNullable<MapLayerMouseEvent['features']>[number];

function getFeatureId(feature: { id?: unknown } | null | undefined): string | number | null {
	if (typeof feature?.id === 'string' || typeof feature?.id === 'number') {
		return feature.id;
	}
	return null;
}

function setHoveredFeatureState(
	map: MapLibreMap,
	hoverKey: string,
	sourceId: string,
	nextFeatureId: string | number | null
) {
	const previousFeatureId = hoveredFeatureIds.get(hoverKey) ?? null;
	if (previousFeatureId === nextFeatureId) return;

	if (previousFeatureId !== null && map.getSource(sourceId)) {
		map.setFeatureState({ source: sourceId, id: previousFeatureId }, { hover: false });
	}

	hoveredFeatureIds.set(hoverKey, nextFeatureId);

	if (nextFeatureId !== null && map.getSource(sourceId)) {
		map.setFeatureState({ source: sourceId, id: nextFeatureId }, { hover: true });
	}
}

function clearHoveredFeatureState(map: MapLibreMap, hoverKey: string, sourceId: string) {
	setHoveredFeatureState(map, hoverKey, sourceId, null);
}

// ---------------------------------------------------------------------------
// Reusable binding helpers
// ---------------------------------------------------------------------------

export interface HoverBindingOptions {
	triggerLayerIds: string[];
	sourceId: string;
	hoverKey?: string;
	onFeatureChange?: (feature: HoveredMapFeature | null) => void;
}

/**
 * Attach mouseenter/mousemove/mouseleave handlers to a set of layers so that
 * the underlying source features get hover state and the cursor changes.
 */
export function bindInteractiveHover(map: MapLibreMap, options: HoverBindingOptions) {
	let lastFeatureId: string | number | null = null;
	let leaveTimer: ReturnType<typeof setTimeout> | null = null;
	const hoverKey = options.hoverKey ?? options.sourceId;

	const cancelPendingLeave = () => {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
			leaveTimer = null;
		}
	};

	const handleHover = (e: MapLayerMouseEvent) => {
		cancelPendingLeave();
		map.getCanvas().style.cursor = 'pointer';
		const feature = e.features?.[0] ?? null;
		const nextFeatureId = getFeatureId(feature);
		setHoveredFeatureState(map, hoverKey, options.sourceId, nextFeatureId);
		if (nextFeatureId === lastFeatureId) return;
		lastFeatureId = nextFeatureId;
		options.onFeatureChange?.(feature);
	};

	const handleLeave = () => {
		cancelPendingLeave();
		leaveTimer = setTimeout(() => {
			lastFeatureId = null;
			clearHoveredFeatureState(map, hoverKey, options.sourceId);
			const hasHoveredFeature = Array.from(hoveredFeatureIds.values()).some(
				(featureId) => featureId !== null
			);
			if (!hasHoveredFeature) {
				map.getCanvas().style.cursor = '';
			}
			options.onFeatureChange?.(null);
			leaveTimer = null;
		}, 0);
	};

	for (const layerId of options.triggerLayerIds) {
		map.on('mouseenter', layerId, handleHover);
		map.on('mousemove', layerId, handleHover);
		map.on('mouseleave', layerId, handleLeave);
	}
}

/**
 * Attach a click handler to every layer in `layerIds`.
 */
export function bindLayerGroupClick(
	map: MapLibreMap,
	layerIds: string[],
	handler: (e: MapLayerMouseEvent) => void
) {
	for (const layerId of layerIds) {
		map.on('click', layerId, handler);
	}
}

// ---------------------------------------------------------------------------
// Strava collision check
// ---------------------------------------------------------------------------

const STRAVA_CLICK_LAYERS = [
	'strava-lines-ride',
	'strava-lines-run',
	'strava-pins',
	'strava-pins-labels'
] as const;

/**
 * Returns true when the click point overlaps a visible Strava feature,
 * so that other click handlers can yield priority to SegmentLayer.
 */
export function clickHitsVisibleStravaFeature(map: MapLibreMap, e: MapLayerMouseEvent): boolean {
	const interactiveLayers = STRAVA_CLICK_LAYERS.filter((layerId) => {
		if (!map.getLayer(layerId)) return false;
		return map.getLayoutProperty(layerId, 'visibility') !== 'none';
	});
	if (interactiveLayers.length === 0) return false;
	return map.queryRenderedFeatures(e.point, { layers: [...interactiveLayers] }).length > 0;
}

// ---------------------------------------------------------------------------
// Town selection yields to inspection targets (dashboard spec §2.4, §4)
// ---------------------------------------------------------------------------

export const TOWN_CLICK_LAYERS = ['towns-layer', 'towns-label'] as const;

/**
 * Point-like layers whose click opens an inspector. A click on any of them never selects a town.
 * Keep in sync with the *TriggerLayers arrays in MapDataLayer.svelte `bindInteractions`.
 */
export const INSPECTION_CLICK_LAYERS = [
	'news-pins-hit-layer',
	'news-pins-layer',
	'landmarks-layer',
	'landmarks-hit-layer',
	'landmarks-label',
	'fire-zones-layer',
	'traffic-events-layer',
	'traffic-events-hit-layer',
	'earthquakes-layer',
	'earthquakes-ring-layer',
	'gas-stations-layer',
	'gas-stations-hit-layer',
	'gas-stations-label',
	'ev-charging-stations-layer',
	'ev-charging-stations-hit-layer',
	'ev-charging-stations-label',
	'coffee-shops-layer',
	'coffee-shops-hit-layer',
	'coffee-shops-label',
	'fitness-studios-layer',
	'fitness-studios-hit-layer',
	'fitness-studios-label',
	'cameras-layer',
	'cameras-hit-layer',
	'camera-wedges-fill',
	'show-venues-layer',
	'show-venues-hit-layer',
	'story-places-dot',
	'story-places-hit-layer',
	'story-places-halo',
	'story-places-label',
	'blotter-towns-layer',
	'blotter-towns-label',
	'311-reports-layer',
	'311-reports-hit-layer',
	'fire-incidents-layer',
	'fire-incidents-label',
	'airports-layer',
	'airports-hit-layer',
	'airports-label'
] as const;

function hitsVisible(map: MapLibreMap, e: MapLayerMouseEvent, layers: readonly string[]): boolean {
	const visible = layers.filter(
		(layerId) => map.getLayer(layerId) && map.getLayoutProperty(layerId, 'visibility') !== 'none'
	);
	if (visible.length === 0) return false;
	return map.queryRenderedFeatures(e.point, { layers: [...visible] }).length > 0;
}

/** True when the click point overlaps a visible inspection target (`except` aside). */
export function clickHitsInspectionTarget(
	map: MapLibreMap,
	e: MapLayerMouseEvent,
	except: readonly string[] = []
): boolean {
	return hitsVisible(
		map,
		e,
		INSPECTION_CLICK_LAYERS.filter((id) => !except.includes(id))
	);
}

const CAMERA_PIN_LAYERS = ['cameras-layer', 'cameras-hit-layer'];
const CAMERA_WEDGE_LAYER = 'camera-wedges-fill';
/** A story's area halo and its "(area)" label (NEWSPIN2): wide, so low priority, like a wedge. */
const AREA_LAYERS = ['story-places-halo', 'story-places-label'];
/** The big, low-priority targets: a click on anything else under them is that thing's. */
const UNDERLAYS = [CAMERA_WEDGE_LAYER, ...AREA_LAYERS];

/**
 * The fire cameras (MAPX4). A pin opens its camera. A wedge covers kilometres of map, so it is
 * the lowest priority: a click on any other target or a town circle inside it is theirs.
 */
export function bindCameraClick(map: MapLibreMap, onCamera: (id: string, name: string) => void) {
	const open = (e: MapLayerMouseEvent) => {
		const props = e.features?.[0]?.properties;
		if (props?.itemId) onCamera(String(props.itemId), String(props.name ?? 'Camera'));
	};
	bindLayerGroupClick(map, CAMERA_PIN_LAYERS, (e) => {
		if (!clickHitsVisibleStravaFeature(map, e)) open(e);
	});
	map.on('click', CAMERA_WEDGE_LAYER, (e: MapLayerMouseEvent) => {
		if (clickHitsVisibleStravaFeature(map, e)) return;
		if (clickHitsInspectionTarget(map, e, [CAMERA_WEDGE_LAYER])) return;
		if (hitsVisible(map, e, TOWN_CLICK_LAYERS)) return;
		open(e);
	});
}

/** A story's place under the click (NEWSPIN2): a placed area sits on its own landmark. */
export function clickHitsStoryPlace(map: MapLibreMap, e: MapLayerMouseEvent): boolean {
	return hitsVisible(map, e, ['story-places-dot', 'story-places-hit-layer']);
}

/**
 * A story at its headline's place (NEWSPIN2). A venue's dot opens it as a pin does; an area's
 * halo or label yields to every other target and to a town circle, but beats a wedge.
 */
export function bindStoryPlaceClick(map: MapLibreMap, onStory: (id: string) => void) {
	const open = (e: MapLayerMouseEvent) => {
		const id = e.features?.[0]?.properties?.itemId;
		if (id) onStory(String(id));
	};
	bindLayerGroupClick(map, ['story-places-dot', 'story-places-hit-layer'], (e) => {
		if (!clickHitsVisibleStravaFeature(map, e)) open(e);
	});
	bindLayerGroupClick(map, AREA_LAYERS, (e) => {
		if (clickHitsVisibleStravaFeature(map, e)) return;
		if (clickHitsInspectionTarget(map, e, UNDERLAYS)) return;
		if (hitsVisible(map, e, TOWN_CLICK_LAYERS)) return;
		open(e);
	});
}

/**
 * Town selection by map click. It yields to Strava and to every inspection target,
 * so inspecting a pin, station or incident never changes the global town.
 */
export function bindTownSelectionClick(map: MapLibreMap, onTownClick: (townSlug: string) => void) {
	bindLayerGroupClick(map, [...TOWN_CLICK_LAYERS], (e: MapLayerMouseEvent) => {
		// A wedge or an area halo yields to towns, so it can't block one either.
		if (clickHitsVisibleStravaFeature(map, e) || clickHitsInspectionTarget(map, e, UNDERLAYS))
			return;
		const slug = e.features?.[0]?.properties?.slug;
		if (slug) onTownClick(String(slug));
	});
}

/**
 * A click on nothing of ours (CAMDESEL1): no inspection target, town or Strava feature under
 * it. The basemap's land and water don't count. MapLibre fires no click after a drag.
 */
export function bindEmptyClick(map: MapLibreMap, onEmpty: () => void) {
	map.on('click', (e: MapMouseEvent) => {
		const at = e as MapLayerMouseEvent;
		if (clickHitsVisibleStravaFeature(map, at)) return;
		if (hitsVisible(map, at, [...INSPECTION_CLICK_LAYERS, ...TOWN_CLICK_LAYERS])) return;
		onEmpty();
	});
}
