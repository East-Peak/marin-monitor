/**
 * Map interaction helpers: hover state management and click/hover binding.
 *
 * These functions wire MapLibre layer events to hover-state feedback and
 * click handlers.  They are stateful (they mutate the hoveredFeatureIds map
 * and set cursor styles) but contain no rendering logic.
 */

import type { Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';

// ---------------------------------------------------------------------------
// Hover expression helpers  (used by layer paint definitions)
// ---------------------------------------------------------------------------

/** A MapLibre expression that evaluates to `true` when a feature is hovered. */
export const HOVER_STATE = ['boolean', ['feature-state', 'hover'], false] as const;

/** Warm off-white stroke shown on hovered features. */
export const INVITING_HOVER_STROKE = 'rgba(255, 247, 220, 0.98)';

/** Return `hoverValue` when hovered, `baseValue` otherwise. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hoverCase(hoverValue: unknown, baseValue: unknown): any {
	return ['case', HOVER_STATE, hoverValue, baseValue];
}

/** Add `amount` to a numeric `baseValue` on hover. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hoverAdd(baseValue: unknown, amount: number): any {
	return hoverCase(['+', baseValue, amount], baseValue);
}

// ---------------------------------------------------------------------------
// Feature-state bookkeeping
// ---------------------------------------------------------------------------

/** Per-source tracking of the currently hovered feature id. */
export const hoveredFeatureIds = new Map<string, string | number | null>();

export type HoveredMapFeature = NonNullable<MapLayerMouseEvent['features']>[number];

export function getFeatureId(feature: { id?: unknown } | null | undefined): string | number | null {
	if (typeof feature?.id === 'string' || typeof feature?.id === 'number') {
		return feature.id;
	}
	return null;
}

export function setHoveredFeatureState(
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

export function clearHoveredFeatureState(
	map: MapLibreMap,
	hoverKey: string,
	sourceId: string
) {
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
export function clickHitsVisibleStravaFeature(
	map: MapLibreMap,
	e: MapLayerMouseEvent
): boolean {
	const interactiveLayers = STRAVA_CLICK_LAYERS.filter((layerId) => {
		if (!map.getLayer(layerId)) return false;
		return map.getLayoutProperty(layerId, 'visibility') !== 'none';
	});
	if (interactiveLayers.length === 0) return false;
	return map.queryRenderedFeatures(e.point, { layers: [...interactiveLayers] }).length > 0;
}
