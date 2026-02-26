<script lang="ts">
	import { onMount } from 'svelte';
	import { Header, Dashboard } from '$lib/components/layout';
	import { SettingsModal, MonitorFormModal, OnboardingModal } from '$lib/components/modals';
	import {
		NewsPanel,
		CorrelationPanel,
		NarrativePanel,
		MonitorsPanel
	} from '$lib/components/panels';
	import {
		news,
		monitors,
		settings,
		refresh,
		allNewsItems
	} from '$lib/stores';
	import type { CustomMonitor } from '$lib/types';
	import type { PanelId } from '$lib/config';

	// Modal state
	let settingsOpen = $state(false);
	let monitorFormOpen = $state(false);
	let onboardingOpen = $state(false);
	let editingMonitor = $state<CustomMonitor | null>(null);

	// TODO: Wire up data fetching when adapters are built
	async function loadNews() {
		const categories = ['local', 'civic', 'safety', 'outdoors', 'housing', 'satire'] as const;
		categories.forEach((cat) => news.setLoading(cat, true));

		// TODO: Replace with actual Marin RSS adapter calls
		// For now, just clear loading state
		setTimeout(() => {
			categories.forEach((cat) => news.setLoading(cat, false));
		}, 500);
	}

	// Refresh handler
	async function handleRefresh() {
		refresh.startRefresh();
		try {
			await loadNews();
			refresh.endRefresh();
		} catch (error) {
			refresh.endRefresh([String(error)]);
		}
	}

	// Monitor handlers
	function handleCreateMonitor() {
		editingMonitor = null;
		monitorFormOpen = true;
	}

	function handleEditMonitor(monitor: CustomMonitor) {
		editingMonitor = monitor;
		monitorFormOpen = true;
	}

	function handleDeleteMonitor(id: string) {
		monitors.deleteMonitor(id);
	}

	function handleToggleMonitor(id: string) {
		monitors.toggleMonitor(id);
	}

	// Get panel visibility
	function isPanelVisible(id: PanelId): boolean {
		return $settings.enabled[id] !== false;
	}

	// Handle preset selection from onboarding
	function handleSelectPreset(presetId: string) {
		settings.applyPreset(presetId);
		onboardingOpen = false;
		handleRefresh();
	}

	// Show onboarding again (called from settings)
	function handleReconfigure() {
		settingsOpen = false;
		settings.resetOnboarding();
		onboardingOpen = true;
	}

	// Initial load
	onMount(() => {
		if (!settings.isOnboardingComplete()) {
			onboardingOpen = true;
		}

		async function initialLoad() {
			refresh.startRefresh();
			try {
				await loadNews();
				refresh.endRefresh();
			} catch (error) {
				refresh.endRefresh([String(error)]);
			}
		}
		initialLoad();
		refresh.setupAutoRefresh(handleRefresh);

		return () => {
			refresh.stopAutoRefresh();
		};
	});
</script>

<svelte:head>
	<title>Marin Monitor</title>
	<meta name="description" content="Local situational awareness for Marin County" />
</svelte:head>

<div class="app">
	<Header onSettingsClick={() => (settingsOpen = true)} />

	<main class="main-content">
		<Dashboard>
			<!-- Map Panel - Full width (TODO: Build MarinMapPanel) -->
			{#if isPanelVisible('map')}
				<div class="panel-slot map-slot">
					<div class="placeholder-panel">
						<h3>Marin Map</h3>
						<p>Map panel coming soon — D3 + county boundary + town markers</p>
					</div>
				</div>
			{/if}

			<!-- Pulse Panel (TODO: Build PulsePanel) -->
			{#if isPanelVisible('pulse')}
				<div class="panel-slot">
					<div class="placeholder-panel">
						<h3>Pulse</h3>
						<p>At-a-glance stats — stories, AQI, weather, tides</p>
					</div>
				</div>
			{/if}

			<!-- Local Wire -->
			{#if isPanelVisible('local-wire')}
				<div class="panel-slot">
					<NewsPanel category="local" panelId="local-wire" title="Local Wire" />
				</div>
			{/if}

			<!-- Safety -->
			{#if isPanelVisible('safety')}
				<div class="panel-slot">
					<NewsPanel category="safety" panelId="safety" title="Safety" />
				</div>
			{/if}

			<!-- Weather & Tides (TODO: Build WeatherPanel) -->
			{#if isPanelVisible('weather')}
				<div class="panel-slot">
					<div class="placeholder-panel">
						<h3>Weather & Tides</h3>
						<p>NWS forecast, AQI, NOAA tides</p>
					</div>
				</div>
			{/if}

			<!-- Civic -->
			{#if isPanelVisible('civic')}
				<div class="panel-slot">
					<NewsPanel category="civic" panelId="civic" title="Civic" />
				</div>
			{/if}

			<!-- Outdoors -->
			{#if isPanelVisible('outdoors')}
				<div class="panel-slot">
					<NewsPanel category="outdoors" panelId="outdoors" title="Outdoors" />
				</div>
			{/if}

			<!-- Housing (TODO: Build HousingPanel) -->
			{#if isPanelVisible('housing')}
				<div class="panel-slot">
					<div class="placeholder-panel">
						<h3>Housing</h3>
						<p>Recent transactions, market activity</p>
					</div>
				</div>
			{/if}

			<!-- Analysis Panels -->
			{#if isPanelVisible('correlation')}
				<div class="panel-slot">
					<CorrelationPanel news={$allNewsItems} />
				</div>
			{/if}

			{#if isPanelVisible('narrative')}
				<div class="panel-slot">
					<NarrativePanel news={$allNewsItems} />
				</div>
			{/if}

			<!-- Satire / The Vibes (TODO: Style with dashed border) -->
			{#if isPanelVisible('satire')}
				<div class="panel-slot vibes-slot">
					<NewsPanel category="satire" panelId="satire" title="The Vibes" />
				</div>
			{/if}

			<!-- Custom Monitors -->
			{#if isPanelVisible('monitors')}
				<div class="panel-slot">
					<MonitorsPanel
						monitors={$monitors.monitors}
						matches={$monitors.matches}
						onCreateMonitor={handleCreateMonitor}
						onEditMonitor={handleEditMonitor}
						onDeleteMonitor={handleDeleteMonitor}
						onToggleMonitor={handleToggleMonitor}
					/>
				</div>
			{/if}
		</Dashboard>
	</main>

	<!-- Modals -->
	<SettingsModal
		open={settingsOpen}
		onClose={() => (settingsOpen = false)}
		onReconfigure={handleReconfigure}
	/>
	<MonitorFormModal
		open={monitorFormOpen}
		onClose={() => (monitorFormOpen = false)}
		editMonitor={editingMonitor}
	/>
	<OnboardingModal open={onboardingOpen} onSelectPreset={handleSelectPreset} />
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
		padding: 0.5rem;
		overflow-y: auto;
	}

	.map-slot {
		column-span: all;
		margin-bottom: 0.5rem;
	}

	.vibes-slot :global(.panel) {
		border-style: dashed;
		border-color: #ec4899;
	}

	.placeholder-panel {
		background: var(--bg-secondary, #1a1a2e);
		border: 1px dashed var(--border, #333);
		border-radius: 8px;
		padding: 2rem;
		text-align: center;
		color: var(--text-secondary, #888);
	}

	.placeholder-panel h3 {
		margin: 0 0 0.5rem;
		color: var(--text-primary, #ccc);
		font-size: 0.85rem;
	}

	.placeholder-panel p {
		margin: 0;
		font-size: 0.7rem;
	}

	@media (max-width: 768px) {
		.main-content {
			padding: 0.25rem;
		}
	}
</style>
