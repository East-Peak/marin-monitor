<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Header, Footer } from '$lib/components/layout';
	import TownFilterBanner from '$lib/components/layout/TownFilterBanner.svelte';
	import { SettingsModal, OnboardingModal, FeedbackModal } from '$lib/components/modals';
	import { settings, refresh, allNewsItems } from '$lib/stores';
	import { townLocation } from '$lib/stores/town-filter';
	import { AdBanner } from '$lib/components/common';
	import { pickAds } from '$lib/config/ads';
	import { loadStravaData } from '$lib/stores/strava';
	import type {
		NewsItem,
		WeatherData,
		FireWeatherAlert,
		EarthquakeData
	} from '$lib/types';
	import type { PanelId } from '$lib/config';
	import { fetchWeather } from '$lib/api/marin';
	import { loadAllNews } from '$lib/api/marin/load-all';
	import { earthquakesToNewsItems } from '$lib/api/marin';
	import AgentationWidget from '$lib/components/dev/AgentationWidget.svelte';
	import WireGrid from '$lib/components/dashboard/WireGrid.svelte';
	import MapStage from '$lib/components/dashboard/MapStage.svelte';
	import SignalDeck from '$lib/components/dashboard/SignalDeck.svelte';
	import LayoutEditMode from '$lib/components/dashboard/LayoutEditMode.svelte';

	// Server bootstrap data (weather + earthquakes pre-fetched server-side)
	let { data } = $props();

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

	// Weather state — hydrate from server bootstrap if available
	let weatherForecast = $state<(WeatherData & { name: string })[]>(data?.bootstrap?.weather?.forecast ?? []);
	let weatherAlerts = $state<FireWeatherAlert[]>(data?.bootstrap?.weather?.alerts ?? []);
	let weatherLoading = $state(!data?.bootstrap?.weather);
	let weatherError = $state<string | null>(null);

	// Earthquake items — hydrate from server bootstrap if available
	let earthquakeItems = $state<NewsItem[]>(
		data?.bootstrap?.earthquakes?.length ? earthquakesToNewsItems(data.bootstrap.earthquakes) : []
	);
	let earthquakesRaw = $state<EarthquakeData[]>(data?.bootstrap?.earthquakes ?? []);


	let editMode = $state(false);

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
			await Promise.all([loadNews(), loadWeather(), loadStravaData()]);
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

		if (!settings.isOnboardingComplete()) {
			onboardingOpen = true;
		} else if (!localStorage.getItem(TIP_DISMISSED_KEY)) {
			tipBannerVisible = true;
		}

		async function initialLoad() {
			refresh.startRefresh();
			try {
				// News always loads client-side (uses DOMParser for RSS)
				// Weather: skip if already hydrated from server bootstrap
				const fetches: Promise<void>[] = [loadNews(), loadStravaData()];
				if (!data?.bootstrap?.weather) {
					fetches.push(loadWeather());
				}
				await Promise.all(fetches);
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
			<LayoutEditMode
				{weatherForecast}
				{weatherAlerts}
				{weatherLoading}
				{weatherError}
				{userLocation}
				{earthquakeItems}
				{earthquakesRaw}
				allNewsItems={$allNewsItems}
			/>
		{:else}
			<MapStage {earthquakeItems} {isPanelVisible} />

			<SignalDeck {weatherForecast} {weatherAlerts} {weatherLoading} {weatherError} {userLocation} {earthquakesRaw} {isPanelVisible} />
		{/if}

		{#if bannerAd}
			<div class="banner-slot">
				<AdBanner ad={bannerAd} />
			</div>
		{/if}

		<!-- News area -->
		<WireGrid onFeedback={openFeedback} />
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


	@media (max-width: 1320px) {
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


	@media (max-width: 768px) {
		.main-content {
			padding: 0.25rem;
		}
	}
</style>
