<!-- The v2 map (§2.4, Decision 3): owner-supplied layers only (news, 311, earthquakes), kept
     features dimmed and explained, a status line for every enabled layer's source, and a
     test hook under ?probe. Phone: a compact preview that expands on tap. A pin never
     changes the global town; only an explicit town choice does. -->
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

	let { data, now }: { data: V2MapData; now: number } = $props();

	let expanded = $state(false);
	let phone = $state(false);
	const probe = createV2Probe(
		typeof location === 'undefined' ? '' : location.search,
		(typeof window === 'undefined' ? {} : window) as unknown as Record<string, unknown>
	);
	onMount(() => {
		const mq = window.matchMedia('(max-width: 767px)');
		phone = mq.matches;
		const follow = (e: MediaQueryListEvent) => (phone = e.matches);
		mq.addEventListener('change', follow);
		return () => {
			mq.removeEventListener('change', follow);
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
	$effect(() => probe.set({ loading: data.loading, layers: data.layers, dataRevision: revision }));

	let inspector = $state<InspectorState | null>(null);
	let feature = $state<MapFeatureInspectorData | null>(null);
	// Only the enabled, drawable layers; no zero claims without coverage (Codex 9b #2, #3).
	const visible = $derived(data.inspectable);
	const model = $derived(v2Inspector(inspector, data, (slug) => TOWN_BY_SLUG[slug]?.name ?? slug));
	// Re-read on every data change: the kept note follows the latest refresh (Codex 9b #4).
	const shownFeature = $derived(v2FeatureView(feature, data));

	function apply(outcome: MapClickOutcome) {
		if (outcome.selectTown !== undefined) {
			mapStore.selectTown(outcome.selectTown);
			townFilter.select(outcome.selectTown);
		}
		inspector = outcome.inspector;
		feature = null;
	}
	function onPinClick(itemId: string) {
		const item = visible.find((candidate) => candidate.id === itemId);
		if (item) apply(pinClickOutcome(item));
	}
	function clearTown() {
		mapStore.selectTown(null);
		townFilter.clear();
	}
	function focusTown() {
		if (!model?.townSlug) return;
		mapStore.selectTown(model.townSlug);
		townFilter.select(model.townSlug);
	}
</script>

<div class="v2-map" data-expanded={expanded ? 'true' : 'false'}>
	<div class="v2-map-canvas" id="v2-map-canvas" data-text-role="control">
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
			{#if model}
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
			<MapProbe />
			<MapGesturePolicy interactive={expanded || !phone} />
		</MapContainer>
		<!-- Phone: over the preview's corner, so it costs no row of its own (§13.3 height). -->
		<button
			type="button"
			class="v2-map-expand"
			aria-controls="v2-map-canvas"
			aria-expanded={expanded}
			data-text-role="label"
			onclick={() => (expanded = !expanded)}>{expanded ? 'Collapse map' : 'Expand map'}</button
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
	@media (max-width: 767px) {
		/* The preview: compact, controls hidden until expanded (§2.4). */
		.v2-map-canvas {
			height: 160px;
		}
		.v2-map[data-expanded='true'] .v2-map-canvas {
			height: 70vh;
		}
		.v2-map[data-expanded='false'] .v2-map-canvas :global(.map-controls) {
			display: none;
		}
		.v2-map-expand {
			position: absolute;
			right: 0.5rem;
			bottom: 0.5rem;
			z-index: 2;
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
