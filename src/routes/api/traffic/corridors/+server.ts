/**
 * Getting Around's roads (v2 preview): 511's complete traffic event list, filtered to Marin and the
 * routes to SFO and OAK. 511 pages its list (20 by default; /api/traffic/events keeps only that
 * first page). This reads every page, bodies included, inside one deadline, or fails: a partial
 * list could hide the incident that matters. Records it can't read are counted in `unreadable`.
 */
import { json } from '@sveltejs/kit';
import { get511ApiKey } from '$lib/server/api-keys';
import { log511Read, readPage } from '$lib/server/upstream-511';
import { corridorEvents } from '$lib/traffic/corridors';

const FIRST_PAGE = '/traffic/events?format=json&limit=500';
const MAX_PAGES = 5;
/** The whole read, every page and body; the client allows 12 s (fetchTrafficCorridorsOrThrow). */
const DEADLINE_MS = 8_000;
const NO_STORE = { 'cache-control': 'no-store' };

export async function GET() {
	const key = get511ApiKey();
	if (!key) return json({ error: 'Service unavailable' }, { status: 503, headers: NO_STORE });
	const deadline = new AbortController();
	const timer = setTimeout(() => deadline.abort(), DEADLINE_MS);
	const events: unknown[] = [];
	let path: string | null = FIRST_PAGE;
	try {
		for (let pages = 0; path !== null && pages < MAX_PAGES; pages++) {
			const started = Date.now();
			const read = await readPage(path, key, deadline.signal);
			log511Read('traffic/corridors', read, Date.now() - started);
			if (!read.ok)
				return json(
					{ error: 'Traffic events unavailable', upstreamStatus: read.status },
					{ status: 502, headers: NO_STORE }
				);
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
