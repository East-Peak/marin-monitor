import { json } from '@sveltejs/kit';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { parseHeadingFeed, type HeadingRead } from '$lib/dashboard/cam-heading';
import type { RequestHandler } from './$types';

/** ALERTCalifornia's public camera list (~2.8 MB): every camera's last azimuth and frame time. */
const FEED = 'https://cameras.alertcalifornia.org/public-camera-data/all_cameras-v3.json';

/** Our Marin cameras' last reported headings (MAPX4). A feed we can't read is 503, never empty. */
export const GET: RequestHandler = async () => {
	try {
		const res = await fetchWithTimeout(FEED, { headers: { Accept: 'application/json' } });
		if (!res.ok) throw new Error(`ALERTCalifornia feed HTTP ${res.status}`);
		const read: HeadingRead = { headingAt: Date.now(), cams: parseHeadingFeed(await res.json()) };
		return json(read, { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30' } });
	} catch (error) {
		return json(
			{ error: (error as Error).message },
			{ status: 503, headers: { 'Cache-Control': 'no-store' } }
		);
	}
};
