/**
 * Getting Around's roads (v2 preview): 511's complete traffic event list, filtered to Marin and the
 * routes to SFO and OAK. 511 pages its list (20 by default; /api/traffic/events keeps only that
 * first page). This reads every page, bodies included, inside one deadline, or fails: a partial
 * list could hide the incident that matters. Records it can't read are counted in `unreadable`.
 */
import { json } from '@sveltejs/kit';
import { get511ApiKey } from '$lib/server/api-keys';
import { corridorEvents } from '$lib/traffic/corridors';

const ORIGIN = 'https://api.511.org';
const FIRST_PAGE = '/traffic/events?format=json&limit=500';
const MAX_PAGES = 5;
/** The whole read, every page and body; the client allows 12 s (fetchTrafficCorridorsOrThrow). */
const DEADLINE_MS = 8_000;
const NO_STORE = { 'cache-control': 'no-store' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** One page, or null when it fails, doesn't parse, or its pagination is anything but 511's own. */
async function readPage(
	path: string,
	key: string,
	signal: AbortSignal
): Promise<{ events: unknown[]; next: string | null } | null> {
	const url = new URL(path, ORIGIN);
	url.searchParams.set('api_key', key); // next_url already carries it; set, never append
	try {
		const response = await fetch(url.toString(), {
			headers: { Accept: 'application/json' },
			signal
		});
		if (!response.ok) return null;
		const raw = await response.text(); // the same signal aborts a stalled body
		const body: unknown = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
		if (!isRecord(body) || !Array.isArray(body.events)) return null;
		if (body.pagination !== undefined && !isRecord(body.pagination)) return null;
		const next = isRecord(body.pagination) ? (body.pagination.next_url ?? null) : null;
		if (next !== null && (typeof next !== 'string' || !next.startsWith('/traffic/events?')))
			return null;
		return { events: body.events, next };
	} catch {
		return null;
	}
}

export async function GET() {
	const key = get511ApiKey();
	if (!key) return json({ error: 'Service unavailable' }, { status: 503, headers: NO_STORE });
	const deadline = new AbortController();
	const timer = setTimeout(() => deadline.abort(), DEADLINE_MS);
	const events: unknown[] = [];
	let path: string | null = FIRST_PAGE;
	try {
		for (let pages = 0; path !== null && pages < MAX_PAGES; pages++) {
			const read = await readPage(path, key, deadline.signal);
			if (read === null)
				return json({ error: 'Traffic events unavailable' }, { status: 502, headers: NO_STORE });
			events.push(...read.events);
			path = read.next;
		}
	} finally {
		clearTimeout(timer);
	}
	if (path !== null)
		return json({ error: 'Traffic events incomplete' }, { status: 502, headers: NO_STORE });
	const checkedAt = new Date();
	const { events: kept, unreadable } = corridorEvents(events, checkedAt.getTime());
	return json(
		{ checkedAt: checkedAt.toISOString(), upstreamCount: events.length, unreadable, events: kept },
		{ headers: { 'cache-control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=60' } }
	);
}
