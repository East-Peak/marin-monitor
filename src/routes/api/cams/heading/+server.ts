import { json } from '@sveltejs/kit';
import { parseHeadingFeed, type HeadingRead } from '$lib/dashboard/cam-heading';
import type { RequestHandler } from './$types';

/** ALERTCalifornia's public camera list (~2.8 MB): every camera's last azimuth and frame time. */
const FEED = 'https://cameras.alertcalifornia.org/public-camera-data/all_cameras-v3.json';
/** One deadline for headers and body: a stalled body is a 503 too (Codex MAPX4 #4). */
const DEADLINE_MS = 10_000;

/** Our Marin cameras' last reported headings (MAPX4). A feed we can't read is 503, never empty. */
export const GET: RequestHandler = async () => {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), DEADLINE_MS);
	try {
		const res = await fetch(FEED, { headers: { Accept: 'application/json' }, signal: ctl.signal });
		if (!res.ok) throw new Error(`ALERTCalifornia feed HTTP ${res.status}`);
		const read: HeadingRead = { headingAt: Date.now(), cams: parseHeadingFeed(await res.json()) };
		return json(read, { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30' } });
	} catch (error) {
		const reason = ctl.signal.aborted ? 'ALERTCalifornia feed timed out' : (error as Error).message;
		return json({ error: reason }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
	} finally {
		clearTimeout(timer);
	}
};
