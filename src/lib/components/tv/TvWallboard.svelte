<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import TvScreen from './TvScreen.svelte';
  import TvChyron from './TvChyron.svelte';
  import MapConditionsScreen from './screens/MapConditionsScreen.svelte';
  import NewsWireScreen from './screens/NewsWireScreen.svelte';
  import SafetyScreen from './screens/SafetyScreen.svelte';
  import CameraWallScreen from './screens/CameraWallScreen.svelte';
  import EnvironmentScreen from './screens/EnvironmentScreen.svelte';
  import OutdoorsScreen from './screens/OutdoorsScreen.svelte';
  import {
    TV_SCREENS,
    CURSOR_HIDE_MS,
    TV_REFRESH_INTERVAL_MS
  } from '$lib/config/tv';
  import { news, refresh, allNewsItems, alerts } from '$lib/stores';
  import {
    fetchAllFeeds,
    fetchWeather,
    fetchNpsAlerts,
    fetchEarthquakes,
    earthquakesToNewsItems,
    fetchTransitAlerts,
    fetchSheriffCrimeBlotter,
    fetchSupplementalPoliceLogs,
    fetchSupplementalActivityFeeds,
    enrichItemsForRelevance
  } from '$lib/api/marin';
  import { fetchHourlyForecast } from '$lib/api/marin/nws-hourly';
  import type { HourlyPeriod } from '$lib/api/marin/nws-hourly';
  import { townLocation } from '$lib/stores/town-filter';
  import type {
    NewsCategory,
    NewsItem,
    WeatherData,
    FireWeatherAlert,
    EarthquakeData
  } from '$lib/types';

  // --- Carousel state ---
  let carouselIdx = $state(0);
  let paused = $state(false);
  let carouselTimer: ReturnType<typeof setTimeout> | null = null;

  function nextScreen() {
    carouselIdx = (carouselIdx + 1) % TV_SCREENS.length;
    scheduleNext();
  }

  function prevScreen() {
    carouselIdx = (carouselIdx - 1 + TV_SCREENS.length) % TV_SCREENS.length;
    scheduleNext();
  }

  function goToScreen(idx: number) {
    carouselIdx = idx;
    scheduleNext();
  }

  function togglePause() {
    paused = !paused;
    if (paused) {
      stopCarousel();
    } else {
      scheduleNext();
    }
  }

  /** Schedule the next screen advance based on current screen's duration */
  function scheduleNext() {
    stopCarousel();
    if (paused) return;
    const duration = TV_SCREENS[carouselIdx]?.durationMs ?? 20_000;
    carouselTimer = setTimeout(() => {
      carouselIdx = (carouselIdx + 1) % TV_SCREENS.length;
      scheduleNext();
    }, duration);
  }

  function startCarousel() {
    scheduleNext();
  }

  function stopCarousel() {
    if (carouselTimer) {
      clearTimeout(carouselTimer);
      carouselTimer = null;
    }
  }

  function restartCarousel() {
    if (!paused) scheduleNext();
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

  // --- Location (derived from town filter) ---
  const userLocation = $derived($townLocation);

  // --- Weather & earthquake data (passed to screens) ---
  let weatherForecast = $state<(WeatherData & { name: string })[]>([]);
  let weatherAlerts = $state<FireWeatherAlert[]>([]);
  let earthquakeItems = $state<NewsItem[]>([]);
  let hourlyPeriods = $state<HourlyPeriod[]>([]);

  // --- Pulse stats for header bar ---
  const stories24h = $derived(
    $allNewsItems.filter((item) => Date.now() - item.timestamp <= 24 * 60 * 60 * 1000).length
  );
  const alertCount = $derived($alerts.length);
  // Use the first hourly period (current hour) for actual current temp,
  // NOT weatherForecast[0] which is the daytime high
  const currentTemp = $derived(hourlyPeriods[0]?.temperature ?? null);

  const rssCategories: NewsCategory[] = [
    'local', 'civic', 'safety', 'outdoors', 'housing',
    'cycling', 'endurance', 'shows', 'prep', 'farm', 'satire'
  ];

  async function loadNews() {
    const settled = await Promise.allSettled([
      fetchAllFeeds(),
      fetchNpsAlerts(),
      fetchEarthquakes(),
      fetchTransitAlerts().then((r) => r.items),
      fetchSheriffCrimeBlotter(),
      fetchSupplementalPoliceLogs(),
      fetchSupplementalActivityFeeds()
    ]);
    const [rssResults, npsAlerts, earthquakes, transitAlerts, sheriffBlotter, policeLogs, supplementalActivity] =
      settled.map((r) => (r.status === 'fulfilled' ? r.value : [])) as [
        Awaited<ReturnType<typeof fetchAllFeeds>>,
        NewsItem[],
        EarthquakeData[],
        NewsItem[],
        NewsItem[],
        NewsItem[],
        NewsItem[]
      ];

    const earthquakeNews = earthquakesToNewsItems(earthquakes);
    earthquakeItems = earthquakeNews;

    const supplementalByCategory = new Map<NewsCategory, NewsItem[]>();
    for (const category of rssCategories) {
      supplementalByCategory.set(category, supplementalActivity.filter((item) => item.category === category));
    }

    await Promise.all(
      rssResults.map(async (result) => {
        const extraItems =
          result.category === 'safety'
            ? [...earthquakeNews, ...transitAlerts, ...sheriffBlotter, ...policeLogs, ...(supplementalByCategory.get(result.category) ?? [])]
            : result.category === 'outdoors'
              ? [...npsAlerts, ...(supplementalByCategory.get(result.category) ?? [])]
              : (supplementalByCategory.get(result.category) ?? []);

        const allItems = [...result.items, ...extraItems].sort((a, b) => b.timestamp - a.timestamp);
        const enrichedItems = await enrichItemsForRelevance(allItems);
        news.setItems(result.category, enrichedItems);
        if (enrichedItems.length > 0) {
          void news.enrichLocations(result.category);
        }
      })
    );
  }

  async function loadWeather() {
    try {
      const loc = userLocation;
      const [data, hourly] = await Promise.all([
        fetchWeather(loc.lat, loc.lon),
        fetchHourlyForecast(loc.lat, loc.lon).catch(() => [] as HourlyPeriod[])
      ]);
      weatherForecast = data.forecast;
      weatherAlerts = data.alerts;
      if (hourly.length > 0) hourlyPeriods = hourly;
    } catch {
      // Silent fail — keep last good data
    }
  }

  async function handleRefresh() {
    refresh.startRefresh();
    try {
      await Promise.all([loadNews(), loadWeather()]);
      refresh.endRefresh();
    } catch (error) {
      refresh.endRefresh([String(error)]);
    }
  }

  // --- Data refresh interval ---
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  // --- Force dark theme ---
  let originalTheme = '';

  onMount(() => {
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
  });

  onDestroy(() => {
    stopCarousel();
    if (clockTimer) clearInterval(clockTimer);
    if (cursorTimer) clearTimeout(cursorTimer);
    if (refreshTimer) clearInterval(refreshTimer);

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
    {#each TV_SCREENS as screen, i (screen.id)}
      <TvScreen active={carouselIdx === i}>
        {#if screen.id === 'map-conditions'}
          <MapConditionsScreen forecast={weatherForecast} {weatherAlerts} {earthquakeItems} active={carouselIdx === i} />
        {:else if screen.id === 'news-wire'}
          <NewsWireScreen />
        {:else if screen.id === 'safety'}
          <SafetyScreen />
        {:else if screen.id === 'cameras'}
          <CameraWallScreen />
        {:else if screen.id === 'environment'}
          <EnvironmentScreen />
        {:else if screen.id === 'outdoors'}
          <OutdoorsScreen />
        {/if}
      </TvScreen>
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
