import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const API_BASE = 'https://api.511.org/traffic/events';

function get511ApiKey(): string {
	return env.API_511_KEY || '';
}

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

export async function GET({ fetch }) {
	const apiKey = get511ApiKey();
	if (!apiKey) {
		return json(
			{ events: [], error: 'No 511 API key configured' },
			{ headers: { 'cache-control': 'public, max-age=30' } }
		);
	}

	const url = `${API_BASE}?api_key=${encodeURIComponent(apiKey)}&format=json`;
	const response = await fetch(url, {
		headers: { Accept: 'application/json' }
	});

	if (!response.ok) {
		return json(
			{ events: [], error: `511 API returned ${response.status}` },
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
	} catch (error) {
		return json(
			{ events: [], error: `Invalid 511 JSON payload: ${(error as Error).message}` },
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}

	const events = normalizeEvents(payload);
	return json(
		{ events, count: events.length },
		{ headers: { 'cache-control': 'public, max-age=60' } }
	);
}
