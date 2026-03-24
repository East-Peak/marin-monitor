<script lang="ts">
	import { onMount } from 'svelte';
	import { MapContainer, MapDataLayer, MapControls, MapTooltip } from '$lib/components/map';
	import WeatherPanel from '$lib/components/panels/WeatherPanel.svelte';
	import TvMapFlyer from '$lib/components/tv/TvMapFlyer.svelte';
	import { fetchFireIncidents } from '$lib/api/marin';
	import type { FireIncident } from '$lib/api/marin/calfire';
	import type { WeatherData, FireWeatherAlert, NewsItem } from '$lib/types';

	interface Props {
		forecast: (WeatherData & { name: string })[];
		weatherAlerts: FireWeatherAlert[];
		earthquakeItems: NewsItem[];
		active?: boolean;
	}

	let { forecast, weatherAlerts, earthquakeItems, active = true }: Props = $props();

	let fireIncidents = $state<FireIncident[]>([]);

	onMount(async () => {
		try {
			fireIncidents = await fetchFireIncidents();
		} catch {
			// Silent fail — fire overlay is additive
		}
	});
</script>

<div class="flex h-full gap-2 p-2" style="min-height: 0;">
	<div class="flex-1 min-w-0 min-h-0 relative" style="height: 100%;">
		<MapContainer>
			<MapDataLayer earthquakes={earthquakeItems} {fireIncidents} />
			<MapControls />
			<MapTooltip />
			<TvMapFlyer {active} />
		</MapContainer>
	</div>
	<div class="w-80 shrink-0 overflow-y-auto">
		<WeatherPanel {forecast} alerts={weatherAlerts} />
	</div>
</div>
