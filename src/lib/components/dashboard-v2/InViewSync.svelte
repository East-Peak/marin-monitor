<!-- The map side of the in-view list (MAPX2): reports the visible bounds on a debounced moveend,
     keeps the docked panel as camera padding (so fits and flights never land under it), flies
     to a selection, draws a highlight ring for the hovered or selected item, and names the
     owned pin under the pointer. The map stays north-up and flat while it runs (v2 has no
     compass to undo a turn, and the bounds trim assumes it). Leaving desktop undoes all of
     it. Renders nothing. -->
<script lang="ts">
	import { getContext, onMount, untrack } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
	import { steadyCenter, type Bounds } from '$lib/dashboard/map-in-view';
	import { featureSelection, SELECTABLE_SOURCES } from '$lib/dashboard/map-selection';
	import { fitMarinOverview } from '$lib/components/map/map-overview';
	import { get } from 'svelte/store';
	import { townFilter } from '$lib/stores/town-filter';

	let {
		panelPx,
		highlight,
		flyTo,
		refit = true,
		onbounds,
		onhover
	}: {
		/** How much of the map's right edge the panel covers (0 when collapsed). */
		panelPx: number;
		/** The point to ring, or null. */
		highlight: [number, number] | null;
		/** A new array instance per request: each one flies. */
		flyTo: [number, number] | null;
		/** Refit the county under the panel once it docks; off when the URL chose the view. */
		refit?: boolean;
		/** The settled bounds and camera (debounced), for the list and /map's URL. */
		onbounds: (
			bounds: Bounds,
			widthPx: number,
			camera: { zoom: number; lat: number; lng: number }
		) => void;
		onhover: (id: string | null) => void;
	} = $props();

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Writable<boolean>;
	}>('maplibre-map');
	const SOURCE = 'v2-in-view-highlight';
	const DEBOUNCE_MS = 150;
	let map = $state<MapLibreMap | null>(null);

	function report(m: MapLibreMap) {
		const b = m.getBounds();
		const { lng, lat } = m.getCenter();
		// Untracked: report runs inside the padding effect, and the owner's handler reads state.
		untrack(() =>
			onbounds(
				{ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
				m.getCanvas().clientWidth,
				{ zoom: m.getZoom(), lat, lng }
			)
		);
	}
	const ring = (at: [number, number] | null): GeoJSON.FeatureCollection => ({
		type: 'FeatureCollection',
		features: at
			? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: at } }]
			: []
	});
	function ensureHighlight(m: MapLibreMap) {
		if (m.getSource(SOURCE)) return;
		// Recreated after a style swap with the current ring, not an empty one.
		m.addSource(SOURCE, { type: 'geojson', data: ring(highlight) });
		m.addLayer({
			id: `${SOURCE}-ring`,
			type: 'circle',
			source: SOURCE,
			paint: {
				'circle-radius': 11,
				'circle-color': 'rgba(0,0,0,0)',
				'circle-stroke-width': 2.5,
				'circle-stroke-color': '#ffffff'
			}
		});
	}

	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | null = null;
		let bound: MapLibreMap | null = null;
		const onMove = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => bound && report(bound), DEBOUNCE_MS);
		};
		const owned = (m: MapLibreMap) =>
			(m.getStyle()?.layers ?? [])
				.filter((l) => 'source' in l && SELECTABLE_SOURCES.includes(String(l.source)))
				.map((l) => l.id);
		const onPointer = (e: MapMouseEvent) => {
			if (!bound) return;
			const hit = bound.queryRenderedFeatures(e.point, { layers: owned(bound) })[0];
			onhover(hit ? featureSelection({ source: hit.source, properties: hit.properties }) : null);
		};
		// Off the map, nothing on it is hovered (CAMQUIET1: a camera's wedge goes quiet again).
		const onLeave = () => onhover(null);
		// A re-aimed flight ends its first leg with a moveend too: done only once nothing moves.
		const onSettle = () =>
			queueMicrotask(() => {
				if (bound && !bound.isMoving()) flying = null;
			});
		// A style swap (theme) drops our source; put it back.
		const onStyle = () => bound && ensureHighlight(bound);
		const stop = mapReady.subscribe((ready) => {
			const m = getMap();
			if (!ready || !m || bound === m) return;
			bound = m;
			map = m;
			m.dragRotate.disable();
			m.touchZoomRotate.disableRotation();
			m.keyboard.disableRotation();
			m.setBearing(0);
			m.setPitch(0);
			ensureHighlight(m);
			m.on('moveend', onMove);
			m.on('moveend', onSettle);
			m.on('resize', onMove);
			m.on('mousemove', onPointer);
			m.on('mouseout', onLeave);
			m.on('styledata', onStyle);
			report(m);
		});
		return () => {
			stop();
			if (timer) clearTimeout(timer);
			if (!bound) return;
			bound.off('moveend', onMove);
			bound.off('moveend', onSettle);
			bound.off('resize', onMove);
			bound.off('mousemove', onPointer);
			bound.off('mouseout', onLeave);
			bound.off('styledata', onStyle);
			// Below desktop the map is the phone/tablet map again: no padding, ring or lock.
			bound.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
			if (bound.getLayer(`${SOURCE}-ring`)) bound.removeLayer(`${SOURCE}-ring`);
			if (bound.getSource(SOURCE)) bound.removeSource(SOURCE);
			bound.dragRotate.enable();
			bound.touchZoomRotate.enableRotation();
			bound.keyboard.enableRotation();
		};
	});

	// The load-time county fit ran before the panel existed: refit once under the padding, so
	// the east of Marin doesn't start under the list (a saved town is V2MapNav's to fly to).
	let refitted = false;
	let docked = false;
	/** Our flight's target while it flies: a padding change re-aims it rather than stopping it. */
	let flying: { center: [number, number]; zoom: number } | null = null;
	$effect(() => {
		if (!map) return;
		const padding = { top: 0, bottom: 0, left: 0, right: panelPx };
		const from = map.getPadding().right;
		// Any padding change stops a flight (setPadding is a jumpTo). Ours lands under the new
		// padding instead; after the first dock, Hide and Show otherwise change only the padding,
		// the geography staying on its pixels (PANELSTEADY1). The first dock keeps the bare
		// change, so a URL's centre stays the padded centre it was written as.
		if (from === panelPx) {
			// Nothing to change, and nothing to stop.
		} else if (flying && map.isMoving()) map.flyTo({ ...flying, padding, duration: 600 });
		else if (!docked || map.isMoving()) map.setPadding(padding);
		else
			map.jumpTo({ padding, center: steadyCenter(map.getCenter(), map.getZoom(), from, panelPx) });
		if (panelPx > 0) docked = true;
		if (refit && !refitted && panelPx > 0) {
			refitted = true;
			if (get(townFilter) === null) fitMarinOverview(map, 0);
		}
		report(map);
	});
	$effect(() => {
		const source = map?.getSource(SOURCE) as GeoJSONSource | undefined;
		source?.setData(ring(highlight));
	});
	$effect(() => {
		if (!map || !flyTo) return;
		const m = map;
		flying = { center: flyTo, zoom: Math.max(m.getZoom(), 13) };
		m.flyTo({ ...flying, duration: 600 });
	});
</script>
