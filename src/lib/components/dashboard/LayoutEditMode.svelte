<script lang="ts">
	import {
		WeatherPanel,
		TidesPanel,
		CamerasPanel,
		PulsePanel,
		OutlooksPanel,
		SignalsPanel,
		MapPanel,
		HousingPanel
	} from '$lib/components/panels';
	import { settings } from '$lib/stores';
	import type { NewsItem, WeatherData, FireWeatherAlert, EarthquakeData } from '$lib/types';
	import type { PanelId } from '$lib/config';
	import {
		type EditableTileId,
		type TileLayout,
		type TileDefinition,
		EDIT_LAYOUT_KEY,
		EDIT_GRID_COLUMNS,
		EDIT_GRID_ROWS,
		EDIT_ROW_HEIGHT,
		EDIT_GAP,
		DEFAULT_EDIT_LAYOUT
	} from '$lib/config/edit-grid';

	interface Props {
		weatherForecast: (WeatherData & { name: string })[];
		weatherAlerts: FireWeatherAlert[];
		weatherLoading: boolean;
		weatherError: string | null;
		userLocation: {
			lat: number;
			lon: number;
			name: string;
			tideStation?: string;
			tideStationName?: string;
		};
		earthquakeItems: NewsItem[];
		earthquakesRaw: EarthquakeData[];
		allNewsItems: NewsItem[];
	}

	let {
		weatherForecast,
		weatherAlerts,
		weatherLoading,
		weatherError,
		userLocation,
		earthquakeItems,
		earthquakesRaw,
		allNewsItems: allNewsItemsProp
	}: Props = $props();

	let editLayout = $state<Record<EditableTileId, TileLayout>>({ ...DEFAULT_EDIT_LAYOUT });
	let dragState = $state<{
		id: EditableTileId;
		mode: 'move' | 'resize';
		startX: number;
		startY: number;
		origin: TileLayout;
	} | null>(null);
	let editGridEl = $state<HTMLDivElement | null>(null);

	function isPanelVisible(id: PanelId): boolean {
		return $settings.enabled[id] !== false;
	}

	function cloneDefaultLayout(): Record<EditableTileId, TileLayout> {
		return Object.fromEntries(
			Object.entries(DEFAULT_EDIT_LAYOUT).map(([id, layout]) => [id, { ...layout }])
		) as Record<EditableTileId, TileLayout>;
	}

	function loadSavedEditLayout() {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(EDIT_LAYOUT_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as Partial<Record<EditableTileId, Partial<TileLayout>>>;
			editLayout = {
				...cloneDefaultLayout(),
				...Object.fromEntries(
					Object.entries(parsed).map(([id, layout]) => [
						id,
						{
							x: Number(layout?.x ?? DEFAULT_EDIT_LAYOUT[id as EditableTileId].x),
							y: Number(layout?.y ?? DEFAULT_EDIT_LAYOUT[id as EditableTileId].y),
							w: Number(layout?.w ?? DEFAULT_EDIT_LAYOUT[id as EditableTileId].w),
							h: Number(layout?.h ?? DEFAULT_EDIT_LAYOUT[id as EditableTileId].h)
						}
					])
				)
			};
		} catch (error) {
			console.warn('Failed to restore edit layout', error);
		}
	}

	function persistEditLayout() {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(EDIT_LAYOUT_KEY, JSON.stringify(editLayout));
	}

	function resetEditLayout() {
		editLayout = cloneDefaultLayout();
		persistEditLayout();
	}

	function clampTile(layout: TileLayout): TileLayout {
		const w = Math.max(2, Math.min(layout.w, EDIT_GRID_COLUMNS));
		const h = Math.max(2, Math.min(layout.h, EDIT_GRID_ROWS));
		const x = Math.max(1, Math.min(layout.x, EDIT_GRID_COLUMNS - w + 1));
		const y = Math.max(1, Math.min(layout.y, EDIT_GRID_ROWS - h + 1));
		return { x, y, w, h };
	}

	function updateTileLayout(id: EditableTileId, next: TileLayout) {
		editLayout = {
			...editLayout,
			[id]: clampTile(next)
		};
		persistEditLayout();
	}

	function beginDrag(event: PointerEvent, id: EditableTileId, mode: 'move' | 'resize') {
		event.preventDefault();
		event.stopPropagation();
		const origin = editLayout[id];
		dragState = {
			id,
			mode,
			startX: event.clientX,
			startY: event.clientY,
			origin: { ...origin }
		};
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function handleDragMove(event: PointerEvent) {
		if (!dragState || !editGridEl) return;
		const rect = editGridEl.getBoundingClientRect();
		const colWidth = (rect.width - EDIT_GAP * (EDIT_GRID_COLUMNS - 1)) / EDIT_GRID_COLUMNS;
		const rowHeight = EDIT_ROW_HEIGHT;
		const deltaCols = Math.round((event.clientX - dragState.startX) / (colWidth + EDIT_GAP));
		const deltaRows = Math.round((event.clientY - dragState.startY) / (rowHeight + EDIT_GAP));
		if (dragState.mode === 'move') {
			updateTileLayout(dragState.id, {
				...dragState.origin,
				x: dragState.origin.x + deltaCols,
				y: dragState.origin.y + deltaRows
			});
			return;
		}

		updateTileLayout(dragState.id, {
			...dragState.origin,
			w: dragState.origin.w + deltaCols,
			h: dragState.origin.h + deltaRows
		});
	}

	function endDrag() {
		dragState = null;
	}

	function tileStyle(id: EditableTileId): string {
		const layout = editLayout[id];
		return `grid-column:${layout.x} / span ${layout.w}; grid-row:${layout.y} / span ${layout.h};`;
	}

	const editableTiles = $derived.by<TileDefinition[]>(() => [
		{
			id: 'map',
			title: 'Map',
			visible: isPanelVisible('map')
		},
		{
			id: 'cameras',
			title: 'Cameras',
			visible: isPanelVisible('cameras')
		},
		{
			id: 'pulse',
			title: 'Pulse',
			visible: isPanelVisible('pulse')
		},
		{
			id: 'narrative',
			title: 'Signals',
			visible: isPanelVisible('narrative') || isPanelVisible('correlation')
		},
		{
			id: 'weather',
			title: 'Weather',
			visible: isPanelVisible('weather')
		},
		{
			id: 'tides',
			title: 'Tides',
			visible: isPanelVisible('weather')
		},
		{
			id: 'housing',
			title: 'Housing',
			visible: isPanelVisible('housing')
		},
		{
			id: 'forecast',
			title: 'Outlooks',
			visible: isPanelVisible('weather')
		},
		{
			id: 'pattern',
			title: 'Pattern',
			visible: false
		},
		{
			id: 'surf',
			title: 'Swell',
			visible: false
		},
		{
			id: 'marine',
			title: 'Swell Outlook',
			visible: false
		}
	]);

	// Load saved layout on mount
	loadSavedEditLayout();
</script>

<svelte:window onpointermove={handleDragMove} onpointerup={endDrag} onpointercancel={endDrag} />

<div class="layout-edit-toolbar">
	<div class="layout-edit-copy">
		<span class="layout-edit-title">Layout Edit Mode</span>
		<span class="layout-edit-note"
			>Drag headers. Resize from the lower-right corner. Saved locally.</span
		>
	</div>
	<button class="layout-reset" type="button" onclick={resetEditLayout}>Reset Layout</button>
</div>

<div class="layout-edit-grid" bind:this={editGridEl}>
	{#each editableTiles as tile (tile.id)}
		{#if tile.visible}
			<div class="layout-edit-tile" style={tileStyle(tile.id)}>
				<button
					class="layout-edit-handle"
					type="button"
					aria-label={`Move ${tile.title}`}
					onpointerdown={(event) => beginDrag(event, tile.id, 'move')}
				>
					<span>{tile.title}</span>
					<span class="layout-edit-size">
						{editLayout[tile.id].w}x{editLayout[tile.id].h}
					</span>
				</button>
				<div class="layout-edit-panel">
					{#if tile.id === 'map'}
						<MapPanel earthquakes={earthquakeItems} />
					{:else if tile.id === 'cameras'}
						<CamerasPanel />
					{:else if tile.id === 'pulse'}
						<PulsePanel forecast={weatherForecast} {weatherAlerts} earthquakes={earthquakesRaw} />
					{:else if tile.id === 'narrative'}
						<SignalsPanel news={allNewsItemsProp} />
					{:else if tile.id === 'weather'}
						<WeatherPanel
							forecast={weatherForecast}
							alerts={weatherAlerts}
							loading={weatherLoading}
							error={weatherError}
							locationLat={userLocation.lat}
							locationLon={userLocation.lon}
							locationName={userLocation.name}
						/>
					{:else if tile.id === 'tides'}
						<TidesPanel
							tideStation={userLocation.tideStation}
							tideStationName={userLocation.tideStationName}
							locationLat={userLocation.lat}
							locationLon={userLocation.lon}
						/>
					{:else if tile.id === 'housing'}
						<HousingPanel />
					{:else if tile.id === 'pattern'}
						<SignalsPanel news={allNewsItemsProp} />
					{:else if tile.id === 'forecast'}
						<OutlooksPanel
							forecast={weatherForecast}
							loading={weatherLoading}
							error={weatherError}
							locationLat={userLocation.lat}
							locationLon={userLocation.lon}
						/>
					{:else if tile.id === 'surf'}
						<TidesPanel
							tideStation={userLocation.tideStation}
							tideStationName={userLocation.tideStationName}
							locationLat={userLocation.lat}
							locationLon={userLocation.lon}
						/>
					{:else if tile.id === 'marine'}
						<OutlooksPanel
							forecast={weatherForecast}
							loading={weatherLoading}
							error={weatherError}
							locationLat={userLocation.lat}
							locationLon={userLocation.lon}
						/>
					{/if}
				</div>
				<button
					class="layout-resize"
					type="button"
					aria-label={`Resize ${tile.title}`}
					onpointerdown={(event) => beginDrag(event, tile.id, 'resize')}
				></button>
			</div>
		{/if}
	{/each}
</div>

<style>
	.layout-edit-toolbar {
		margin: 0 0 0.5rem;
		padding: 0.625rem 0.75rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.02);
	}

	.layout-edit-copy {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.layout-edit-title {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-primary);
	}

	.layout-edit-note {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.layout-reset {
		padding: 0.45rem 0.7rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-primary);
		font: inherit;
		cursor: pointer;
	}

	.layout-edit-grid {
		margin: 0 0 0.5rem;
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		grid-auto-rows: 72px;
		gap: 0.5rem;
		min-height: calc(18 * 72px + 17 * 0.5rem);
	}

	.layout-edit-tile {
		position: relative;
		min-width: 0;
		min-height: 0;
		border: 1px dashed rgba(255, 255, 255, 0.12);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
	}

	.layout-edit-panel {
		height: 100%;
		padding-top: 1.9rem;
	}

	.layout-edit-panel :global(.panel) {
		height: 100%;
	}

	.layout-edit-panel :global(.panel-content) {
		max-height: none;
	}

	.layout-edit-handle {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		width: 100%;
		z-index: 2;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0.5rem;
		border: 0;
		text-align: left;
		font: inherit;
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
		cursor: grab;
		background: rgba(0, 0, 0, 0.78);
		border-bottom: 1px dashed rgba(255, 255, 255, 0.12);
	}

	.layout-edit-size {
		color: var(--text-dim);
	}

	.layout-resize {
		position: absolute;
		right: 0.2rem;
		bottom: 0.2rem;
		z-index: 3;
		width: 1rem;
		height: 1rem;
		border: 0;
		background: transparent;
		cursor: nwse-resize;
	}

	.layout-resize::before {
		content: '';
		position: absolute;
		right: 0;
		bottom: 0;
		width: 0.8rem;
		height: 0.8rem;
		border-right: 2px solid rgba(255, 255, 255, 0.35);
		border-bottom: 2px solid rgba(255, 255, 255, 0.35);
	}

	@media (max-width: 1320px) {
		.layout-edit-grid {
			grid-template-columns: repeat(6, minmax(0, 1fr));
			grid-auto-rows: 76px;
		}
	}

	@media (max-width: 768px) {
		.layout-edit-toolbar {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
