/**
 * Server-side proxy for 511.org transit API
 *
 * Keeps the API key on the server side and handles the gzip/BOM quirks.
 * During dev, runs via Vite's built-in server.
 */

import { error, json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { get511ApiKey } from '$lib/server/api-keys';
import type { RequestHandler } from './$types';

const API_BASE = 'https://api.511.org/transit';

export const GET: RequestHandler = async ({ url }) => {
	const agency = url.searchParams.get('agency');

	if (!agency) {
		throw error(400, 'Missing agency parameter');
	}

	const ALLOWED_AGENCIES = new Set(['GG', 'GF', 'MA', 'SA', 'AF']);
	if (!ALLOWED_AGENCIES.has(agency)) {
		throw error(400, 'Unknown transit agency');
	}

	const apiKey = get511ApiKey();
	if (!apiKey) {
		return json({ error: 'Service unavailable' }, { status: 503 });
	}

	try {
		const apiUrl = `${API_BASE}/servicealerts?api_key=${apiKey}&agency=${agency}&format=json`;

		const response = await fetchWithTimeout(apiUrl, {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			throw error(response.status, `511 API returned ${response.status}`);
		}

		const text = await response.text();
		// Strip BOM if present
		const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

		return new Response(clean, {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=120' // 2 min cache
			}
		});
	} catch (e) {
		if ((e as { status?: number }).status) throw e;
		console.error('Transit fetch failed:', (e as Error).message);
		throw error(502, 'Failed to fetch transit alerts');
	}
};
