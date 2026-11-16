import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { getNpsApiKey } from '$lib/server/api-keys';
import type { RequestHandler } from './$types';

const NPS_BASE = 'https://developer.nps.gov/api/v1';
const MARIN_PARKS = 'goga,muwo,pore';
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const RATE_LIMITED = { 'Cache-Control': 'public, max-age=60, s-maxage=300' };

// The edge never stores a 429, so after one this instance stops asking NPS for the cooldown.
let rateLimitedUntil = 0;

export const GET: RequestHandler = async () => {
	const apiKey = getNpsApiKey();
	if (!apiKey) {
		return json({ error: 'Service unavailable' }, { status: 503 });
	}

	if (Date.now() < rateLimitedUntil) {
		return json([], { status: 429, headers: RATE_LIMITED });
	}

	const response = await fetchWithTimeout(
		`${NPS_BASE}/alerts?parkCode=${MARIN_PARKS}&api_key=${apiKey}`,
		{
			headers: { Accept: 'application/json' }
		}
	);

	// A rate limit is a failed read, not "no alerts"; the edge holds it briefly (when it stores it at all).
	// The Vercel edge caches on s-maxage only; max-age alone leaves every page view calling NPS with our key.
	if (response.status === 429) {
		rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
		return json([], { status: 429, headers: RATE_LIMITED });
	}

	if (!response.ok) {
		return json([], {
			status: response.status,
			headers: { 'Cache-Control': 'no-store' }
		});
	}

	const payload = (await response.json()) as { data?: unknown[] };
	return json(payload.data ?? [], {
		headers: { 'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600' }
	});
};
