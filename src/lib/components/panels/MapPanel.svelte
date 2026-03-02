<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import {
		MapContainer,
		MapDataLayer,
		MapControls,
		MapTooltip,
		MapInspector,
		MapFeatureInspector
	} from '$lib/components/map';
	import { mapStore, selectedTown, activeLayers, CATEGORY_TO_LAYER } from '$lib/stores/map';
	import { allNewsItems } from '$lib/stores/news';
	import { TOWN_BY_SLUG } from '$lib/config';
	import { fetchFireIncidents } from '$lib/api/marin';
	import type { FireIncident } from '$lib/api/marin/calfire';
	import type { NewsItem } from '$lib/types';

	interface Props {
		earthquakes?: NewsItem[];
	}

	let { earthquakes = [] }: Props = $props();

	let fireIncidents = $state<FireIncident[]>([]);

	onMount(async () => {
		try {
			fireIncidents = await fetchFireIncidents();
		} catch {
			// Silent fail — fire overlay is additive
		}
	});

	type InspectorState =
		| {
				mode: 'town';
				townSlug: string;
		  }
		| {
				mode: 'pin';
				itemId: string;
				townSlug: string | null;
		  };

	let inspectorState = $state<InspectorState | null>(null);
	let featureInspector = $state<{
		kind: 'landmark' | 'fire-zone' | 'traffic-event' | 'earthquake' | 'fire-incident' | 'gas-station';
		title: string;
		subtitle?: string;
		description?: string;
		severity?: string;
		source?: string;
	} | null>(null);

	// Count items without location
	const noLocationCount = $derived($allNewsItems.filter((i) => !i.townSlug).length);
	const mapVisibleItems = $derived.by(() => {
		const layers = $activeLayers;
		return $allNewsItems
			.filter((item) => {
				const layer = CATEGORY_TO_LAYER[item.category];
				return Boolean(layer && layers[layer]);
			})
			.sort((a, b) => b.timestamp - a.timestamp);
	});

	const inspectorModel = $derived.by(() => {
		const state = inspectorState;
		if (!state) return null;

		if (state.mode === 'town') {
			const items = mapVisibleItems.filter((item) => item.townSlug === state.townSlug);
			const pinnedCount = items.filter(
				(item) => typeof item.lat === 'number' && typeof item.lon === 'number'
			).length;
			return {
				mode: 'town' as const,
				townSlug: state.townSlug,
				townName: TOWN_BY_SLUG[state.townSlug]?.name || state.townSlug,
				items,
				selectedItemId: null,
				pinnedCount,
				townOnlyCount: Math.max(0, items.length - pinnedCount)
			};
		}

		const selected = mapVisibleItems.find((item) => item.id === state.itemId);
		if (!selected) return null;

		const townSlug = selected.townSlug ?? state.townSlug ?? null;
		const related = townSlug
			? mapVisibleItems.filter((item) => item.townSlug === townSlug && item.id !== selected.id)
			: [];
		const items = [selected, ...related];
		const pinnedCount = items.filter(
			(item) => typeof item.lat === 'number' && typeof item.lon === 'number'
		).length;
		return {
			mode: 'pin' as const,
			townSlug,
			townName: townSlug ? TOWN_BY_SLUG[townSlug]?.name || townSlug : (selected.town ?? null),
			items,
			selectedItemId: selected.id,
			pinnedCount,
			townOnlyCount: Math.max(0, items.length - pinnedCount)
		};
	});

	function handleTownClick(slug: string) {
		const current = $selectedTown;
		// Toggle: click same town again to deselect
		const next = current === slug ? null : slug;
		mapStore.selectTown(next);
		inspectorState = next ? { mode: 'town', townSlug: next } : null;
		featureInspector = null;
	}

	function handleTownHover(slug: string | null) {
		mapStore.hoverTown(slug);
	}

	function handlePinClick(itemId: string) {
		const item = mapVisibleItems.find((candidate) => candidate.id === itemId);
		if (!item) return;
		if (item.townSlug) {
			mapStore.selectTown(item.townSlug);
		}
		inspectorState = {
			mode: 'pin',
			itemId: item.id,
			townSlug: item.townSlug ?? null
		};
		featureInspector = null;
	}

	function handleFeatureClick(feature: {
		kind: 'landmark' | 'fire-zone' | 'traffic-event' | 'earthquake' | 'fire-incident' | 'gas-station';
		title: string;
		subtitle?: string;
		description?: string;
		severity?: string;
		source?: string;
	}) {
		featureInspector = feature;
		inspectorState = null;
	}

	function closeInspector() {
		inspectorState = null;
	}

	function closeFeatureInspector() {
		featureInspector = null;
	}

	function clearTownFilter() {
		mapStore.selectTown(null);
	}

	function focusInspectorTown() {
		if (!inspectorModel?.townSlug) return;
		mapStore.selectTown(inspectorModel.townSlug);
	}

	const selectedTownName = $derived(
		$selectedTown ? TOWN_BY_SLUG[$selectedTown]?.name || $selectedTown : null
	);
</script>

<Panel id="map" title="Marin Map" draggable={false}>
	{#snippet actions()}
		{#if $selectedTown}
			<button class="clear-filter" onclick={() => mapStore.selectTown(null)}>
				{selectedTownName} &times;
			</button>
		{/if}
		{#if noLocationCount > 0}
			<span class="no-location-badge">{noLocationCount} unlocated</span>
		{/if}
	{/snippet}

	<div class="map-panel-body">
		<MapContainer>
			<MapDataLayer
				{earthquakes}
				{fireIncidents}
				onTownClick={handleTownClick}
				onTownHover={handleTownHover}
				onPinClick={handlePinClick}
				onFeatureClick={handleFeatureClick}
			/>
			<MapControls />
			<MapTooltip />
			{#if inspectorModel}
				<MapInspector
					mode={inspectorModel.mode}
					townName={inspectorModel.townName}
					townSlug={inspectorModel.townSlug}
					items={inspectorModel.items}
					selectedItemId={inspectorModel.selectedItemId}
					showRelatedByDefault={inspectorModel.mode === 'town'}
					pinnedCount={inspectorModel.pinnedCount}
					townOnlyCount={inspectorModel.townOnlyCount}
					filterActive={inspectorModel.townSlug !== null &&
						$selectedTown === inspectorModel.townSlug}
					onClose={closeInspector}
					onFocusTown={focusInspectorTown}
					onClearTown={clearTownFilter}
				/>
			{:else if featureInspector}
				<MapFeatureInspector feature={featureInspector} onClose={closeFeatureInspector} />
			{/if}
		</MapContainer>
	</div>
</Panel>

<style>
	.map-panel-body {
		height: 500px;
		position: relative;
		margin: -0.5rem;
	}

	.clear-filter {
		font-family: inherit;
		font-size: 0.6rem;
		padding: 0.1rem 0.4rem;
		background: rgba(139, 92, 246, 0.2);
		border: 1px solid rgba(139, 92, 246, 0.4);
		border-radius: 3px;
		color: #c4b5fd;
		cursor: pointer;
	}

	.clear-filter:hover {
		background: rgba(139, 92, 246, 0.3);
	}

	.no-location-badge {
		font-size: 0.55rem;
		color: var(--text-muted);
		padding: 0.1rem 0.3rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 3px;
	}
</style>
