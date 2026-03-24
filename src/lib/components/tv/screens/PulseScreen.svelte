<script lang="ts">
  import PulsePanel from '$lib/components/panels/PulsePanel.svelte';
  import type { WeatherData, FireWeatherAlert, EarthquakeData } from '$lib/types';

  interface Props {
    forecast: (WeatherData & { name: string })[];
    weatherAlerts: FireWeatherAlert[];
    earthquakes: EarthquakeData[];
  }

  let { forecast, weatherAlerts, earthquakes }: Props = $props();
</script>

<div class="h-full p-6 flex items-center justify-center">
  <div class="w-full max-w-4xl">
    <PulsePanel {forecast} {weatherAlerts} {earthquakes} />
  </div>
</div>
