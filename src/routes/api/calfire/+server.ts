import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

const CALFIRE_URL =
	'https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList?inactive=false';

export const GET: RequestHandler = async () => {
	try {
		const response = await fetchWithTimeout(CALFIRE_URL, {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			return json(
				{ type: 'FeatureCollection', features: [] },
				{ status: response.status, headers: { 'Cache-Control': 'no-store' } }
			);
		}

		const data = await response.json();
		return json(data, {
			headers: { 'Cache-Control': 'public, max-age=120' }
		});
	} catch {
		return json(
			{ type: 'FeatureCollection', features: [] },
			{ status: 502, headers: { 'Cache-Control': 'no-store' } }
		);
	}
};
