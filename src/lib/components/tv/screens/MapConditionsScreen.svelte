<script lang="ts">
  import MapPanel from '$lib/components/panels/MapPanel.svelte';
  import WeatherPanel from '$lib/components/panels/WeatherPanel.svelte';
  import type { WeatherData, FireWeatherAlert, NewsItem } from '$lib/types';

  interface Props {
    forecast: (WeatherData & { name: string })[];
    weatherAlerts: FireWeatherAlert[];
    earthquakeItems: NewsItem[];
  }

  let { forecast, weatherAlerts, earthquakeItems }: Props = $props();
</script>

<div class="flex h-full gap-2 p-2">
  <div class="flex-1 min-w-0">
    <MapPanel earthquakes={earthquakeItems} />
  </div>
  <div class="w-80 shrink-0 overflow-y-auto">
    <WeatherPanel {forecast} alerts={weatherAlerts} />
  </div>
</div>
