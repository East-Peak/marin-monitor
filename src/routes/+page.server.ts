import type { ServerLoadEvent } from '@sveltejs/kit';

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
			fetchWeather(37.9735, -122.5311), // Central Marin default
			fetchEarthquakes(),
			fetchHourlyForecast()
		]);

		return {
			bootstrap: {
				weather: weather.status === 'fulfilled' ? weather.value : null,
				earthquakes: earthquakes.status === 'fulfilled' ? earthquakes.value : [],
				hourly: hourly.status === 'fulfilled' ? hourly.value : [],
				timestamp: Date.now()
			}
		};
	} catch {
		return { bootstrap: null };
	}
}
