<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import TvScreen from './TvScreen.svelte';
  import TvChyron from './TvChyron.svelte';
  import TvMapScreen from './screens/TvMapScreen.svelte';
  import NewsWireScreen from './screens/NewsWireScreen.svelte';
  import SafetyScreen from './screens/SafetyScreen.svelte';
  import TvCameraClusterScreen from './screens/TvCameraClusterScreen.svelte';
  import TvConditionsScreen from './screens/TvConditionsScreen.svelte';
  import TvCommunityScreen from './screens/TvCommunityScreen.svelte';
  import {
    TV_SCREENS,
    TV_MAP_VIEWS,
    CURSOR_HIDE_MS,
    TV_REFRESH_INTERVAL_MS
  } from '$lib/config/tv';
  import { refresh, allNewsItems, alerts, mapStore } from '$lib/stores';
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

  function advanceCarousel() {
    if (paused) return;
    const duration = TV_SCREENS[carouselIdx]?.durationMs ?? 20_000;
    if (Date.now() - screenStartedAt >= duration) {
      carouselIdx = (carouselIdx + 1) % TV_SCREENS.length;
      screenStartedAt = Date.now();
    }
  }

  function nextScreen() {
    carouselIdx = (carouselIdx + 1) % TV_SCREENS.length;
    screenStartedAt = Date.now();
  }

  function prevScreen() {
    carouselIdx = (carouselIdx - 1 + TV_SCREENS.length) % TV_SCREENS.length;
    screenStartedAt = Date.now();
  }

  function goToScreen(idx: number) {
    carouselIdx = idx;
    screenStartedAt = Date.now();
  }

  function togglePause() {
    paused = !paused;
    if (!paused) screenStartedAt = Date.now();
  }

  function startCarousel() {
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
      stopCarousel();
    } else if (!paused) {
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
    lastRegionWeatherFetch = Date.now();
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
      await Promise.all([loadNews(), loadWeather(), loadFireIncidents()]);
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
  let originalTheme = '';

  onMount(() => {
    // Reset shared state so TV mode starts county-wide, not town-scoped
    townFilter.clear();
    mapStore.selectTown(null);

    // Force dark theme (project uses data-theme attribute)
    originalTheme = document.documentElement.getAttribute('data-theme') ?? '';
    document.documentElement.setAttribute('data-theme', 'dark');

    // Start carousel
    startCarousel();

    // Start clock
    updateClock();
    clockTimer = setInterval(updateClock, 1000);

    // Cursor auto-hide
    resetCursorTimer();
    window.addEventListener('mousemove', resetCursorTimer);

    // Keyboard shortcuts
    window.addEventListener('keydown', handleKeydown);

    // Visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial data load
    handleRefresh();

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
      window.removeEventListener('mousemove', resetCursorTimer);
      window.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Restore original theme
      document.documentElement.setAttribute('data-theme', originalTheme || 'dark');
    }
  });
</script>

<div
  class="fixed inset-0 bg-gray-950 text-gray-100 flex flex-col overflow-hidden select-none"
  class:cursor-none={cursorHidden}
>
  <!-- Header: title + clock + dots -->
  <header class="h-12 flex items-center justify-between px-4 bg-gray-900/80 border-b border-gray-800/50 shrink-0 z-10">
    <div class="flex items-center gap-3">
      <h1 class="text-lg font-bold tracking-wide text-gray-100">MARIN MONITOR</h1>
      {#if paused}
        <span class="text-xs text-amber-400 font-medium">PAUSED</span>
      {/if}
    </div>
    <div class="flex items-center gap-3">
      {#if currentTemp !== null}
        <span class="text-xs text-gray-500">Now</span>
        <span class="text-sm text-gray-300 font-medium">{currentTemp}&deg;F</span>
      {/if}
      <span class="text-xs text-gray-500">{stories24h} stories</span>
      {#if alertCount > 0}
        <span class="text-xs text-red-400 font-medium">{alertCount} alerts</span>
      {/if}
    </div>
    <div class="flex items-center gap-4">
      <span class="text-sm text-gray-300 tabular-nums">{clockText}</span>
      <div class="flex items-center gap-1.5">
        {#each TV_SCREENS as screen, i (screen.id)}
          <button
            class="w-2.5 h-2.5 rounded-full transition-colors"
            class:bg-blue-400={carouselIdx === i}
            class:bg-gray-600={carouselIdx !== i}
            onclick={() => goToScreen(i)}
            title={screen.name}
          ></button>
        {/each}
      </div>
    </div>
  </header>

  <!-- Carousel area -->
  <div class="flex-1 relative" style="height: calc(100vh - 48px - 44px);">
    <!-- Persistent map — single MapContainer, never destroyed. Hidden when non-map screen active. -->
    <div class="absolute inset-0" style="z-index: {isMapScreenActive ? 1 : 0}; visibility: {isMapScreenActive ? 'visible' : 'hidden'};">
      <TvMapScreen {earthquakeItems} {fireIncidents} viewId={activeMapViewId} weather={regionWeather[activeMapViewId] ?? null} />
    </div>

    <!-- Persistent conditions — panels fetch on mount, so keep alive to avoid refetching every carousel pass -->
    <div class="absolute inset-0" style="z-index: {isConditionsScreenActive ? 1 : 0}; visibility: {isConditionsScreenActive ? 'visible' : 'hidden'};">
      <TvConditionsScreen />
    </div>

    <!-- Other non-map screens — destroyed/created normally -->
    {#each TV_SCREENS as screen, i (screen.id)}
      {#if !screen.mapViewId && screen.id !== 'conditions'}
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
