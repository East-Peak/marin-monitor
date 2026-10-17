<!-- The map side of the in-view list (MAPX2): reports the visible bounds on a debounced moveend,
     keeps the docked panel as camera padding (so fits and flights never land under it), flies
     to a selection, draws a highlight ring for the hovered or selected item, and names the
     owned pin under the pointer. Renders nothing. -->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
	import type { Bounds } from '$lib/dashboard/map-in-view';
	import { featureSelection, SELECTABLE_SOURCES } from '$lib/dashboard/map-selection';
	import { fitMarinOverview } from '$lib/components/map/map-overview';
	import { get } from 'svelte/store';
	import { townFilter } from '$lib/stores/town-filter';

	let {
		panelPx,
		highlight,
		flyTo,
		onbounds,
		onhover
	}: {
		/** How much of the map's right edge the panel covers (0 when collapsed). */
		panelPx: number;
		/** The point to ring, or null. */
		highlight: [number, number] | null;
		/** A new array instance per request: each one flies. */
		flyTo: [number, number] | null;
		onbounds: (bounds: Bounds, widthPx: number) => void;
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
		onbounds(
			{ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
			m.getCanvas().clientWidth
		);
	}
	function ensureHighlight(m: MapLibreMap) {
		if (m.getSource(SOURCE)) return;
		m.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
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
		// A style swap (theme) drops our source; put it back.
		const onStyle = () => bound && ensureHighlight(bound);
		const stop = mapReady.subscribe((ready) => {
			const m = getMap();
			if (!ready || !m || bound === m) return;
			bound = m;
			map = m;
			ensureHighlight(m);
			m.on('moveend', onMove);
			m.on('resize', onMove);
			m.on('mousemove', onPointer);
			m.on('styledata', onStyle);
			report(m);
		});
		return () => {
			stop();
			if (timer) clearTimeout(timer);
			bound?.off('moveend', onMove);
			bound?.off('resize', onMove);
			bound?.off('mousemove', onPointer);
			bound?.off('styledata', onStyle);
		};
	});

	// The load-time county fit ran before the panel existed: refit once under the padding, so
	// the east of Marin doesn't start under the list (a saved town is V2MapNav's to fly to).
	let refitted = false;
	$effect(() => {
		if (!map) return;
		map.setPadding({ top: 0, bottom: 0, left: 0, right: panelPx });
		if (!refitted && panelPx > 0) {
			refitted = true;
			if (get(townFilter) === null) fitMarinOverview(map, 0);
		}
		report(map);
	});
	$effect(() => {
		const source = map?.getSource(SOURCE) as GeoJSONSource | undefined;
		source?.setData({
			type: 'FeatureCollection',
			features: highlight
				? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: highlight } }]
				: []
		});
	});
	$effect(() => {
		if (map && flyTo)
			map.flyTo({ center: flyTo, zoom: Math.max(map.getZoom(), 13), duration: 600 });
	});
</script>
