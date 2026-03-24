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

/** In-memory cache to avoid hammering 511.org (rate-limited) */
const transitCache = new Map<string, { data: string; fetchedAt: number }>();
const TRANSIT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const GET: RequestHandler = async ({ url }) => {
	const agency = url.searchParams.get('agency');

	if (!agency) {
		throw error(400, 'Missing agency parameter');
	}

	const ALLOWED_AGENCIES = new Set(['GG', 'GF', 'MA', 'SA', 'AF']);
	if (!ALLOWED_AGENCIES.has(agency)) {
		throw error(400, 'Unknown transit agency');
	}

	// Check in-memory cache first
	const cached = transitCache.get(agency);
	if (cached && Date.now() - cached.fetchedAt < TRANSIT_CACHE_TTL) {
		return json(JSON.parse(cached.data), {
			headers: { 'Cache-Control': 'public, max-age=120', 'X-Cache': 'HIT' }
		});
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

		// Cache the successful response
		transitCache.set(agency, { data: clean, fetchedAt: Date.now() });

		return new Response(clean, {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=120',
				'X-Cache': 'MISS'
			}
		});
	} catch (e) {
		if ((e as { status?: number }).status) throw e;
		console.error('Transit fetch failed:', (e as Error).message);
		throw error(502, 'Failed to fetch transit alerts');
	}
};
