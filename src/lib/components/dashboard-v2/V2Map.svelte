<!-- The v2 map (§2.4, Decision 3): owner-supplied layers only (news, 311, earthquakes), kept
     features dimmed and explained, a status line for every enabled layer's source, and a
     test hook under ?probe. Desktop (≥1024): a docked in-view list replaces the popups (MAPX2).
     Phone: a compact preview that expands on tap. A pin never changes the global town; only
     an explicit town choice does. -->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import {
		MapContainer,
		MapDataLayer,
		MapControls,
		MapTooltip,
		MapInspector,
		MapFeatureInspector
	} from '$lib/components/map';
	import { OWNED_MAP_LAYERS } from '$lib/components/map/map-layer-switches';
	import {
		pinClickOutcome,
		townClickOutcome,
		type InspectorState,
		type MapClickOutcome
	} from '$lib/components/map/map-inspection';
	import { TOWN_BY_SLUG } from '$lib/config';
	import { mapStore, selectedTown } from '$lib/stores/map';
	import { townFilter } from '$lib/stores/town-filter';
	import type { MapFeatureInspectorData } from '$lib/types';
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
	import { flyTarget, resolveSelection } from '$lib/dashboard/map-selection';
	import { formatAsOf } from '$lib/dashboard/pacific-time';

	let { data, now }: { data: V2MapData; now: number } = $props();

	let expanded = $state(false);
	let phone = $state(false);
	let desktop = $state(false);
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
		revision = untrack(() => revision) + 1;
	});
	const layerData = $derived({ ...data.layerData, revision });
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
	// Re-read on every data change: the kept note follows the latest refresh (Codex 9b #4).
	const shownFeature = $derived(v2FeatureView(feature, data));

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
			formatTime: (ms) => formatAsOf(ms, now)
		})
	);
	let view = $state<{ bounds: Bounds; width: number } | null>(null);
	let collapsed = $state(false);
	let canvasEl = $state<HTMLElement | null>(null);
	let selectedId = $state<string | null>(null);
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
	function select(id: string) {
		if (!resolveSelection(allItems, id)) return;
		selectedId = id;
		collapsed = false;
		flight = flyTarget(allItems, id);
	}

	function apply(outcome: MapClickOutcome) {
		if (outcome.selectTown !== undefined) {
			mapStore.selectTown(outcome.selectTown);
			townFilter.select(outcome.selectTown);
		}
		if (desktop) return;
		inspector = outcome.inspector;
		feature = null;
	}
	function onPinClick(itemId: string) {
		if (desktop) return select(selectionId('news', itemId));
		const item = visible.find((candidate) => candidate.id === itemId);
		if (item) apply(pinClickOutcome(item));
	}
	/** Collapsing closes any inspector: nothing in the preview may scroll (Codex 9c r2 #1). */
	function toggleExpanded() {
		expanded = !expanded;
		if (!expanded) {
			inspector = null;
			feature = null;
		}
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

<div class="v2-map" data-expanded={expanded ? 'true' : 'false'}>
	<div class="v2-map-canvas" id="v2-map-canvas" data-text-role="control" bind:this={canvasEl}>
		<MapContainer>
			<MapDataLayer
				earthquakes={data.earthquakes}
				alertPulses={false}
				airports={false}
				trafficEvents={false}
				{layerData}
				onSynced={(s) => probe.set({ synced: s })}
				onTownClick={(slug) => apply(townClickOutcome($selectedTown, slug))}
				onTownHover={(slug) => mapStore.hoverTown(slug)}
				{onPinClick}
				onFeatureClick={(f) => {
					if (desktop) {
						const layer =
							f.kind === '311-report' ? '311' : f.kind === 'earthquake' ? 'quake' : null;
						if (layer && f.itemId) select(selectionId(layer, f.itemId));
						return;
					}
					// Kept 311/quake features say from when, like news pins (Codex r4 #2; shownFeature).
					feature = f;
					inspector = null;
				}}
			/>
			<MapControls traffic={false} layers={OWNED_MAP_LAYERS} />
			<MapTooltip
				items={data.inspectable}
				emptyText={data.established ? 'No active stories for this town.' : null}
			/>
			{#if desktop}
				<InViewSync
					{panelPx}
					highlight={ring}
					flyTo={flight}
					onbounds={(bounds, width) => (view = { bounds, width })}
					onhover={(id) => (hoveredId = id)}
				/>
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
			<MapGesturePolicy interactive={expanded || !phone} />
		</MapContainer>
		{#if desktop}
			<InViewPanel
				items={listed}
				{selected}
				hovered={hoveredId}
				{collapsed}
				emptyText={data.established ? 'Nothing on the map in this view.' : null}
				ontoggle={() => (collapsed = !collapsed)}
				onselect={select}
				onhover={(id) => (hoveredId = id)}
				onback={() => (selectedId = null)}
			/>
		{/if}
		<!-- Phone: over the preview's corner, so it costs no row of its own (§13.3 height). -->
		<button
			type="button"
			class="v2-map-expand"
			aria-controls="v2-map-canvas"
			aria-expanded={expanded}
			data-text-role="label"
			onclick={toggleExpanded}>{expanded ? 'Collapse map' : 'Expand map'}</button
		>
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
	@media (min-width: 1024px) {
		/* Full width (MAPX2): the map is the page's centre. */
		.v2-map-canvas {
			height: clamp(520px, 62vh, 820px);
		}
	}

	@media (max-width: 767px) {
		/* The preview: compact, controls hidden until expanded (§2.4). */
		.v2-map-canvas {
			height: 160px;
		}
		.v2-map[data-expanded='true'] .v2-map-canvas {
			height: 70vh;
		}
		.v2-map[data-expanded='false'] .v2-map-canvas :global(.map-controls),
		.v2-map[data-expanded='false'] .v2-map-canvas :global(.inspector),
		.v2-map[data-expanded='false'] .v2-map-canvas :global(.feature-inspector) {
			display: none;
		}
		/* The compact attribution opens wide on load: keep it on the row above the button. */
		.v2-map-canvas :global(.maplibregl-ctrl-bottom-right) {
			bottom: 3.25rem;
		}
		.v2-map-canvas :global(.inspector) {
			bottom: 3.75rem;
			max-height: min(360px, calc(100% - 4.25rem));
		}
		.v2-map-canvas :global(.feature-inspector) {
			max-height: calc(100% - 7rem);
			overflow: auto;
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
			cursor: pointer;
		}
	}
</style>
