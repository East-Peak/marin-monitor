import type { ServerLoadEvent } from '@sveltejs/kit';
import { LOCATION_PRESETS } from '$lib/config/locations';

const BOOTSTRAP_LOCATION_ID = 'central-marin';
const BOOTSTRAP_LOCATION =
	LOCATION_PRESETS.find((preset) => preset.id === BOOTSTRAP_LOCATION_ID) ?? LOCATION_PRESETS[0];

export async function load({ setHeaders }: ServerLoadEvent) {
	setHeaders({
		'Cache-Control': 's-maxage=120, stale-while-revalidate=300'
	});

	try {
		const [{ fetchWeather }, { fetchEarthquakes }, { fetchHourlyForecast }] = await Promise.all([
			import('$lib/api/marin'),
			import('$lib/api/marin'),
			import('$lib/api/marin/nws-hourly')
		]);

		const [weather, earthquakes, hourly] = await Promise.allSettled([
			fetchWeather(BOOTSTRAP_LOCATION.lat, BOOTSTRAP_LOCATION.lon),
			fetchEarthquakes(),
			fetchHourlyForecast()
		]);

		return {
			bootstrap: {
				weather: weather.status === 'fulfilled' ? weather.value : null,
				earthquakes: earthquakes.status === 'fulfilled' ? earthquakes.value : [],
				hourly: hourly.status === 'fulfilled' ? hourly.value : [],
				locationId: BOOTSTRAP_LOCATION.id,
				timestamp: Date.now()
			}
		};
	} catch {
		return { bootstrap: null };
	}
}
