import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { get511ApiKey } from '$lib/server/api-keys';
import { log511Read, read511Of } from '$lib/server/upstream-511';

const API_BASE = 'https://api.511.org/traffic/events';

function normalizeEvents(payload: unknown): Record<string, unknown>[] {
	if (Array.isArray(payload)) return payload as Record<string, unknown>[];
	if (!payload || typeof payload !== 'object') return [];

	const root = payload as Record<string, unknown>;
	const candidateKeys = ['events', 'Events', 'event', 'Event', 'results', 'Results', 'data'];
	for (const key of candidateKeys) {
		if (Array.isArray(root[key])) {
			return root[key] as Record<string, unknown>[];
		}
	}

	return [];
}

export async function GET() {
	const apiKey = get511ApiKey();
	if (!apiKey) {
		return json({ error: 'Service unavailable' }, { status: 503 });
	}

	const url = `${API_BASE}?api_key=${encodeURIComponent(apiKey)}&format=json`;
	const started = Date.now();
	let response: Response;
	try {
		response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
	} catch {
		log511Read(
			'traffic/events',
			{ status: null, retryAfter: null, remaining: null },
			Date.now() - started
		);
		return json(
			{ events: [], error: 'Upstream traffic API error' },
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}
	log511Read('traffic/events', read511Of(response), Date.now() - started);

	if (!response.ok) {
		return json(
			{ events: [], error: 'Upstream traffic API error' },
			{
				status: response.status,
				headers: { 'cache-control': 'no-store' }
			}
		);
	}

	const text = await response.text();
	const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

	let payload: unknown = {};
	try {
		payload = JSON.parse(clean);
	} catch {
		return json(
			{ events: [], error: 'Invalid upstream response' },
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}

	const events = normalizeEvents(payload);
	return json(
		{ events, count: events.length },
		{ headers: { 'cache-control': 'public, max-age=60' } }
	);
}
