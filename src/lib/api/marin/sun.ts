/**
 * Sunrise/Sunset adapter
 *
 * Uses the free sunrise-sunset.org API (no auth required).
 * Returns today's sun times for central Marin County.
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';

export interface SunData {
	sunrise: string; // formatted time, e.g. "6:42 AM"
	sunset: string;
	solarNoon: string;
	dayLength: string; // e.g. "12h 34m"
	civilTwilightBegin: string;
	civilTwilightEnd: string;
}

// Central Marin (San Rafael area)
const LAT = 37.9735;
const LNG = -122.5311;

function formatTime(utcIso: string): string {
	const d = new Date(utcIso);
	return d.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'America/Los_Angeles'
	});
}

function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return `${h}h ${m}m`;
}

export async function fetchSunTimes(lat: number = LAT, lon: number = LNG): Promise<SunData | null> {
	try {
		const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0&date=today`;
		const response = await fetchWithTimeout(url);

		if (!response.ok) {
			throw new Error(`Sunrise API failed: ${response.status}`);
		}

		const data = await response.json();
		if (data.status !== 'OK') {
			throw new Error(`Sunrise API returned: ${data.status}`);
		}

		const r = data.results;
		return {
			sunrise: formatTime(r.sunrise),
			sunset: formatTime(r.sunset),
			solarNoon: formatTime(r.solar_noon),
			dayLength: formatDuration(r.day_length),
			civilTwilightBegin: formatTime(r.civil_twilight_begin),
			civilTwilightEnd: formatTime(r.civil_twilight_end)
		};
	} catch (error) {
		logger.warn('Sun', `Fetch failed: ${(error as Error).message}`);
		return null;
	}
}
