<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import TvScreen from './TvScreen.svelte';
  import TvChyron from './TvChyron.svelte';
  import TvWallboardHeader from './TvWallboardHeader.svelte';
  import TvMapScreen from './screens/TvMapScreen.svelte';
  import NewsWireScreen from './screens/NewsWireScreen.svelte';
  import SafetyScreen from './screens/SafetyScreen.svelte';
  import TvCameraClusterScreen from './screens/TvCameraClusterScreen.svelte';
  import TvConditionsScreen from './screens/TvConditionsScreen.svelte';
  import TvCommunityScreen from './screens/TvCommunityScreen.svelte';
  import TvLeaderboardsScreen from './screens/TvLeaderboardsScreen.svelte';
  import { loadStravaData } from '$lib/stores/strava';
  import {
    TV_SCREENS,
    TV_MAP_VIEWS,
    CURSOR_HIDE_MS,
    TV_REFRESH_INTERVAL_MS
  } from '$lib/config/tv';
  import { refresh, allNewsItems, alerts, mapStore, settings } from '$lib/stores';
  import { townFilter } from '$lib/stores/town-filter';
  import { fetchFireIncidents } from '$lib/api/marin';
  import { loadAllNews } from '$lib/api/marin/load-all';
  import { fetchHourlyForecast } from '$lib/api/marin/nws-hourly';
  import type { NewsItem } from '$lib/types';

  // --- Carousel state ---
  // Uses a single setInterval that ticks every second and checks elapsed time.
  // This is more robust than recursive setTimeout which can get lost if
  // component lifecycle events (MapContainer destroy/create) cause errors.
  let carouselIdx = $state(0);
  let paused = $state(false);
  let carouselTimer: ReturnType<typeof setInterval> | null = null;
  let screenStartedAt = Date.now();
  let screenElapsedMs = $state(0);

  const activeScreen = $derived(TV_SCREENS[carouselIdx] ?? TV_SCREENS[0]);
  const screenProgress = $derived(
    activeScreen.durationMs > 0
      ? Math.min(screenElapsedMs / activeScreen.durationMs, 1)
      : 0
  );
  const screenTimeLeftSeconds = $derived(
    Math.max(0, Math.ceil((activeScreen.durationMs - screenElapsedMs) / 1000))
  );

  function syncScreenElapsed() {
    const duration = activeScreen.durationMs ?? 20_000;
    screenElapsedMs = Math.min(Date.now() - screenStartedAt, duration);
  }

  function setScreen(index: number) {
    carouselIdx = (index + TV_SCREENS.length) % TV_SCREENS.length;
    screenStartedAt = Date.now();
    screenElapsedMs = 0;
  }

  function advanceCarousel() {
    if (paused || document.hidden) return;

    const duration = activeScreen.durationMs ?? 20_000;
    const elapsed = Date.now() - screenStartedAt;
    screenElapsedMs = Math.min(elapsed, duration);

    if (elapsed >= duration) {
      setScreen(carouselIdx + 1);
    }
  }

  function nextScreen() {
    setScreen(carouselIdx + 1);
  }

  function prevScreen() {
    setScreen(carouselIdx - 1);
  }

  function goToScreen(idx: number) {
    setScreen(idx);
  }

  function togglePause() {
    if (paused) {
      paused = false;
      screenStartedAt = Date.now() - screenElapsedMs;
      startCarousel();
      return;
    }

    syncScreenElapsed();
    paused = true;
    stopCarousel();
  }

  function startCarousel() {
    if (paused || document.hidden) return;
    stopCarousel();
    carouselTimer = setInterval(advanceCarousel, 1000);
  }

  function stopCarousel() {
    if (carouselTimer) {
      clearInterval(carouselTimer);
      carouselTimer = null;
    }
  }

  function restartCarousel() {
    screenStartedAt = Date.now();
    screenElapsedMs = 0;
  }

  // --- Clock ---
  let clockText = $state('');
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  function updateClock() {
    const now = new Date();
    clockText = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      + '  ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  // --- Cursor auto-hide ---
  let cursorHidden = $state(false);
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;

  function resetCursorTimer() {
    cursorHidden = false;
    if (cursorTimer) clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => { cursorHidden = true; }, CURSOR_HIDE_MS);
  }

  // --- Keyboard shortcuts ---
  function handleKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowRight':
        nextScreen();
        restartCarousel();
        break;
      case 'ArrowLeft':
        prevScreen();
        restartCarousel();
        break;
      case ' ':
        e.preventDefault();
        togglePause();
        break;
      case 'r':
      case 'R':
        handleRefresh();
        break;
      case 'Escape':
      case 'm':
      case 'M':
        goto('/');
        break;
      case 'f':
      case 'F':
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
        break;
    }
  }

  // --- Visibility change (re-sync on tab focus) ---
  function handleVisibilityChange() {
    if (document.hidden) {
      syncScreenElapsed();
      stopCarousel();
    } else if (!paused) {
      screenStartedAt = Date.now() - screenElapsedMs;
      startCarousel();
    }
  }


  // --- Shared data for map screens ---
  let earthquakeItems = $state<NewsItem[]>([]);
  let fireIncidents = $state<import('$lib/api/marin/calfire').FireIncident[]>([]);
  let hourlyPeriods = $state<{ temperature: number }[]>([]);

  // Pre-fetched weather cache for all map regions
  let regionWeather = $state<Record<string, { temp: number; wind: string; shortForecast: string }>>({});

  // --- Pulse stats for header bar ---
  const stories24h = $derived(
    $allNewsItems.filter((item) => Date.now() - item.timestamp <= 24 * 60 * 60 * 1000).length
  );
  const alertCount = $derived($alerts.length);

  // Derived: current map viewId (for the persistent map instance)
  const activeMapViewId = $derived(TV_SCREENS[carouselIdx]?.mapViewId ?? 'county');
  const isMapScreenActive = $derived(!!TV_SCREENS[carouselIdx]?.mapViewId);
  const isConditionsScreenActive = $derived(TV_SCREENS[carouselIdx]?.id === 'conditions');
  const isLeaderboardsScreenActive = $derived(TV_SCREENS[carouselIdx]?.id === 'leaderboards');
  // Use the first hourly period (current hour) for actual current temp,
  // NOT weatherForecast[0] which is the daytime high
  const currentTemp = $derived(hourlyPeriods[0]?.temperature ?? null);

  async function loadNews() {
    const result = await loadAllNews();
    earthquakeItems = result.earthquakeNews;
  }

  let lastRegionWeatherFetch = 0;
  const REGION_WEATHER_TTL = 15 * 60 * 1000; // 15 minutes for map region weather

  async function loadWeather() {
    try {
      // Fetch hourly for header temp display (every refresh cycle)
      const hourly = await fetchHourlyForecast().catch(() => []);
      if (hourly.length > 0) hourlyPeriods = hourly;
    } catch {
      // Silent fail
    }

    // Pre-fetch weather for all map regions — only every 15 minutes
    if (Date.now() - lastRegionWeatherFetch < REGION_WEATHER_TTL && Object.keys(regionWeather).length > 0) {
      return;
    }

    const results = await Promise.allSettled(
      TV_MAP_VIEWS.map(async (view) => {
        const h = await fetchHourlyForecast(view.center[1], view.center[0]);
        if (h.length > 0) {
          return { id: view.id, data: { temp: h[0].temperature, wind: `${h[0].windSpeed}`, shortForecast: h[0].shortForecast ?? '' } };
        }
        return null;
      })
    );
    const newWeather: Record<string, { temp: number; wind: string; shortForecast: string }> = { ...regionWeather };
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        newWeather[r.value.id] = r.value.data;
      }
    }
    regionWeather = newWeather;
    // Only suppress retries if ALL views succeeded — partial failures should retry next cycle
    const allSucceeded = results.every((r) => r.status === 'fulfilled' && r.value !== null);
    if (allSucceeded) {
      lastRegionWeatherFetch = Date.now();
    }
  }

  async function loadFireIncidents() {
    try {
      fireIncidents = await fetchFireIncidents();
    } catch {
      // Silent fail
    }
  }

  let refreshInFlight = false;
  async function handleRefresh() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    refresh.startRefresh();
    try {
      await Promise.all([loadNews(), loadWeather(), loadFireIncidents(), loadStravaData()]);
      refresh.endRefresh();
    } catch (error) {
      refresh.endRefresh([String(error)]);
    } finally {
      refreshInFlight = false;
    }
  }

  // --- Data refresh interval ---
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  // --- Periodic page reload to reclaim memory (WebGL, tile cache, JS heap) ---
  const PAGE_RELOAD_MS = 6 * 60 * 60 * 1000; // 6 hours
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Force dark theme ---
  let originalThemeAttribute: string | null = null;
  let originalSettingsTheme: 'dark' | 'light' = 'dark';

  function restoreOriginalTheme() {
    if (originalThemeAttribute === null) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', originalThemeAttribute);
    }
    settings.setTheme(originalSettingsTheme);
  }

  onMount(() => {
    // Reset shared state so TV mode starts county-wide, not town-scoped
    townFilter.clear();
    mapStore.selectTown(null);

    // Force dark theme — both data-theme attribute AND settings store
    // (MapContainer reads settings.theme for basemap style)
    originalThemeAttribute = document.documentElement.getAttribute('data-theme');
    originalSettingsTheme = get(settings).theme;
    document.documentElement.setAttribute('data-theme', 'dark');
    settings.setTheme('dark');

    // Start carousel
    startCarousel();

    // Start clock
    updateClock();
    clockTimer = setInterval(updateClock, 1000);

    // Cursor auto-hide
    resetCursorTimer();
    window.addEventListener('pointermove', resetCursorTimer);
    window.addEventListener('pointerdown', resetCursorTimer);

    // Keyboard shortcuts
    window.addEventListener('keydown', handleKeydown);

    // Visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial data load
    handleRefresh();
    advanceCarousel();

    // Recurring data refresh
    refreshTimer = setInterval(handleRefresh, TV_REFRESH_INTERVAL_MS);

    // Periodic full page reload to reclaim accumulated memory (standard for TV dashboards)
    reloadTimer = setTimeout(() => location.reload(), PAGE_RELOAD_MS);
  });

  onDestroy(() => {
    stopCarousel();
    if (clockTimer) clearInterval(clockTimer);
    if (cursorTimer) clearTimeout(cursorTimer);
    if (refreshTimer) clearInterval(refreshTimer);
    if (reloadTimer) clearTimeout(reloadTimer);

    if (browser) {
      window.removeEventListener('pointermove', resetCursorTimer);
      window.removeEventListener('pointerdown', resetCursorTimer);
      window.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Restore original theme (both data-theme and settings store)
      restoreOriginalTheme();
    }
  });
</script>

<div
  class="fixed inset-0 grid min-h-[100dvh] grid-rows-[auto,minmax(0,1fr),auto] overflow-hidden bg-gray-950 text-gray-100 select-none"
  class:cursor-none={cursorHidden}
>
  <TvWallboardHeader
    {carouselIdx}
    {paused}
    {currentTemp}
    {stories24h}
    {alertCount}
    {clockText}
    activeScreenName={activeScreen.name}
    activeScreenDescription={activeScreen.description}
    screenProgress={screenProgress}
    screenTimeLeftSeconds={screenTimeLeftSeconds}
    onGoToScreen={goToScreen}
  />

  <!-- Carousel area -->
  <div class="relative min-h-0 overflow-hidden">
    <!-- Persistent map — single MapContainer, never destroyed. Hidden when non-map screen active. -->
    <div
      class="absolute inset-0 transition-opacity duration-300"
      aria-hidden={!isMapScreenActive}
      style="z-index: {isMapScreenActive ? 1 : 0}; visibility: {isMapScreenActive ? 'visible' : 'hidden'}; pointer-events: {isMapScreenActive ? 'auto' : 'none'};"
    >
      <TvMapScreen {earthquakeItems} {fireIncidents} viewId={activeMapViewId} weather={regionWeather[activeMapViewId] ?? null} />
    </div>

    <!-- Persistent conditions — panels fetch on mount, so keep alive to avoid refetching every carousel pass -->
    <div
      class="absolute inset-0 transition-opacity duration-300"
      aria-hidden={!isConditionsScreenActive}
      style="z-index: {isConditionsScreenActive ? 1 : 0}; visibility: {isConditionsScreenActive ? 'visible' : 'hidden'}; pointer-events: {isConditionsScreenActive ? 'auto' : 'none'};"
    >
      <TvConditionsScreen />
    </div>

    <!-- Persistent leaderboards — avoids reloading segment tables on every carousel loop -->
    <div
      class="absolute inset-0 transition-opacity duration-300"
      aria-hidden={!isLeaderboardsScreenActive}
      style="z-index: {isLeaderboardsScreenActive ? 1 : 0}; visibility: {isLeaderboardsScreenActive ? 'visible' : 'hidden'}; pointer-events: {isLeaderboardsScreenActive ? 'auto' : 'none'};"
    >
      <TvLeaderboardsScreen />
    </div>

    <!-- Other non-map screens — destroyed/created normally -->
    {#each TV_SCREENS as screen, i (screen.id)}
      {#if !screen.mapViewId && screen.id !== 'conditions' && screen.id !== 'leaderboards'}
        <TvScreen active={carouselIdx === i}>
          {#if screen.id === 'news-wire'}
            <NewsWireScreen />
          {:else if screen.id === 'safety'}
            <SafetyScreen />
          {:else if screen.id === 'cameras-tam-coast'}
            <TvCameraClusterScreen clusterId="tam-coast" />
          {:else if screen.id === 'cameras-central-highway'}
            <TvCameraClusterScreen clusterId="central-highway" />
          {:else if screen.id === 'cameras-west-north'}
            <TvCameraClusterScreen clusterId="west-north" />
          {:else if screen.id === 'community'}
            <TvCommunityScreen />
          {/if}
        </TvScreen>
      {/if}
    {/each}
  </div>

  <!-- Chyron -->
  <TvChyron />
</div>

<style>
  .cursor-none {
    cursor: none;
  }
</style>
