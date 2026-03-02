import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { getAirnowApiKey } from '$lib/server/api-keys';
import type { RequestHandler } from './$types';
import { MARIN_CENTER } from '$lib/config/towns';

interface AirNowObservation {
	ParameterName: string;
	AQI: number;
	Category: {
		Number: number;
		Name: string;
	};
}

function aqiColor(categoryNumber: number): string {
	switch (categoryNumber) {
		case 1:
			return '#00e400';
		case 2:
			return '#ffff00';
		case 3:
			return '#ff7e00';
		case 4:
			return '#ff0000';
		case 5:
			return '#8f3f97';
		case 6:
			return '#7e0023';
		default:
			return '#999999';
	}
}

export const GET: RequestHandler = async () => {
	const apiKey = getAirnowApiKey();
	if (!apiKey) {
		return json({ error: 'Service unavailable' }, { status: 503 });
	}

	const params = new URLSearchParams({
		format: 'application/json',
		latitude: String(MARIN_CENTER.lat),
		longitude: String(MARIN_CENTER.lon),
		distance: '25',
		API_KEY: apiKey
	});

	const response = await fetchWithTimeout(
		`https://www.airnowapi.org/aq/observation/latLong/current/?${params.toString()}`,
		{
			headers: { Accept: 'application/json' }
		}
	);

	if (!response.ok) {
		return json(null, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
	}

	const observations = (await response.json()) as AirNowObservation[];
	if (!observations.length) {
		return new Response(null, {
			status: 204,
			headers: { 'Cache-Control': 'public, max-age=300' }
		});
	}

	const worst = observations.reduce((a, b) => (a.AQI >= b.AQI ? a : b));
	return json(
		{
			aqi: worst.AQI,
			category: worst.Category.Name,
			color: aqiColor(worst.Category.Number),
			pollutant: worst.ParameterName,
			timestamp: Date.now()
		},
		{
			headers: { 'Cache-Control': 'public, max-age=300' }
		}
	);
};
