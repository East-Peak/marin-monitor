import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { getNpsApiKey } from '$lib/server/api-keys';
import type { RequestHandler } from './$types';

const NPS_BASE = 'https://developer.nps.gov/api/v1';
const MARIN_PARKS = 'goga,muwo,pore';

export const GET: RequestHandler = async () => {
	const apiKey = getNpsApiKey();
	if (!apiKey) {
		return json({ error: 'Service unavailable' }, { status: 503 });
	}

	const response = await fetchWithTimeout(
		`${NPS_BASE}/alerts?parkCode=${MARIN_PARKS}&api_key=${apiKey}`,
		{
			headers: { Accept: 'application/json' }
		}
	);

	if (response.status === 429) {
		return json([], {
			headers: { 'Cache-Control': 'public, max-age=300' }
		});
	}

	if (!response.ok) {
		return json([], {
			status: response.status,
			headers: { 'Cache-Control': 'no-store' }
		});
	}

	const payload = (await response.json()) as { data?: unknown[] };
	return json(payload.data ?? [], {
		headers: { 'Cache-Control': 'public, max-age=300' }
	});
};
