/**
 * Open-Meteo Observed Weather adapter
 *
 * Fetches 7 days of observed hourly weather for Marin County.
 * Free API, no auth key required.
 * Used by the Hero Dirt Tracker for soil moisture, dew/fog detection,
 * and seasonal baseline computation.
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
const MARIN_CENTER = { lat: 37.9735, lon: -122.5311 };

export interface ObservedWeather {
	time: string[];
	temperature: number[];
	humidity: number[];
	dewpoint: number[];
	precipitation: number[];
	windSpeed: number[];
	/** Volumetric soil moisture at surface, m³/m³ (primary Hero Dirt signal) */
	soilMoisture0to1cm: number[];
	/** Volumetric soil moisture 1-3cm depth, m³/m³ */
	soilMoisture1to3cm: number[];
	/** Surface soil temperature, °F */
	soilTemperature0cm: number[];
	/** WMO weather code (45=fog, 48=rime fog, 51-55=drizzle) */
	weatherCode: number[];
	/** Low cloud cover % (fog/stratus indicator) */
	cloudCoverLow: number[];
	/** Direct solar radiation, W/m² */
	directRadiation: number[];
	/** Vapour pressure deficit, kPa */
	vapourPressureDeficit: number[];
	/** Evapotranspiration, mm */
	evapotranspiration: number[];
}

interface OpenMeteoResponse {
	hourly?: {
		time?: string[];
		temperature_2m?: number[];
		relative_humidity_2m?: number[];
		dewpoint_2m?: number[];
		precipitation?: number[];
		wind_speed_10m?: number[];
		soil_moisture_0_to_1cm?: number[];
		soil_moisture_1_to_3cm?: number[];
		soil_temperature_0cm?: number[];
		weather_code?: number[];
		cloud_cover_low?: number[];
		direct_radiation?: number[];
		vapour_pressure_deficit?: number[];
		evapotranspiration?: number[];
	};
}

const HOURLY_VARS = [
	'temperature_2m',
	'relative_humidity_2m',
	'dewpoint_2m',
	'precipitation',
	'wind_speed_10m',
	'soil_moisture_0_to_1cm',
	'soil_moisture_1_to_3cm',
	'soil_temperature_0cm',
	'weather_code',
	'cloud_cover_low',
	'direct_radiation',
	'vapour_pressure_deficit',
	'evapotranspiration'
].join(',');

/**
 * Fetch 7 days of observed weather from Open-Meteo.
 * Accepts optional lat/lon to fetch for a specific town; defaults to MARIN_CENTER.
 * Returns empty arrays on failure (graceful degradation).
 */
export async function fetchObservedWeather(lat?: number, lon?: number): Promise<ObservedWeather> {
	const empty: ObservedWeather = {
		time: [],
		temperature: [],
		humidity: [],
		dewpoint: [],
		precipitation: [],
		windSpeed: [],
		soilMoisture0to1cm: [],
		soilMoisture1to3cm: [],
		soilTemperature0cm: [],
		weatherCode: [],
		cloudCoverLow: [],
		directRadiation: [],
		vapourPressureDeficit: [],
		evapotranspiration: []
	};

	try {
		const params = new URLSearchParams({
			latitude: String(lat ?? MARIN_CENTER.lat),
			longitude: String(lon ?? MARIN_CENTER.lon),
			hourly: HOURLY_VARS,
			temperature_unit: 'fahrenheit',
			wind_speed_unit: 'mph',
			precipitation_unit: 'inch',
			past_days: '7',
			forecast_days: '0',
			timezone: 'America/Los_Angeles'
		});

		const url = `${OPEN_METEO_BASE}?${params}`;
		logger.log('OPEN-METEO', `Fetching observed weather: ${url}`);

		const response = await fetchWithTimeout(url, {
			headers: { Accept: 'application/json' }
		});
		if (!response.ok) {
			throw new Error(`Open-Meteo failed: ${response.status}`);
		}

		const data = (await response.json()) as OpenMeteoResponse;
		const hourly = data.hourly;
		if (!hourly?.time?.length) return empty;

		return {
			time: hourly.time,
			temperature: hourly.temperature_2m ?? [],
			humidity: hourly.relative_humidity_2m ?? [],
			dewpoint: hourly.dewpoint_2m ?? [],
			precipitation: hourly.precipitation ?? [],
			windSpeed: hourly.wind_speed_10m ?? [],
			soilMoisture0to1cm: hourly.soil_moisture_0_to_1cm ?? [],
			soilMoisture1to3cm: hourly.soil_moisture_1_to_3cm ?? [],
			soilTemperature0cm: (hourly.soil_temperature_0cm ?? []).map((v) =>
				v != null ? v * (9 / 5) + 32 : v
			),
			weatherCode: hourly.weather_code ?? [],
			cloudCoverLow: hourly.cloud_cover_low ?? [],
			directRadiation: hourly.direct_radiation ?? [],
			vapourPressureDeficit: hourly.vapour_pressure_deficit ?? [],
			evapotranspiration: hourly.evapotranspiration ?? []
		};
	} catch (error) {
		logger.warn('OPEN-METEO', `Observed weather fetch failed: ${(error as Error).message}`);
		return empty;
	}
}
