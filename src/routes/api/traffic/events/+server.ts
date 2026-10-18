import { json } from '@sveltejs/kit';
import { get511ApiKey } from '$lib/server/api-keys';
import { get511, memo511 } from '$lib/server/upstream-511';

/** The event list wherever 511 put it; null when there is none (not an empty list). */
function normalizeEvents(payload: unknown): Record<string, unknown>[] | null {
	if (Array.isArray(payload)) return payload as Record<string, unknown>[];
	if (!payload || typeof payload !== 'object') return null;

	const root = payload as Record<string, unknown>;
	const candidateKeys = ['events', 'Events', 'event', 'Event', 'results', 'Results', 'data'];
	for (const key of candidateKeys) {
		if (Array.isArray(root[key])) {
			return root[key] as Record<string, unknown>[];
		}
	}

	return null;
}

type Outcome = { status: number; body: unknown };
const NO_STORE = { 'cache-control': 'no-store' };
const UPSTREAM_ERROR = { events: [], error: 'Upstream traffic API error' };
/** The whole read, body included. */
const DEADLINE_MS = 10_000;
/** One 511 read per 10 minutes, success or failure. Budget: $lib/server/upstream-511. */
const memo = memo511<Outcome>(10 * 60_000);

export async function GET() {
	const apiKey = get511ApiKey();
	if (!apiKey) {
		return json({ error: 'Service unavailable' }, { status: 503 });
	}
	const { status, body } = await memo('traffic/events', () => readEvents(apiKey));
	return json(body, {
		status,
		headers: status === 200 ? { 'cache-control': 'public, max-age=60, s-maxage=600' } : NO_STORE
	});
}

async function readEvents(apiKey: string): Promise<Outcome> {
	const deadline = new AbortController();
	const timer = setTimeout(() => deadline.abort(), DEADLINE_MS);
	try {
		const { status, body } = await get511(
			'/traffic/events?format=json',
			apiKey,
			deadline.signal,
			'traffic/events'
		);
		if (status !== null && status >= 400) return { status, body: UPSTREAM_ERROR };
		const events = body === null ? null : normalizeEvents(body);
		if (events === null)
			return { status: 502, body: { events: [], error: 'Invalid upstream response' } };
		return { status: 200, body: { events, count: events.length } };
	} finally {
		clearTimeout(timer);
	}
}
