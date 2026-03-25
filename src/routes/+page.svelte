<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Header, Footer } from '$lib/components/layout';
	import TownFilterBanner from '$lib/components/layout/TownFilterBanner.svelte';
	import { SettingsModal, OnboardingModal, FeedbackModal } from '$lib/components/modals';
	import {
		NewsPanel,
		WeatherPanel,
		TidesPanel,
		CamerasPanel,
		PulsePanel,
		OutlooksPanel,
		SignalsPanel,
		MapPanel,
		HousingPanel,
		GasPricesPanel,
		EvChargingPanel,
		EnvironmentPanel,
		CommunityPanel,
		ConditionsPanel,
		ExpandedCamerasPanel,
		WastewaterPanel,
		AirportStatusPanel
	} from '$lib/components/panels';
	import { settings, refresh, allNewsItems } from '$lib/stores';
	import { townLocation } from '$lib/stores/town-filter';
	import { AdBanner } from '$lib/components/common';
	import { pickAds } from '$lib/config/ads';
	import type {
		NewsItem,
		WeatherData,
		FireWeatherAlert,
		EarthquakeData
	} from '$lib/types';
	import type { PanelId } from '$lib/config';
	import { fetchWeather } from '$lib/api/marin';
	import { loadAllNews } from '$lib/api/marin/load-all';
	import { WIRE_COLUMNS } from '$lib/config/wire-columns';
	import {
		type EditableTileId, type TileLayout, type TileDefinition,
		EDIT_LAYOUT_KEY, EDIT_GRID_COLUMNS, EDIT_GRID_ROWS, EDIT_ROW_HEIGHT, EDIT_GAP,
		DEFAULT_EDIT_LAYOUT
	} from '$lib/config/edit-grid';
	import AgentationWidget from '$lib/components/dev/AgentationWidget.svelte';

	// Location (derived from town filter, falls back to settings.locationId)
	const userLocation = $derived($townLocation);

	// Banner ad between signal deck and news area
	const bannerAd = $derived(pickAds('banner', undefined, 1)[0]);

	// Modal state
	let settingsOpen = $state(false);
	let onboardingOpen = $state(false);
	let feedbackOpen = $state(false);
	let feedbackType = $state<'feed-request' | 'bug-report' | 'general'>('general');

	// Tip banner — shows once until dismissed
	const TIP_DISMISSED_KEY = 'mm_tip_banner_dismissed';
	let tipBannerVisible = $state(false);

	function openFeedback(type: 'feed-request' | 'bug-report' | 'general' = 'general') {
		feedbackType = type;
		feedbackOpen = true;
	}

	// Weather state
	let weatherForecast = $state<(WeatherData & { name: string })[]>([]);
	let weatherAlerts = $state<FireWeatherAlert[]>([]);
	let weatherLoading = $state(false);
	let weatherError = $state<string | null>(null);

	// Earthquake items for the map (separate from news store since they have lat/lon)
	let earthquakeItems = $state<NewsItem[]>([]);
	let earthquakesRaw = $state<EarthquakeData[]>([]);


	let editMode = $state(false);
	let editLayout = $state<Record<EditableTileId, TileLayout>>({ ...DEFAULT_EDIT_LAYOUT });
	let dragState = $state<{
		id: EditableTileId;
		mode: 'move' | 'resize';
		startX: number;
		startY: number;
		origin: TileLayout;
	} | null>(null);
	let editGridEl = $state<HTMLDivElement | null>(null);

	// Fetch all RSS feeds and API data, populate stores
	async function loadNews() {
		const result = await loadAllNews(true);
		earthquakeItems = result.earthquakeNews;
		earthquakesRaw = result.earthquakesRaw;
	}

	// Fetch weather data from NWS using the active location (town filter or settings default)
	async function loadWeather() {
		weatherLoading = true;
		weatherError = null;
		try {
			const loc = userLocation;
			const data = await fetchWeather(loc.lat, loc.lon);
			weatherForecast = data.forecast;
			weatherAlerts = data.alerts;
		} catch (error) {
			weatherError = (error as Error).message;
		} finally {
			weatherLoading = false;
		}
	}

	// Refresh handler
	async function handleRefresh() {
		refresh.startRefresh();
		try {
			await Promise.all([loadNews(), loadWeather()]);
			refresh.endRefresh();
		} catch (error) {
			refresh.endRefresh([String(error)]);
		}
	}

	// Get panel visibility
	function isPanelVisible(id: PanelId): boolean {
		return $settings.enabled[id] !== false;
	}

	// Handle preset selection from onboarding
	function handleSelectPreset(presetId: string) {
		settings.applyPreset(presetId);
		onboardingOpen = false;
		tipBannerVisible = false;
		localStorage.setItem(TIP_DISMISSED_KEY, 'true');
		handleRefresh();
	}

	// Show onboarding again (called from settings)
	function handleReconfigure() {
		settingsOpen = false;
		settings.resetOnboarding();
		onboardingOpen = true;
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
		if (!editMode || typeof localStorage === 'undefined') return;
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
		if (!editMode) return;
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

	// Initial load
	// Re-fetch weather when the active location changes (town filter or settings)
	let weatherDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let lastLocationId: string | null = null;
	$effect(() => {
		const locId = userLocation.id;
		if (lastLocationId === null) {
			// Skip first run (initial load handles it)
			lastLocationId = locId;
			return;
		}
		if (locId !== lastLocationId) {
			lastLocationId = locId;
			if (weatherDebounceTimer) clearTimeout(weatherDebounceTimer);
			weatherDebounceTimer = setTimeout(() => loadWeather(), 500);
		}
	});

	onMount(() => {
		editMode = new URLSearchParams(window.location.search).get('layout') === 'edit';
		if (editMode) {
			loadSavedEditLayout();
		}

		if (!settings.isOnboardingComplete()) {
			onboardingOpen = true;
		} else if (!localStorage.getItem(TIP_DISMISSED_KEY)) {
			tipBannerVisible = true;
		}

		async function initialLoad() {
			refresh.startRefresh();
			try {
				await Promise.all([loadNews(), loadWeather()]);
				refresh.endRefresh();
			} catch (error) {
				refresh.endRefresh([String(error)]);
			}
		}
		initialLoad();
		refresh.setupAutoRefresh(handleRefresh);

		// Refresh when tab becomes visible again after being stale (>5 min)
		function handleVisibilityChange() {
			if (document.visibilityState === 'visible') {
				const elapsed = refresh.getTimeSinceRefresh();
				if (elapsed === null || elapsed > 5 * 60 * 1000) {
					handleRefresh();
				}
			}
		}
		document.addEventListener('visibilitychange', handleVisibilityChange);

		function handleMainKeydown(e: KeyboardEvent) {
			// Don't trigger when typing in inputs
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

			if (e.key === 'm' || e.key === 'M') {
				goto('/tv');
			}
		}
		window.addEventListener('keydown', handleMainKeydown);

		return () => {
			refresh.stopAutoRefresh();
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('keydown', handleMainKeydown);
		};
	});
</script>

<svelte:head>
	<title>Marin Monitor</title>
	<meta
		name="description"
		content="Everything happening in Marin County — news, weather, tides, traffic, and the occasional coyote sighting."
	/>
	<meta property="og:title" content="Marin Monitor" />
	<meta
		property="og:description"
		content="Everything happening in Marin County — news, weather, tides, traffic, and the occasional coyote sighting."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://marinmonitor.com" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Marin Monitor" />
	<meta
		name="twitter:description"
		content="Everything happening in Marin County — news, weather, tides, traffic, and the occasional coyote sighting."
	/>
</svelte:head>

<div class="app">
	<Header onSettingsClick={() => (settingsOpen = true)} />

	<main class="main-content">
		<TownFilterBanner />

		{#if tipBannerVisible}
			<div class="tip-banner">
				<span class="tip-text"> New here? Customize which panels you see. </span>
				<button
					class="tip-action"
					onclick={() => {
						tipBannerVisible = false;
						localStorage.setItem(TIP_DISMISSED_KEY, 'true');
						settingsOpen = true;
					}}
				>
					Open Settings
				</button>
				<button
					class="tip-dismiss"
					onclick={() => {
						tipBannerVisible = false;
						localStorage.setItem(TIP_DISMISSED_KEY, 'true');
					}}
					aria-label="Dismiss"
				>
					&times;
				</button>
			</div>
		{/if}

		{#if editMode}
			<div class="layout-edit-toolbar">
				<div class="layout-edit-copy">
					<span class="layout-edit-title">Layout Edit Mode</span>
					<span class="layout-edit-note"
						>Drag headers. Resize from the lower-right corner. Saved locally.</span
					>
				</div>
				<button class="layout-reset" type="button" onclick={resetEditLayout}>Reset Layout</button>
			</div>

			<div
				class="layout-edit-grid"
				bind:this={editGridEl}
				onpointermove={handleDragMove}
				onpointerup={endDrag}
				onpointercancel={endDrag}
				onpointerleave={endDrag}
			>
				{#each editableTiles as tile (tile.id)}
					{#if tile.visible}
						<div class="layout-edit-tile" style={tileStyle(tile.id)}>
							<div
								class="layout-edit-handle"
								onpointerdown={(event) => beginDrag(event, tile.id, 'move')}
							>
								<span>{tile.title}</span>
								<span class="layout-edit-size">
									{editLayout[tile.id].w}x{editLayout[tile.id].h}
								</span>
							</div>
							<div class="layout-edit-panel">
								{#if tile.id === 'map'}
									<MapPanel earthquakes={earthquakeItems} />
								{:else if tile.id === 'cameras'}
									<CamerasPanel />
								{:else if tile.id === 'pulse'}
									<PulsePanel
										forecast={weatherForecast}
										{weatherAlerts}
										earthquakes={earthquakesRaw}
									/>
								{:else if tile.id === 'narrative'}
									<SignalsPanel news={$allNewsItems} />
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
									<SignalsPanel news={$allNewsItems} />
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
		{:else}
			<!-- Top stage: map + cameras -->
			<div
				class="top-stage"
				class:map-full-width={$settings.camerasExpanded ||
					$settings.camerasHidden ||
					!isPanelVisible('cameras')}
			>
				{#if isPanelVisible('map')}
					<div class="map-slot">
						<MapPanel earthquakes={earthquakeItems} />
					</div>
				{/if}

				{#if isPanelVisible('cameras') && !$settings.camerasExpanded && !$settings.camerasHidden}
					<div class="camera-stage">
						<CamerasPanel />
					</div>
				{/if}
			</div>

			{#if $settings.camerasExpanded && !$settings.camerasHidden && isPanelVisible('cameras')}
				<div class="expanded-cameras-stage">
					<ExpandedCamerasPanel />
				</div>
			{/if}

			<!-- Cameras show/hide toggle (only when cameras are hidden) -->
			{#if $settings.camerasHidden && isPanelVisible('cameras')}
				<button class="dash-toggle" onclick={() => settings.toggleCamerasHidden()}>
					<span class="dash-toggle-line"></span>
					<span class="dash-toggle-label">
						Show Cameras
						<span class="dash-toggle-chevron">{'\u25BE'}</span>
					</span>
					<span class="dash-toggle-line"></span>
				</button>
			{/if}

			<!-- Dashboard collapse toggle -->
			<button class="dash-toggle" onclick={() => settings.toggleDashboard()}>
				<span class="dash-toggle-line"></span>
				<span class="dash-toggle-label">
					{$settings.dashboardExpanded ? 'Hide' : 'Show'} Dashboard
					<span class="dash-toggle-chevron"
						>{$settings.dashboardExpanded ? '\u25B4' : '\u25BE'}</span
					>
				</span>
				<span class="dash-toggle-line"></span>
			</button>

			<!-- Signal deck -->
			<div class="signal-layout" class:collapsed={!$settings.dashboardExpanded}>
				<div class="signal-column signal-column-left">
					{#if isPanelVisible('pulse')}
						<div class="signal-card signal-pulse animate-enter-up stagger-1 hover-lift">
							<PulsePanel forecast={weatherForecast} {weatherAlerts} earthquakes={earthquakesRaw} />
						</div>
					{/if}

					{#if isPanelVisible('conditions')}
						<div class="signal-card signal-conditions animate-enter-up stagger-2 hover-lift">
							<ConditionsPanel />
						</div>
					{/if}

					{#if isPanelVisible('airport-status')}
						<div class="signal-card signal-airport-status animate-enter-up stagger-3 hover-lift">
							<AirportStatusPanel />
						</div>
					{/if}

					{#if isPanelVisible('wastewater')}
						<div class="signal-card signal-wastewater animate-enter-up stagger-3 hover-lift">
							<WastewaterPanel />
						</div>
					{/if}

					{#if isPanelVisible('narrative') || isPanelVisible('correlation')}
						<div class="signal-card signal-signals animate-enter-up stagger-4 hover-lift">
							<SignalsPanel news={$allNewsItems} />
						</div>
					{/if}
				</div>

				<div class="signal-column signal-column-middle">
					{#if isPanelVisible('weather')}
						<div class="signal-card signal-weather animate-enter-up stagger-1 hover-lift">
							<WeatherPanel
								forecast={weatherForecast}
								alerts={weatherAlerts}
								loading={weatherLoading}
								error={weatherError}
								locationLat={userLocation.lat}
								locationLon={userLocation.lon}
								locationName={userLocation.name}
							/>
						</div>
					{/if}

					{#if isPanelVisible('weather')}
						<div class="signal-card signal-outlooks animate-enter-up stagger-2 hover-lift">
							<OutlooksPanel
								forecast={weatherForecast}
								loading={weatherLoading}
								error={weatherError}
								locationLat={userLocation.lat}
								locationLon={userLocation.lon}
							/>
						</div>
					{/if}

					{#if isPanelVisible('weather')}
						<div class="signal-card signal-tides animate-enter-up stagger-3 hover-lift">
							<TidesPanel
								tideStation={userLocation.tideStation}
								tideStationName={userLocation.tideStationName}
								locationLat={userLocation.lat}
								locationLon={userLocation.lon}
							/>
						</div>
					{/if}

					{#if isPanelVisible('weather')}
						<div class="signal-card signal-environment animate-enter-up stagger-4 hover-lift">
							<EnvironmentPanel />
						</div>
					{/if}
				</div>

				<div class="signal-column signal-column-right">
					{#if isPanelVisible('housing')}
						<div class="signal-card signal-housing animate-enter-up stagger-2 hover-lift">
							<HousingPanel />
						</div>
					{/if}

					{#if isPanelVisible('gas-prices')}
						<div class="signal-card signal-gas-prices animate-enter-up stagger-3 hover-lift">
							<GasPricesPanel />
						</div>
					{/if}

					{#if isPanelVisible('ev-charging')}
						<div class="signal-card signal-ev-charging animate-enter-up stagger-4 hover-lift">
							<EvChargingPanel />
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if bannerAd}
			<div class="banner-slot">
				<AdBanner ad={bannerAd} />
			</div>
		{/if}

		<!-- News area -->
		<div class="news-area">
			<div class="wire-grid">
				{#each WIRE_COLUMNS as column (column.panelId)}
					{#if isPanelVisible(column.panelId)}
						<div class="wire-slot">
							<NewsPanel category={column.category} panelId={column.panelId} title={column.title} />
						</div>
					{/if}
				{/each}
				<div class="wire-slot">
					<CommunityPanel onFeedback={openFeedback} />
				</div>
			</div>
		</div>
	</main>

	<Footer onFeedback={() => openFeedback('general')} />

	<!-- Modals -->
	<SettingsModal
		open={settingsOpen}
		onClose={() => (settingsOpen = false)}
		onReconfigure={handleReconfigure}
	/>
	<OnboardingModal
		open={onboardingOpen}
		onSelectPreset={handleSelectPreset}
		onCustomize={() => {
			handleSelectPreset('everything');
			settingsOpen = true;
		}}
	/>
	<FeedbackModal
		open={feedbackOpen}
		onClose={() => (feedbackOpen = false)}
		initialType={feedbackType}
	/>
	<AgentationWidget />
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
	}

	.main-content {
		flex: 1;
		padding: 1.5rem;
		overflow-y: auto;
	}

	.tip-banner {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1.25rem;
		margin-bottom: 1.5rem;
		background: linear-gradient(90deg, rgba(14, 165, 233, 0.15), rgba(14, 165, 233, 0.05));
		border: 1px solid rgba(14, 165, 233, 0.4);
		border-left: 4px solid var(--accent);
		border-radius: 8px;
		animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
		box-shadow: 0 4px 12px rgba(14, 165, 233, 0.15);
	}

	.tip-text {
		flex: 1;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.tip-action {
		padding: 0.4rem 1rem;
		background: var(--accent);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		color: #000;
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
		box-shadow: 0 2px 8px rgba(14, 165, 233, 0.4);
	}

	.tip-action:hover {
		background: #38bdf8;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(14, 165, 233, 0.5);
	}

	.tip-dismiss {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 3px;
		color: var(--text-muted);
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.tip-dismiss:hover {
		color: var(--text-primary);
		border-color: var(--border-light);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.map-slot {
		min-width: 0;
	}

	.top-stage {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(300px, 1fr);
		gap: 1rem;
		margin-bottom: 1rem;
		align-items: start;
	}

	.top-stage.map-full-width {
		grid-template-columns: 1fr;
	}

	.expanded-cameras-stage {
		margin-bottom: 1rem;
	}

	.camera-stage :global(.panel-content) {
		max-height: 500px;
		overflow-y: auto;
	}

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
		z-index: 2;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0.5rem;
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

	.dash-toggle {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.25rem 0;
		margin-bottom: 0.4rem;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-muted);
		transition: color 0.15s;
	}

	.dash-toggle:hover {
		color: var(--text-secondary);
	}

	.dash-toggle-line {
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.dash-toggle-label {
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		white-space: nowrap;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.dash-toggle-chevron {
		font-size: 0.5rem;
	}

	.signal-layout {
		display: grid;
		grid-template-columns: minmax(240px, 2.4fr) minmax(0, 5.1fr) minmax(0, 4.9fr);
		gap: 1rem;
		margin-bottom: 1rem;
		align-items: stretch;
		transition:
			grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			opacity 0.3s ease;
	}

	.signal-layout.collapsed {
		display: none;
	}

	.signal-column {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}

	.signal-card {
		min-width: 0;
		width: 100%;
	}

	.signal-column > .signal-card:last-child {
		flex: 1;
	}

	.signal-weather :global(.panel-content),
	.signal-housing :global(.panel-content),
	.signal-gas-prices :global(.panel-content),
	.signal-ev-charging :global(.panel-content),
	.signal-tides :global(.panel-content),
	.signal-pulse :global(.panel-content),
	.signal-signals :global(.panel-content),
	.signal-outlooks :global(.panel-content),
	.signal-environment :global(.panel-content),
	.signal-conditions :global(.panel-content),
	.signal-wastewater :global(.panel-content),
	.signal-airport-status :global(.panel-content) {
		max-height: none;
		overflow-y: visible;
	}

	.signal-column > .signal-card:last-child :global(.panel) {
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.signal-column > .signal-card:last-child :global(.panel-content) {
		flex: 1;
	}

	.signal-pulse :global(.panel) {
		min-height: 195px;
	}

	.signal-signals :global(.panel) {
		min-height: 620px;
	}

	.signal-weather :global(.panel),
	.signal-housing :global(.panel) {
		min-height: 520px;
	}

	.signal-tides :global(.panel) {
		min-height: 600px;
	}

	.signal-outlooks :global(.panel) {
		min-height: 310px;
	}

	.banner-slot {
		margin-top: 1rem;
		padding: 0 0.5rem;
	}

	.news-area {
		margin-top: 1rem;
	}

	.wire-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	.wire-slot {
		min-width: 0;
	}

	@media (max-width: 1320px) {
		.layout-edit-grid {
			grid-template-columns: repeat(6, minmax(0, 1fr));
			grid-auto-rows: 76px;
		}

		.signal-layout {
			grid-template-columns: 1fr;
		}

		.signal-column {
			display: contents;
		}

		.top-stage {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 1080px) {
		.wire-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 820px) {
		.wire-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 620px) {
		.wire-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 768px) {
		.main-content {
			padding: 0.25rem;
		}

		.layout-edit-toolbar {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
