import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';
import { MARIN_BOUNDS } from '$lib/config';
import { isInsideMarin } from '$lib/geo/proximity';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim();
	const town = url.searchParams.get('town')?.trim();
	if (!q) {
		return json(null, { status: 400 });
	}

	const query = `${q}, ${town ? `${town}, ` : ''}Marin County, California`;
	const params = new URLSearchParams({
		q: query,
		format: 'jsonv2',
		limit: '1',
		addressdetails: '0',
		bounded: '1',
		viewbox: `${MARIN_BOUNDS.west - 0.08},${MARIN_BOUNDS.north + 0.06},${MARIN_BOUNDS.east + 0.08},${MARIN_BOUNDS.south - 0.06}`
	});

	const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
		headers: {
			Accept: 'application/json',
			'User-Agent': 'MarinMonitor/1.0'
		}
	});

	if (!response.ok) {
		return json(null, {
			status: response.status,
			headers: { 'Cache-Control': 'public, max-age=300' }
		});
	}

	const payload = (await response.json()) as Array<{ lat: string; lon: string }>;
	const result = payload?.[0];
	if (!result) {
		return json(null, { headers: { 'Cache-Control': 'public, max-age=300' } });
	}

	const lat = Number(result.lat);
	const lon = Number(result.lon);
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInsideMarin(lat, lon)) {
		return json(null, { headers: { 'Cache-Control': 'public, max-age=300' } });
	}

	return json(
		{ lat, lon },
		{
			headers: {
				'Cache-Control': 'public, max-age=300'
			}
		}
	);
};
