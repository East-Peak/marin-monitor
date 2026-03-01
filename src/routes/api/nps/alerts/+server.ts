import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const NPS_BASE = 'https://developer.nps.gov/api/v1';
const MARIN_PARKS = 'goga,muwo,pore';

function getNpsApiKey(): string {
	return env.NPS_API_KEY || 'DEMO_KEY';
}

export const GET: RequestHandler = async ({ fetch }) => {
	const apiKey = getNpsApiKey();
	const response = await fetch(`${NPS_BASE}/alerts?parkCode=${MARIN_PARKS}&api_key=${apiKey}`, {
		headers: { Accept: 'application/json' }
	});

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
