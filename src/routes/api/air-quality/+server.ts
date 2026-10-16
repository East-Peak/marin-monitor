import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { getAirnowApiKey } from '$lib/server/api-keys';
import { airQualityFromObservations } from '$lib/server/airnow';
import type { RequestHandler } from './$types';
import { MARIN_CENTER } from '$lib/config/towns';

const AIRNOW_CURRENT = 'https://www.airnowapi.org/aq/observation/current/ziplatlong/';
const NO_STORE = { 'Cache-Control': 'no-store' };

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

	let reading;
	try {
		const response = await fetchWithTimeout(`${AIRNOW_CURRENT}?${params}`, {
			headers: { Accept: 'application/json' }
		});
		if (!response.ok) throw new Error(`AirNow HTTP ${response.status}`);
		reading = airQualityFromObservations(await response.json(), Date.now());
	} catch (error) {
		return json({ error: (error as Error).message }, { status: 502, headers: NO_STORE });
	}

	if (!reading) {
		return new Response(null, {
			status: 204,
			headers: { 'Cache-Control': 'public, max-age=300' }
		});
	}
	return json(reading, { headers: { 'Cache-Control': 'public, max-age=300' } });
};
