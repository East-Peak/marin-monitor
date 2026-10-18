<!-- The v2 map (§2.4, Decision 3): owner-supplied layers only (news, 311, earthquakes), kept
     features dimmed and explained, a status line for every enabled layer's source, and a
     test hook under ?probe. Desktop (≥1024): a docked in-view list replaces the popups (MAPX2).
     Phone: a compact preview whose "Expand map" opens /map (MAPX3), where a bottom sheet holds
     the list. Every whole map shows the same Layers panel (MAPX2c); the preview draws no data
     layer. A pin never
     changes the global town; only an explicit town choice does. -->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		MapContainer,
		MapDataLayer,
		MapTooltip,
		MapInspector,
		MapFeatureInspector
	} from '$lib/components/map';
	import type { RoadSpeeds } from '$lib/components/map/road-speeds';
	import { MAPBOX_TOKEN } from '$lib/config/api';
	import {
		pinClickOutcome,
		townClickOutcome,
		type InspectorState,
		type MapClickOutcome
	} from '$lib/components/map/map-inspection';
	import { TOWN_BY_SLUG } from '$lib/config';
	import { mapStore, selectedTown } from '$lib/stores/map';
	import { townFilter } from '$lib/stores/town-filter';
	import type { MapFeatureInspectorData, MapLayer } from '$lib/types';
	import { v2FeatureView, v2Inspector, type V2MapData } from '$lib/dashboard/v2-map-data';
	import { createV2Probe } from '$lib/dashboard/v2-probe';
	import SectionStatus from './SectionStatus.svelte';
	import MapProbe from './MapProbe.svelte';
	import MapGesturePolicy from './MapGesturePolicy.svelte';
	import V2MapNav from './V2MapNav.svelte';
	import InViewPanel from './InViewPanel.svelte';
	import InViewSync from './InViewSync.svelte';
	import {
		inView,
		inViewItems,
		selectionId,
		visibleBounds,
		type Bounds
	} from '$lib/dashboard/map-in-view';
	import { clickSelection, flyTarget, resolveSelection } from '$lib/dashboard/map-selection';
	import {
		DATA_LAYERS,
		layerFeatures,
		type DataLayerId,
		type DataLayerView
	} from '$lib/dashboard/v2-map-layers';
	import { LAYER_COLORS } from '$lib/config/map';
	import { sectionPrefs } from '$lib/stores/section-prefs';
	import type { LayerPrefId } from '$lib/dashboard/section-prefs';
	import LayerPanel, { type LayerRow } from './LayerPanel.svelte';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import { exploreHref, layersOn, selOutcome, type ExploreView } from '$lib/dashboard/explore-url';

	let {
		data,
		dataLayers,
		now,
		full = $bindable(false),
		mode = 'dashboard',
		prefs,
		onlayer = sectionPrefs.setLayer,
		initialView = null,
		initialSel = null,
		onselect,
		oncamera,
		onexit
	}: {
		data: V2MapData;
		/** The data layers (MAPX2b); absent, the map draws only news, 311 and quakes. */
		dataLayers?: Record<DataLayerId, DataLayerView>;
		now: number;
		/** Out: the whole map is showing (not the phone's preview), so its layers may load. */
		full?: boolean;
		/** 'explore' is /map (MAPX3): the whole screen, the Layers rail on desktop, no preview. */
		mode?: 'dashboard' | 'explore';
		/** The layer choices in force; the saved prefs unless /map's URL chose them. */
		prefs?: Partial<Record<LayerPrefId, boolean>>;
		onlayer?: (id: LayerPrefId, on: boolean) => void;
		/** /map's URL: the camera to open on and the item to open, each read once. */
		initialView?: ExploreView | null;
		initialSel?: string | null;
		/** Every selection change, and every settled camera, for /map's URL. */
		onselect?: (id: string | null) => void;
		oncamera?: (view: ExploreView) => void;
		/** Esc with no detail open (/map: back to the dashboard). */
		onexit?: () => void;
	} = $props();
	const explore = untrack(() => mode === 'explore');
	const layerPrefs = $derived(prefs ?? $sectionPrefs.layers);

	let phone = $state(false);
	let desktop = $state(false);
	let mounted = $state(false);
	$effect(() => {
		full = mounted && (explore || !phone);
	});
	const probe = createV2Probe(
		typeof location === 'undefined' ? '' : location.search,
		(typeof window === 'undefined' ? {} : window) as unknown as Record<string, unknown>
	);
	onMount(() => {
		const mq = window.matchMedia('(max-width: 767px)');
		phone = mq.matches;
		const follow = (e: MediaQueryListEvent) => (phone = e.matches);
		mq.addEventListener('change', follow);
		const wide = window.matchMedia('(min-width: 1024px)');
		desktop = wide.matches;
		const followWide = (e: MediaQueryListEvent) => (desktop = e.matches);
		wide.addEventListener('change', followWide);
		mounted = true;
		return () => {
			mq.removeEventListener('change', follow);
			wide.removeEventListener('change', followWide);
			probe.dispose();
		};
	});

	// A new revision per data change; the map echoes the revision it drew (onSynced).
	let revision = $state(0);
	$effect(() => {
		void data;
		void dataLayers;
		revision = untrack(() => revision) + 1;
	});
	const drawn = $derived(dataLayers ? DATA_LAYERS.map((l) => dataLayers[l.id]) : []);
	const layerData = $derived({
		...data.layerData,
		revision,
		...(drawn.length
			? {
					places: Object.fromEntries(drawn.map((v) => [v.id, layerFeatures(v)])) as Record<
						DataLayerId,
						GeoJSON.Feature[]
					>
				}
			: {})
	});
	$effect(() =>
		probe.set({
			loading: data.loading,
			layers: data.layers,
			dataRevision: revision,
			provenance: data.provenance
		})
	);

	let inspector = $state<InspectorState | null>(null);
	let feature = $state<MapFeatureInspectorData | null>(null);
	// Only the enabled, drawable layers; no zero claims without coverage (Codex 9b #2, #3).
	const visible = $derived(data.inspectable);
	const model = $derived(v2Inspector(inspector, data, (slug) => TOWN_BY_SLUG[slug]?.name ?? slug));
	// Re-read on every data change: the kept note follows the latest refresh (Codex 9b #4); a
	// data layer's pin stays open while its layer still draws it.
	const drawnPlaces = $derived(
		new Map(drawn.flatMap((v) => v.points.map((p) => [selectionId(v.id, p.id), p.detail] as const)))
	);
	const shownFeature = $derived(v2FeatureView(feature, data, drawnPlaces));

	// Desktop's in-view list (MAPX2): recomputed on a settled move and on every data, layer,
	// town or freshness change (all of which arrive as a new `data`).
	const fixIds = $derived(new Set(data.layerData.threeOneOne.map((i) => i.id)));
	const allItems = $derived(
		inViewItems({
			news: data.inspectable.filter((i) => !fixIds.has(i.id)),
			threeOneOne: data.inspectable.filter((i) => fixIds.has(i.id)),
			earthquakes: data.earthquakes,
			town: $townFilter,
			towns: TOWN_BY_SLUG,
			notes: data.notes,
			formatTime: (ms) => formatAsOf(ms, now),
			layers: drawn
		})
	);
	let view = $state<{ bounds: Bounds; width: number } | null>(null);
	let collapsed = $state(false);
	/** /map below desktop: the sheet's resting state (its detail is a dialog over it). */
	let sheet = $state<'peek' | 'half'>('peek');
	let canvasEl = $state<HTMLElement | null>(null);
	let selectedId = $state<string | null>(null);
	/** /map's linked selection, until its dataset settles (MAPX3). */
	let pendingSel = $state<string | null>(untrack(() => initialSel));
	let notice = $state<string | null>(null);
	let camera = $state<ExploreView | null>(null);
	let hoveredId = $state<string | null>(null);
	let flight = $state<[number, number] | null>(null);
	/** The panel's share of the map's right edge, measured, so nothing listed hides under it. */
	let panelPx = $state(0);
	$effect(() => {
		void view?.width;
		const panel = desktop && !collapsed ? canvasEl?.querySelector('[data-detail-panel]') : null;
		panelPx =
			panel && canvasEl
				? Math.max(0, canvasEl.getBoundingClientRect().right - panel.getBoundingClientRect().left)
				: 0;
	});
	const listed = $derived(
		view ? inView(allItems, visibleBounds(view.bounds, view.width, panelPx)) : []
	);
	const selected = $derived(resolveSelection(allItems, selectedId));
	const ring = $derived(flyTarget(allItems, hoveredId ?? selectedId ?? ''));
	function select(id: string, fly = true) {
		if (!resolveSelection(allItems, id)) return;
		selectedId = id;
		collapsed = false;
		notice = null;
		if (fly) flight = flyTarget(allItems, id);
		onselect?.(id);
	}
	function back() {
		selectedId = null;
		onselect?.(null);
	}
	// A linked selection opens once its own layer's read settles; it never errors. A URL view
	// beats the selection's flight (the link was copied where the reader left the camera).
	const stateOf = (layer: string) =>
		layer === 'news'
			? data.layers.news
			: layer === '311'
				? data.layers['311']
				: layer === 'quake'
					? data.layers.earthquakes
					: (dataLayers?.[layer as DataLayerId]?.state ?? 'unavailable');
	$effect(() => {
		const id = pendingSel;
		if (!id) return;
		const found = resolveSelection(allItems, id) !== null;
		const outcome = selOutcome(id, { state: stateOf(id.slice(0, id.indexOf(':'))), found });
		if (outcome.kind === 'pending') return;
		pendingSel = null;
		if (outcome.kind === 'found') return untrack(() => select(id, !initialView));
		notice = outcome.text;
		untrack(() => onselect?.(null));
	});
	/** The page's own query (`?probe`, `utm_*`), carried into /map. */
	const carried = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
	/** The dashboard map's way into /map: the same camera, layers and selection. */
	const exploreLink = $derived(
		exploreHref(
			{ view: camera, layers: layersOn(layerPrefs, $mapStore.activeLayers), sel: selectedId },
			carried
		)
	);
	function onkeydown(e: KeyboardEvent) {
		// The panel's Back takes Esc first while a detail shows (it marks the key handled).
		if (e.key !== 'Escape' || e.defaultPrevented || selectedId || !onexit) return;
		e.preventDefault();
		onexit();
	}

	// The layer panel (MAPX2b): every row says its source and time, or why it has none.
	const inViewCount = (layer: string) => listed.filter((i) => i.layer === layer).length;
	const statusOf = (
		source: string,
		kind: 'loading' | 'value' | 'unknown' | 'unavailable',
		asOf: number | null
	) =>
		kind === 'value'
			? `${source} · ${asOf === null ? 'time not reported' : `as of ${formatAsOf(asOf, now)}`}`
			: kind === 'loading'
				? `${source} · loading…`
				: `${source} unavailable`;
	const STORY_LAYERS = [
		['news', 'News'],
		['safety', 'Safety'],
		['civic', 'Civic'],
		['activity', 'Activity'],
		['housing', 'Housing'],
		['satire', 'Satire (Marin Lately)']
	] as const;
	const stories = $derived({
		count: data.layers.news === 'value' ? inViewCount('news') : null,
		status: statusOf('News snapshot', data.layers.news, data.asOf.news),
		rows: STORY_LAYERS.map(
			([id, name]): LayerRow => ({
				id,
				name,
				swatch: LAYER_COLORS[id],
				on: $mapStore.activeLayers[id],
				count: null,
				status: ''
			})
		)
	});
	// Road speeds (MAPX2c): Mapbox's congestion lines, with their tiles' own status. Lines, not
	// places: no count and no in-view rows. Without a token there is no layer and no row.
	const roadsOn = $derived(Boolean(MAPBOX_TOKEN) && (layerPrefs.roads ?? true));
	let roadSpeeds = $state<RoadSpeeds>({ state: 'loading', asOf: null, drawn: false });
	const roadsRow = $derived<LayerRow[]>(
		MAPBOX_TOKEN
			? [
					{
						id: 'roads',
						name: 'Road speeds',
						swatch: '#f97316',
						on: roadsOn,
						count: null,
						status: roadsOn ? statusOf('Mapbox', roadSpeeds.state, roadSpeeds.asOf) : 'Mapbox',
						note:
							roadsOn && roadSpeeds.state === 'unavailable'
								? 'Lines hidden: Mapbox tiles failed to load'
								: null
					}
				]
			: []
	);
	const layerRows = $derived<LayerRow[]>([
		{
			id: '311',
			name: 'Fix It Marin (311)',
			swatch: LAYER_COLORS['311'],
			on: $mapStore.activeLayers['311'],
			count:
				data.layers['311'] === 'value' && $mapStore.activeLayers['311'] ? inViewCount('311') : null,
			status: statusOf('Fix It Marin', data.layers['311'], data.asOf['311'])
		},
		{
			id: 'earthquakes',
			name: 'Earthquakes',
			swatch: '#facc15',
			on: null,
			count: data.layers.earthquakes === 'value' ? inViewCount('quake') : null,
			status: statusOf('USGS', data.layers.earthquakes, data.asOf.earthquakes)
		},
		...(dataLayers
			? DATA_LAYERS.flatMap((l): LayerRow[] => {
					const v = dataLayers[l.id];
					const row: LayerRow = {
						id: l.id,
						name: l.name,
						swatch: l.swatch,
						on: v.on,
						count: v.count === null ? null : inViewCount(l.id),
						status: statusOf(v.source, v.state, v.asOf),
						note: [v.kept, v.note].filter(Boolean).join(' · ') || null
					};
					// Road speeds sit with the 511 incidents: both are the roads.
					return l.id === 'traffic' ? [row, ...roadsRow] : [row];
				})
			: roadsRow)
	]);
	// "Nothing here" needs every enabled layer read fresh, with a count it can vouch for (Codex
	// MAPX2 #5); a layer that can't is named beside the list.
	const enabledData = $derived(drawn.filter((v) => v.on));
	const gaps = $derived(
		enabledData.filter((v) => v.state !== 'value' || v.kept !== null).map((v) => v.name)
	);
	const vouched = $derived(
		data.established && enabledData.every((v) => v.state === 'value' && !v.kept && v.count !== null)
	);
	function toggleLayer(id: string, on: boolean) {
		const story = id === '311' || STORY_LAYERS.some(([s]) => s === id);
		if (story && $mapStore.activeLayers[id as MapLayer] !== on)
			mapStore.toggleLayer(id as MapLayer);
		onlayer(id as LayerPrefId, on);
	}
	// Saved story choices apply once (the data layers read the prefs directly).
	let storiesRestored = false;
	$effect(() => {
		if (!mounted || storiesRestored) return;
		storiesRestored = true;
		const saved = untrack(() => layerPrefs);
		for (const [id] of [...STORY_LAYERS, ['311']] as const) {
			const want = saved[id];
			if (want !== undefined && untrack(() => $mapStore.activeLayers[id]) !== want)
				mapStore.toggleLayer(id);
		}
	});

	function apply(outcome: MapClickOutcome) {
		if (outcome.selectTown !== undefined) {
			mapStore.selectTown(outcome.selectTown);
			townFilter.select(outcome.selectTown);
		}
		if (desktop || explore) return;
		inspector = outcome.inspector;
		feature = null;
	}
	function onPinClick(itemId: string) {
		if (desktop || explore) return select(selectionId('news', itemId));
		const item = visible.find((candidate) => candidate.id === itemId);
		if (item) apply(pinClickOutcome(item));
	}
	function clearTown() {
		mapStore.selectTown(null);
		townFilter.clear();
	}
	/** "All of Marin": no town, nothing inspected; V2MapNav then flies to the county view. */
	function resetToMarin() {
		inspector = null;
		feature = null;
		clearTown();
	}
	function focusTown() {
		if (!model?.townSlug) return;
		mapStore.selectTown(model.townSlug);
		townFilter.select(model.townSlug);
	}
</script>

<svelte:window {onkeydown} />

{#snippet layerPanel(rail: boolean)}
	<LayerPanel {stories} layers={layerRows} ontoggle={toggleLayer} {rail}>
		{#snippet extra()}
			{#if desktop && !explore}
				<a class="v2-map-explore" href={exploreLink} data-text-role="label">Explore ↗</a>
			{/if}
		{/snippet}
	</LayerPanel>
{/snippet}

<div class="v2-map" data-mode={mode} data-rail={explore && desktop ? 'true' : undefined}>
	{#if explore && desktop}
		<div class="v2-map-rail">{@render layerPanel(true)}</div>
	{/if}
	<div class="v2-map-canvas" id="v2-map-canvas" data-text-role="control" bind:this={canvasEl}>
		<MapContainer {initialView}>
			<MapDataLayer
				earthquakes={data.earthquakes}
				alertPulses={false}
				airports={false}
				trafficEvents={false}
				{layerData}
				v2Paint={desktop}
				roadSpeeds={full && roadsOn}
				onRoadSpeeds={(s) => (roadSpeeds = s)}
				onSynced={(s) => probe.set({ synced: s })}
				onTownClick={(slug) => apply(townClickOutcome($selectedTown, slug))}
				onTownHover={(slug) => mapStore.hoverTown(slug)}
				{onPinClick}
				onFeatureClick={(f) => {
					if (desktop || explore) {
						const id = clickSelection(f);
						if (id) select(id);
						return;
					}
					// Kept 311/quake features say from when, like news pins (Codex r4 #2; shownFeature).
					feature = f;
					inspector = null;
				}}
			/>
			{#if !(explore && desktop)}
				{@render layerPanel(false)}
			{/if}
			<MapTooltip
				items={data.inspectable}
				emptyText={data.established ? 'No active stories for this town.' : null}
			/>
			{#if full}
				<!-- Every full map tracks its bounds, so the Layers counts are in-view counts. -->
				<InViewSync
					{panelPx}
					highlight={ring}
					flyTo={flight}
					refit={!initialView}
					onbounds={(bounds, width, cam) => {
						view = { bounds, width };
						camera = cam;
						oncamera?.(cam);
					}}
					onhover={(id) => (hoveredId = id)}
				/>
			{/if}
			{#if desktop || explore}
				<!-- The docked list (or /map's sheet) shows detail. -->
			{:else if model}
				<MapInspector
					mode={model.mode}
					townName={model.townName}
					townSlug={model.townSlug}
					items={model.items}
					selectedItemId={model.selectedItemId}
					showRelatedByDefault={model.mode === 'town'}
					pinnedCount={model.pinnedCount}
					townOnlyCount={model.townOnlyCount}
					filterActive={model.townSlug !== null && $selectedTown === model.townSlug}
					noteFor={(item) => data.notes.get(item.id) ?? null}
					onClose={() => (inspector = null)}
					onFocusTown={focusTown}
					onClearTown={clearTown}
				/>
			{:else if shownFeature}
				<MapFeatureInspector feature={shownFeature} onClose={() => (feature = null)} />
			{/if}
			<V2MapNav
				town={$townFilter}
				activeLayers={$mapStore.activeLayers}
				layers={data.layers}
				onReset={resetToMarin}
			/>
			<MapProbe />
			<MapGesturePolicy interactive={explore || !phone} />
		</MapContainer>
		{#if desktop || explore}
			<InViewPanel
				items={listed}
				{selected}
				hovered={hoveredId}
				{collapsed}
				emptyText={vouched ? 'Nothing on the map in this view.' : null}
				{gaps}
				{notice}
				sheet={explore && !desktop ? sheet : null}
				onsheet={(next) => (sheet = next)}
				ontoggle={() => (collapsed = !collapsed)}
				onselect={select}
				onhover={(id) => (hoveredId = id)}
				onback={back}
			/>
		{/if}
		<!-- Phone: over the preview's corner, so it costs no row of its own (§13.3 height). The
		     whole map is /map (MAPX3). -->
		{#if !explore}
			<a class="v2-map-expand" href={exploreLink} data-text-role="label">Expand map</a>
		{/if}
	</div>
	<div class="v2-map-status" data-slot="map-status">
		<SectionStatus status={data.coverage} {now} />
	</div>
</div>

<style>
	.v2-map-canvas {
		position: relative;
		height: 420px;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		overflow: hidden;
	}
	.v2-map-expand {
		display: none;
	}
	.v2-map-explore {
		display: inline-flex;
		align-items: center;
		min-height: 2.25rem;
		padding: 0 0.75rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text-primary);
		text-decoration: none;
	}
	.v2-map-explore:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (min-width: 1024px) {
		/* Full width (MAPX2): the map is the page's centre. */
		.v2-map-canvas {
			height: clamp(520px, 62vh, 820px);
		}
	}
	/* /map (MAPX3): the map fills the screen under the bar; on desktop the rail sits beside it. */
	.v2-map[data-mode='explore'] {
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		height: 100%;
	}
	.v2-map[data-mode='explore'][data-rail] {
		grid-template-columns: 300px minmax(0, 1fr);
	}
	.v2-map-rail {
		grid-row: 1 / span 2;
		min-height: 0;
	}
	.v2-map[data-mode='explore'] .v2-map-canvas {
		height: auto;
		min-height: 0;
		border-width: 0;
		border-radius: 0;
	}
	.v2-map[data-mode='explore'] .v2-map-status {
		padding: 0 0.75rem;
	}

	@media (max-width: 767px) {
		/* The preview: compact, controls hidden; the whole map is /map (§2.4, MAPX3). */
		.v2-map-canvas {
			height: 160px;
		}
		.v2-map[data-mode='dashboard'] .v2-map-canvas :global([data-layer-panel]),
		.v2-map[data-mode='dashboard'] .v2-map-canvas :global(.inspector),
		.v2-map[data-mode='dashboard'] .v2-map-canvas :global(.feature-inspector) {
			display: none;
		}
		/* The compact attribution opens wide on load: keep it on the row above the button, or
		   above /map's sheet. */
		.v2-map-canvas :global(.maplibregl-ctrl-bottom-right) {
			bottom: 3.25rem;
		}
		.v2-map-expand {
			/* Bottom-left: the attribution holds bottom-right, zoom top-right, layers top-left
			   (Codex 9c #2); above the inspectors, which are lifted clear of it below. */
			position: absolute;
			left: 0.5rem;
			bottom: 0.5rem;
			z-index: 31;
			display: inline-flex;
			align-items: center;
			min-height: 2.75rem;
			padding: 0 0.75rem;
			border: 1px solid var(--border-light);
			border-radius: 6px;
			background: var(--bg);
			color: var(--text-primary);
			text-decoration: none;
		}
	}
</style>
