import { LOCATION_PRESETS } from '$lib/config/locations';

const BOOTSTRAP_LOCATION_ID = 'central-marin';
const BOOTSTRAP_LOCATION =
	LOCATION_PRESETS.find((preset) => preset.id === BOOTSTRAP_LOCATION_ID) ?? LOCATION_PRESETS[0];

/** Server-side prefetch for the legacy dashboard (weather, earthquakes, hourly). */
export async function loadLegacyBootstrap() {
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
			weather: weather.status === 'fulfilled' ? weather.value : null,
			earthquakes: earthquakes.status === 'fulfilled' ? earthquakes.value : [],
			hourly: hourly.status === 'fulfilled' ? hourly.value : [],
			locationId: BOOTSTRAP_LOCATION.id,
			timestamp: Date.now()
		};
	} catch {
		return null;
	}
}

export type LegacyBootstrap = Awaited<ReturnType<typeof loadLegacyBootstrap>>;
