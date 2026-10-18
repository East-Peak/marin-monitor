/**
 * Getting Around's roads (v2 preview): 511's complete traffic event list, filtered to Marin and the
 * routes to SFO and OAK. 511 pages its list (20 by default; /api/traffic/events keeps only that
 * first page). This reads every page, bodies included, inside one deadline, or fails: a partial
 * list could hide the incident that matters. Records it can't read are counted in `unreadable`.
 */
import { json } from '@sveltejs/kit';
import { get511ApiKey } from '$lib/server/api-keys';
import { memo511, readPage } from '$lib/server/upstream-511';
import { corridorEvents } from '$lib/traffic/corridors';

const FIRST_PAGE = '/traffic/events?format=json&limit=500';
const MAX_PAGES = 5;
/** The whole read, every page and body; the client allows 12 s (fetchTrafficCorridorsOrThrow). */
const DEADLINE_MS = 8_000;
const NO_STORE = { 'cache-control': 'no-store' };
const CACHED = { 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=60' };
/** A read is held 60 s; a failure (sent no-store) for the CDN's window. Budget: upstream-511. */
const MEMO_MS = 60_000;
const FAILED_MS = 300_000;

type Outcome = { status: number; body: unknown };
/** Concurrent cold requests make one 511 read; any request within 60 s of it reads none. */
const memo = memo511<Outcome>((o) => (o.status === 200 ? MEMO_MS : FAILED_MS));

export async function GET() {
	const key = get511ApiKey();
	if (!key) return json({ error: 'Service unavailable' }, { status: 503, headers: NO_STORE });
	const { status, body } = await memo('traffic/corridors', () => readCorridors(key));
	return json(body, { status, headers: status === 200 ? CACHED : NO_STORE });
}

async function readCorridors(key: string): Promise<Outcome> {
	const deadline = new AbortController();
	const timer = setTimeout(() => deadline.abort(), DEADLINE_MS);
	const events: unknown[] = [];
	let path: string | null = FIRST_PAGE;
	try {
		for (let pages = 0; path !== null && pages < MAX_PAGES; pages++) {
			const read = await readPage(path, key, deadline.signal, 'traffic/corridors');
			if (!read.ok)
				return {
					status: 502,
					body: { error: 'Traffic events unavailable', upstreamStatus: read.status }
				};
			events.push(...read.events);
			path = read.next;
		}
	} finally {
		clearTimeout(timer);
	}
	if (path !== null) return { status: 502, body: { error: 'Traffic events incomplete' } };
	const checkedAt = new Date();
	const { events: kept, unreadable } = corridorEvents(events, checkedAt.getTime());
	return {
		status: 200,
		body: {
			checkedAt: checkedAt.toISOString(),
			upstreamCount: events.length,
			unreadable,
			events: kept
		}
	};
}
