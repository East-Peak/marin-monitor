/**
 * Server-side proxy for 511.org transit API
 *
 * Keeps the API key on the server side and handles the gzip/BOM quirks.
 * During dev, runs via Vite's built-in server.
 */

import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const API_BASE = 'https://api.511.org/transit';

function get511ApiKey(): string {
	return env.API_511_KEY || '';
}

export const GET: RequestHandler = async ({ url }) => {
	const agency = url.searchParams.get('agency');

	if (!agency) {
		throw error(400, 'Missing agency parameter');
	}

	const apiKey = get511ApiKey();
	if (!apiKey) {
		throw error(500, 'No 511 API key configured');
	}

	try {
		const apiUrl = `${API_BASE}/servicealerts?api_key=${apiKey}&agency=${agency}&format=json`;

		const response = await fetch(apiUrl, {
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
		throw error(502, `Failed to fetch transit alerts: ${(e as Error).message}`);
	}
};
