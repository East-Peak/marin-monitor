<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import TvScreen from './TvScreen.svelte';
  import TvChyron from './TvChyron.svelte';
  import TvWallboardHeader from './TvWallboardHeader.svelte';
  import TvMapScreen from './screens/TvMapScreen.svelte';
  import NewsWireScreen from './screens/NewsWireScreen.svelte';
  import SafetyScreen from './screens/SafetyScreen.svelte';
  import TvCameraClusterScreen from './screens/TvCameraClusterScreen.svelte';
  import TvCommunityScreen from './screens/TvCommunityScreen.svelte';
  import TvLeaderboardsScreen from './screens/TvLeaderboardsScreen.svelte';
  import TvCompositeHero from './screens/TvCompositeHero.svelte';
  import TvDailyLifeCard from './screens/TvDailyLifeCard.svelte';
  import TvLifestyleCard from './screens/TvLifestyleCard.svelte';
  import TvStructuralCard from './screens/TvStructuralCard.svelte';
  import TvDrivewayCard from './screens/TvDrivewayCard.svelte';
  import Tv311PhotoWall from './screens/Tv311PhotoWall.svelte';
  import TvConditionsCard from './screens/TvConditionsCard.svelte';
  import TvOutdoorsCard from './screens/TvOutdoorsCard.svelte';
  import { loadStravaData } from '$lib/stores/strava';
  import {
    TV_SCREENS,
    TV_MAP_VIEWS,
    CURSOR_HIDE_MS,
    TV_REFRESH_INTERVAL_MS
  } from '$lib/config/tv';
  import { refresh, allNewsItems, alerts, mapStore, settings, threeOneOneNews } from '$lib/stores';
  import { townFilter } from '$lib/stores/town-filter';
  import { fetchFireIncidents, fetchAirQuality, fetchStreamGauges, fetchObservedWeather } from '$lib/api/marin';
  import { fetchTidePredictions } from '$lib/api/marin/tides';
  import { loadAllNews } from '$lib/api/marin/load-all';
  import { fetchHourlyForecast } from '$lib/api/marin/nws-hourly';
  import { fetchCompositeData } from '$lib/api/marin/composite';
  import { fetchCappuccinoData } from '$lib/api/marin/cappuccino';
  import { fetchGroceryBasketData } from '$lib/api/marin/grocery-basket';
  import { fetchWineIndexData } from '$lib/api/marin/wine-index';
  import { fetchFitnessData } from '$lib/api/marin/fitness';
  import { fetchSchoolTuitionData } from '$lib/api/marin/school-tuition';
  import { fetchDrivewayData } from '$lib/api/marin/driveway';
  import { fetchGasPriceData } from '$lib/api/marin/gas-prices';
  import { computeHeroDirt } from '$lib/analysis/indicators';
  import { tvIndexData } from '$lib/stores/tv';
  import type { NewsItem, AirQualityData, TidePrediction } from '$lib/types';
  import type { CompositeData } from '$lib/types/composite';
  import type { CoffeeData } from '$lib/types/coffee';
  import type { GroceryBasketData } from '$lib/types/grocery';
  import type { WineIndexData } from '$lib/types/wine';
  import type { FitnessData } from '$lib/types/fitness';
  import type { SchoolIndexData } from '$lib/types/school';
  import type { DrivewayData } from '$lib/types/driveway';
  import type { GasPriceData } from '$lib/types/gas';
  import type { StreamGauge } from '$lib/api/marin/streams';
  import type { HeroDirtScore } from '$lib/analysis/indicators';

  // --- Index data state ---
  let compositeData = $state<CompositeData | null>(null);
  let cappuccinoData = $state<CoffeeData | null>(null);
  let groceryData = $state<GroceryBasketData | null>(null);
  let wineData = $state<WineIndexData | null>(null);
  let fitnessData = $state<FitnessData | null>(null);
  let tuitionData = $state<SchoolIndexData | null>(null);
  let drivewayData = $state<DrivewayData | null>(null);
  let gasData = $state<GasPriceData | null>(null);

  // --- Conditions & outdoors data state ---
  let aqiData = $state<AirQualityData | null>(null);
  let tidePredictions = $state<TidePrediction[]>([]);
  let streamGauges = $state<StreamGauge[]>([]);
  let heroDirt = $state<HeroDirtScore | null>(null);

  // 311 items from the store (for 311 photo wall and map overlay)
  const threeOneOneItems = $derived($threeOneOneNews.items ?? []);

  // --- Carousel state ---
  // Uses a single setInterval that ticks every second and checks elapsed time.
  // This is more robust than recursive setTimeout which can get lost if
  // component lifecycle events (MapContainer destroy/create) cause errors.
  let carouselIdx = $state(0);
  let paused = $state(false);
  let carouselTimer: ReturnType<typeof setInterval> | null = null;
  let screenStartedAt = Date.now();

  /** Check if a screen should be skipped (e.g., 311-photos with no photos) */
  function shouldSkipScreen(idx: number): boolean {
    const screen = TV_SCREENS[idx];
    if (screen.id === '311-photos') {
      const photoItems = threeOneOneItems.filter(i => i.imageUrl);
      return photoItems.length === 0;
    }
    return false;
  }

  /** Find the next valid screen index, skipping screens with no content */
  function nextValidIdx(fromIdx: number, direction: 1 | -1 = 1): number {
    let nextIdx = (fromIdx + direction + TV_SCREENS.length) % TV_SCREENS.length;
    let attempts = 0;
    while (shouldSkipScreen(nextIdx) && attempts < TV_SCREENS.length) {
      nextIdx = (nextIdx + direction + TV_SCREENS.length) % TV_SCREENS.length;
      attempts++;
    }
    return nextIdx;
  }

  function advanceCarousel() {
    if (paused) return;
    const duration = TV_SCREENS[carouselIdx]?.durationMs ?? 20_000;
    if (Date.now() - screenStartedAt >= duration) {
      carouselIdx = nextValidIdx(carouselIdx, 1);
      screenStartedAt = Date.now();
    }
  }

  function nextScreen() {
    carouselIdx = nextValidIdx(carouselIdx, 1);
    screenStartedAt = Date.now();
  }

  function prevScreen() {
    carouselIdx = nextValidIdx(carouselIdx, -1);
    screenStartedAt = Date.now();
  }

  function goToScreen(idx: number) {
    let targetIdx = idx;
    if (shouldSkipScreen(targetIdx)) {
      targetIdx = nextValidIdx(targetIdx);
    }
    carouselIdx = targetIdx;
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
  let hourlyPeriods = $state<import('$lib/api/marin/nws-hourly').HourlyPeriod[]>([]);

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

  async function loadIndexData(): Promise<void> {
    const [composite, cappuccino, grocery, wine, fitness, tuition, driveway, gas] =
      await Promise.all([
        fetchCompositeData().catch(() => null),
        fetchCappuccinoData().catch(() => null),
        fetchGroceryBasketData().catch(() => null),
        fetchWineIndexData().catch(() => null),
        fetchFitnessData().catch(() => null),
        fetchSchoolTuitionData().catch(() => null),
        fetchDrivewayData().catch(() => null),
        fetchGasPriceData().catch(() => null)
      ]);

    compositeData = composite;
    cappuccinoData = cappuccino;
    groceryData = grocery;
    wineData = wine;
    fitnessData = fitness;
    tuitionData = tuition;
    drivewayData = driveway;
    gasData = gas;

    // Update ticker store with index data for chyron
    tvIndexData.set({ composite, cappuccino, grocery, wine, fitness, tuition, driveway, gas });

    // Conditions & outdoors data (separate batch to avoid blocking index cards)
    const [aqiResult, tidesResult, streamsResult, observedResult] = await Promise.all([
      fetchAirQuality().catch(() => null),
      fetchTidePredictions().catch(() => []),
      fetchStreamGauges().catch(() => []),
      fetchObservedWeather(37.97, -122.53).catch(() => null)
    ]);

    aqiData = aqiResult;
    tidePredictions = tidesResult ?? [];
    streamGauges = streamsResult ?? [];

    // Compute Hero Dirt if we have observed weather + hourly forecast
    if (observedResult && hourlyPeriods.length > 0) {
      try {
        heroDirt = computeHeroDirt(observedResult, hourlyPeriods);
      } catch { heroDirt = null; }
    } else {
      heroDirt = null;
    }
  }

  let refreshInFlight = false;
  async function handleRefresh() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    refresh.startRefresh();
    try {
      await Promise.all([loadNews(), loadWeather(), loadFireIncidents(), loadStravaData(), loadIndexData()]);
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
  let originalSettingsTheme: 'dark' | 'light' = 'dark';

  onMount(() => {
    // Reset shared state so TV mode starts county-wide, not town-scoped
    townFilter.clear();
    mapStore.selectTown(null);

    // Reset map layers to prevent dashboard layer bleed
    mapStore.clearAllLayers();

    // Force dark theme — both data-theme attribute AND settings store
    // (MapContainer reads settings.theme for basemap style)
    originalTheme = document.documentElement.getAttribute('data-theme') ?? '';
    originalSettingsTheme = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
    document.documentElement.setAttribute('data-theme', 'dark');
    settings.setTheme('dark');

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

      // Restore original theme (both data-theme and settings store)
      document.documentElement.setAttribute('data-theme', originalTheme || 'dark');
      settings.setTheme(originalSettingsTheme);
    }
  });
</script>

<div
  class="fixed inset-0 bg-gray-950 text-gray-100 flex flex-col overflow-hidden select-none"
  class:cursor-none={cursorHidden}
>
  <TvWallboardHeader {carouselIdx} {paused} {currentTemp} {stories24h} {alertCount} {clockText} onGoToScreen={goToScreen} />

  <!-- Carousel area -->
  <div class="flex-1 relative" style="height: calc(100vh - 48px - 44px);">
    <!-- Persistent map — single MapContainer, never destroyed. Hidden when non-map screen active. -->
    <div class="absolute inset-0" style="z-index: {isMapScreenActive ? 1 : 0}; visibility: {isMapScreenActive ? 'visible' : 'hidden'};">
      <TvMapScreen
        {earthquakeItems}
        {fireIncidents}
        viewId={activeMapViewId}
        weather={regionWeather[activeMapViewId] ?? null}
        {threeOneOneItems}
        coffeeShops={cappuccinoData?.current?.shops ?? []}
        gasStations={gasData?.current?.stations ?? []}
        fitnessStudios={fitnessData?.current?.studios ?? []}
      />
    </div>

    <!-- Non-map screens — destroyed/created normally -->
    {#each TV_SCREENS as screen, i (screen.id)}
      {#if !screen.mapViewId}
        <TvScreen active={carouselIdx === i}>
          {#if screen.id === 'news-wire'}
            <NewsWireScreen active={carouselIdx === i} />
          {:else if screen.id === 'safety'}
            <SafetyScreen active={carouselIdx === i} />
          {:else if screen.id === 'cameras-tam-coast'}
            <TvCameraClusterScreen clusterId="tam-coast" />
          {:else if screen.id === 'cameras-central-highway'}
            <TvCameraClusterScreen clusterId="central-highway" />
          {:else if screen.id === 'cameras-west-north'}
            <TvCameraClusterScreen clusterId="west-north" />
          {:else if screen.id === 'composite'}
            <TvCompositeHero data={compositeData} />
          {:else if screen.id === 'daily-life'}
            <TvDailyLifeCard cappuccino={cappuccinoData} grocery={groceryData} gas={gasData} />
          {:else if screen.id === 'lifestyle'}
            <TvLifestyleCard wine={wineData} fitness={fitnessData} />
          {:else if screen.id === 'structural'}
            <TvStructuralCard tuition={tuitionData} />
          {:else if screen.id === 'driveway'}
            <TvDrivewayCard data={drivewayData} />
          {:else if screen.id === '311-photos'}
            <Tv311PhotoWall items={threeOneOneItems} active={carouselIdx === i} />
          {:else if screen.id === 'community'}
            <TvCommunityScreen active={carouselIdx === i} />
          {:else if screen.id === 'leaderboards'}
            <TvLeaderboardsScreen active={carouselIdx === i} />
          {:else if screen.id === 'conditions'}
            <TvConditionsCard
              weather={regionWeather?.['county'] ?? null}
              aqi={aqiData ? { value: aqiData.aqi, category: aqiData.category } : null}
              tides={tidePredictions}
            />
          {:else if screen.id === 'outdoors'}
            <TvOutdoorsCard
              surf={[]}
              dirt={heroDirt ? { condition: heroDirt.label, color: heroDirt.color, lastRain: heroDirt.summary } : null}
              streams={streamGauges.filter(s => s.streamflow != null).map(s => ({ name: s.shortName || s.name, cfs: Math.round(s.streamflow!), trend: 'stable' as const }))}
            />
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
