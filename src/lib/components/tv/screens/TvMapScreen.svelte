<script lang="ts">
  import { onMount } from 'svelte';
  import { MapContainer, MapDataLayer, MapControls, MapTooltip } from '$lib/components/map';
  import TvMapFlyer from '$lib/components/tv/TvMapFlyer.svelte';
  import TvMapSidebar from '$lib/components/tv/TvMapSidebar.svelte';
  import { fetchFireIncidents } from '$lib/api/marin';
  import { fetchHourlyForecast } from '$lib/api/marin/nws-hourly';
  import type { FireIncident } from '$lib/api/marin/calfire';
  import { allNewsItems } from '$lib/stores';
  import { MARIN_TOWNS } from '$lib/config/towns';
  import type { TvMapView } from '$lib/config/tv';
  import type { NewsItem } from '$lib/types';

  interface Props {
    earthquakeItems: NewsItem[];
    active?: boolean;
  }

  let { earthquakeItems, active = true }: Props = $props();

  let fireIncidents = $state<FireIncident[]>([]);

  let regionLabel = $state('Marin County');
  let sidebarWeather = $state<{ temp: number; wind: string; shortForecast: string } | null>(null);
  let sidebarStories = $state<NewsItem[]>([]);
  let sidebarAlerts = $state<NewsItem[]>([]);
  let weatherLoading = $state(false);

  const weatherCache = new Map<string, { data: { temp: number; wind: string; shortForecast: string }; fetchedAt: number }>();
  const CACHE_TTL = 5 * 60 * 1000;

  onMount(async () => {
    try {
      fireIncidents = await fetchFireIncidents();
    } catch {
      // Silent fail
    }
  });

  async function handleViewChange(view: TvMapView) {
    regionLabel = view.label;

    const lat = view.center[1];
    const lon = view.center[0];
    const radius = view.zoom < 11 ? 0.15 : 0.05;

    // Find towns within the view radius
    const nearbyTownSlugs = new Set(
      MARIN_TOWNS
        .filter((t) => Math.abs(t.lat - lat) < radius && Math.abs(t.lon - lon) < radius)
        .map((t) => t.slug)
    );

    // Include items with coordinates in range OR items tagged to a nearby town
    const nearby = $allNewsItems.filter((item) => {
      // Match by explicit coordinates
      if (typeof item.lat === 'number' && typeof item.lon === 'number') {
        if (Math.abs(item.lat - lat) < radius && Math.abs(item.lon - lon) < radius) return true;
      }
      // Match by town slug
      if (item.townSlug && nearbyTownSlugs.has(item.townSlug)) return true;
      return false;
    });

    sidebarStories = nearby.filter((i) => !i.isAlert).slice(0, 6);
    sidebarAlerts = nearby.filter((i) => i.isAlert).slice(0, 4);

    const cached = weatherCache.get(view.id);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      sidebarWeather = cached.data;
      return;
    }

    weatherLoading = true;
    try {
      const hourly = await fetchHourlyForecast(lat, lon);
      if (hourly.length > 0) {
        const current = hourly[0];
        const data = {
          temp: current.temperature,
          wind: `${current.windSpeed}`,
          shortForecast: current.shortForecast ?? ''
        };
        sidebarWeather = data;
        weatherCache.set(view.id, { data, fetchedAt: Date.now() });
      }
    } catch {
      // Keep last good data
    } finally {
      weatherLoading = false;
    }
  }
</script>

<div class="flex h-full gap-0" style="min-height: 0;">
  <div class="flex-1 min-w-0 min-h-0 relative" style="height: 100%;">
    <MapContainer>
      <MapDataLayer earthquakes={earthquakeItems} {fireIncidents} />
      <MapControls />
      <MapTooltip />
      <TvMapFlyer {active} onViewChange={handleViewChange} />
    </MapContainer>
  </div>
  <div class="w-72 shrink-0">
    <TvMapSidebar
      {regionLabel}
      weather={sidebarWeather}
      stories={sidebarStories}
      alerts={sidebarAlerts}
      loading={weatherLoading}
    />
  </div>
</div>
